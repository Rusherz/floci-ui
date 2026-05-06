'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';

import { CreateResourceDialog } from '@/components/floci/create-resource-dialog';
import { ServicePanelColumn } from '@/components/floci/service-panel-column';
import { ScrollableCodeBlock } from '@/components/floci/scrollable-code-block';
import { ServiceShell } from '@/components/floci/service-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { filterBySearch } from '@/lib/floci/search';
import { EMPTY_SERVICE_STATUS, type ServiceStatus } from '@/lib/floci/service-ui';
import { useFlociApi } from '@/lib/floci/use-floci-api';
import { getCreateErrorMessage, isNonEmpty, logCreateAction, useOptimisticCreateRefresh } from '@/lib/floci/create-workflows';
import type { DynamoTableDescription, DynamoTableSummary } from '@/lib/floci/types';
import { cn } from '@/lib/utils';

export default function DynamoDbPage() {
  const api = useFlociApi();

  const [tables, setTables] = useState<DynamoTableSummary[]>([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [description, setDescription] = useState<DynamoTableDescription | null>(null);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [search, setSearch] = useState('');
  const [queryValue, setQueryValue] = useState('');
  const [status, setStatus] = useState<ServiceStatus>(EMPTY_SERVICE_STATUS);
  const [loading, setLoading] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [partitionKey, setPartitionKey] = useState('id');
  const [sortKey, setSortKey] = useState('');
  const [billingMode, setBillingMode] = useState<'PAY_PER_REQUEST' | 'PROVISIONED'>('PAY_PER_REQUEST');
  const [readCapacityUnits, setReadCapacityUnits] = useState('5');
  const [writeCapacityUnits, setWriteCapacityUnits] = useState('5');

  const loadTables = useCallback(async () => {
    setLoading(true);
    try {
      const nextTables = await api.loadDynamoTables();
      setTables(nextTables);
      setSelectedTable((current) => {
        if (current && nextTables.some((table) => table.name === current)) {
          return current;
        }
        return nextTables[0]?.name || '';
      });
      setStatus({ type: 'info', message: `Loaded ${nextTables.length} table(s).` });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to load DynamoDB tables' });
    } finally {
      setLoading(false);
    }
  }, [api]);

  const loadTableData = useCallback(
    async (tableName: string) => {
      if (!tableName) {
        setDescription(null);
        setItems([]);
        return;
      }

      setItemsLoading(true);
      try {
        const [nextDescription, nextItems] = await Promise.all([api.describeDynamoTable(tableName), api.scanDynamoTable(tableName, 25)]);
        setDescription(nextDescription);
        setItems(nextItems);
      } catch (error) {
        setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to load table details' });
      } finally {
        setItemsLoading(false);
      }
    },
    [api]
  );

  useEffect(() => {
    void loadTables();
  }, [loadTables]);

  useEffect(() => {
    void loadTableData(selectedTable);
  }, [loadTableData, selectedTable]);

  const filteredTables = useMemo(() => filterBySearch(tables, search, (table) => table.name), [search, tables]);

  const refreshTablesOptimistically = useOptimisticCreateRefresh<DynamoTableSummary>({
    upsert: (table) => {
      setTables((current) => [table, ...current.filter((candidate) => candidate.name !== table.name)]);
      setSelectedTable(table.name);
    },
    refresh: loadTables,
  });

  const handleScan = useCallback(async () => {
    if (!selectedTable) return;

    setItemsLoading(true);
    try {
      const nextItems = await api.scanDynamoTable(selectedTable, 25);
      setItems(nextItems);
      setStatus({ type: 'info', message: `Scanned ${nextItems.length} item(s).` });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Scan failed' });
    } finally {
      setItemsLoading(false);
    }
  }, [api, selectedTable]);

  const handleQuery = useCallback(async () => {
    if (!selectedTable || !description) return;

    const partitionKey = description.keySchema.find((key) => key.type === 'HASH');
    if (!partitionKey) {
      setStatus({ type: 'error', message: 'No HASH key found for this table.' });
      return;
    }

    if (!queryValue.trim()) {
      setStatus({ type: 'error', message: 'Provide a partition key value first.' });
      return;
    }

    setItemsLoading(true);
    try {
      const numeric = Number(queryValue.trim());
      const keyType: 'S' | 'N' = Number.isFinite(numeric) && queryValue.trim() === String(numeric) ? 'N' : 'S';
      const nextItems = await api.queryDynamoTableByPartitionKey(selectedTable, partitionKey.name, keyType, queryValue.trim(), 25);
      setItems(nextItems);
      setStatus({ type: 'info', message: `Query returned ${nextItems.length} item(s).` });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Query failed' });
    } finally {
      setItemsLoading(false);
    }
  }, [api, description, queryValue, selectedTable]);

  const createTable = useCallback(
    async (nameRaw: string) => {
      const tableName = nameRaw.trim();
      if (!isNonEmpty(tableName) || !isNonEmpty(partitionKey)) {
        setCreateError('Table name and partition key are required.');
        return;
      }
      const readUnits = Number(readCapacityUnits.trim());
      const writeUnits = Number(writeCapacityUnits.trim());
      if (billingMode === 'PROVISIONED' && (!Number.isFinite(readUnits) || readUnits < 1 || !Number.isFinite(writeUnits) || writeUnits < 1)) {
        setCreateError('Provisioned mode requires Read/Write capacity units of at least 1.');
        return;
      }
      setCreateError('');
      setCreating(true);
      logCreateAction('dynamodb-table', 'start', { tableName, billingMode });
      try {
        await api.createDynamoTable(tableName, partitionKey.trim(), sortKey.trim(), {
          billingMode,
          readCapacityUnits: Math.floor(readUnits),
          writeCapacityUnits: Math.floor(writeUnits),
        });
        await refreshTablesOptimistically({ name: tableName });
        setCreateOpen(false);
        setStatus({ type: 'info', message: `Created table ${tableName}.` });
        logCreateAction('dynamodb-table', 'success', { tableName, billingMode });
      } catch (error) {
        logCreateAction('dynamodb-table', 'error', { tableName, billingMode, error: error instanceof Error ? error.message : String(error) });
        setCreateError(getCreateErrorMessage(error, 'Failed to create table'));
      } finally {
        setCreating(false);
      }
    },
    [api, billingMode, partitionKey, readCapacityUnits, refreshTablesOptimistically, sortKey, writeCapacityUnits]
  );

  return (
    <ServiceShell
      activeSlug='dynamodb'
      title='DynamoDB'
      description='Table browsing, item explorer, and query/scan actions.'
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder='Search tables...'
      onRefresh={() => void loadTables()}
      refreshDisabled={loading}
      status={status}
    >
            <Card className='min-h-0 min-w-0 rounded-md shadow-none xl:flex xl:h-full xl:flex-col xl:overflow-hidden'>
              <CardHeader>
                <div className='flex items-center justify-between gap-2'>
                  <CardTitle className='text-base'>Tables ({filteredTables.length})</CardTitle>
                  <Button size='icon' className='size-9' onClick={() => setCreateOpen(true)} aria-label='Create table' title='Create table'>
                    <Plus className='size-4' />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className='xl:min-h-0 xl:flex-1'>
                {!filteredTables.length ? (
                  <p className='text-sm text-muted-foreground'>No tables found.</p>
                ) : (
                  <div className='flex max-h-[560px] flex-col gap-2 overflow-auto pr-1 xl:h-full xl:max-h-none xl:min-h-0'>
                    {filteredTables.map((table) => {
                      const active = table.name === selectedTable;
                      return (
                        <button
                          key={table.name}
                          type='button'
                          onClick={() => setSelectedTable(table.name)}
                          className={cn('w-full rounded-md border px-3 py-2 text-left text-sm transition', active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-accent')}
                        >
                          {table.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <ServicePanelColumn rowsClassName='lg:grid-rows-[minmax(0,2fr)_minmax(0,1fr)]'>
              <Card className='min-h-[320px] min-w-0 rounded-md shadow-none lg:flex lg:h-full lg:flex-col lg:overflow-hidden'>
                <CardHeader>
                  <div className='flex items-center justify-between gap-2'>
                    <CardTitle className='text-base'>Items</CardTitle>
                    <div className='flex gap-2'>
                      <Button variant='outline' size='sm' onClick={() => void handleScan()} disabled={itemsLoading || !selectedTable}>
                        Scan
                      </Button>
                      <Button size='sm' onClick={() => void handleQuery()} disabled={itemsLoading || !selectedTable || !queryValue.trim()}>
                        Query
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className='grid min-h-0 gap-3 lg:flex-1 lg:grid-rows-[auto_minmax(0,1fr)] lg:overflow-hidden'>
                  <div className='grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]'>
                    <Input value={queryValue} onChange={(event) => setQueryValue(event.target.value)} placeholder='Partition key value for query' />
                    <Badge variant='outline' className='justify-center'>
                      {description?.keySchema.find((key) => key.type === 'HASH')?.name || 'No HASH key'}
                    </Badge>
                  </div>

                  {itemsLoading ? <p className='text-sm text-muted-foreground'>Loading items...</p> : <ScrollableCodeBlock content={JSON.stringify(items, null, 2)} fillContainer />}
                </CardContent>
              </Card>

              <Card className='min-h-[220px] min-w-0 rounded-md shadow-none lg:flex lg:flex-col'>
                <CardHeader>
                  <CardTitle className='text-base'>Table Detail</CardTitle>
                </CardHeader>
                <CardContent>
                  {description ? (
                    <ScrollableCodeBlock content={JSON.stringify(description, null, 2)} minHeightClassName='min-h-[140px]' maxHeightClassName='max-h-[28vh]' />
                  ) : (
                    <p className='text-sm text-muted-foreground'>Select a table.</p>
                  )}
                </CardContent>
              </Card>
            </ServicePanelColumn>
            <CreateResourceDialog
              open={createOpen}
              onOpenChange={(open) => {
                setCreateOpen(open);
                if (!open) setCreateError('');
              }}
              title='Create DynamoDB Table'
              description='Create a new table with string keys.'
              label='Table Name'
              placeholder='my-table'
              confirmLabel='Create Table'
              submitting={creating}
              errorMessage={createError}
              onSubmit={createTable}
            >
              <div className='grid gap-2 rounded-md border p-3'>
                <div className='grid gap-1 sm:grid-cols-2'>
                  <div className='grid gap-1'>
                    <p className='text-xs text-muted-foreground'>Partition Key</p>
                    <Input value={partitionKey} onChange={(event) => setPartitionKey(event.target.value)} />
                  </div>
                  <div className='grid gap-1'>
                    <p className='text-xs text-muted-foreground'>Sort Key (optional)</p>
                    <Input value={sortKey} onChange={(event) => setSortKey(event.target.value)} />
                  </div>
                </div>
                <div className='grid gap-1'>
                  <p className='text-xs text-muted-foreground'>Billing Mode</p>
                  <div className='grid grid-cols-2 gap-2'>
                    <Button
                      type='button'
                      size='sm'
                      variant={billingMode === 'PAY_PER_REQUEST' ? 'default' : 'outline'}
                      onClick={() => setBillingMode('PAY_PER_REQUEST')}
                    >
                      PAY_PER_REQUEST
                    </Button>
                    <Button
                      type='button'
                      size='sm'
                      variant={billingMode === 'PROVISIONED' ? 'default' : 'outline'}
                      onClick={() => setBillingMode('PROVISIONED')}
                    >
                      PROVISIONED
                    </Button>
                  </div>
                </div>
                {billingMode === 'PROVISIONED' ? (
                  <div className='grid gap-1 sm:grid-cols-2'>
                    <div className='grid gap-1'>
                      <p className='text-xs text-muted-foreground'>Read Capacity Units</p>
                      <Input value={readCapacityUnits} onChange={(event) => setReadCapacityUnits(event.target.value)} inputMode='numeric' />
                    </div>
                    <div className='grid gap-1'>
                      <p className='text-xs text-muted-foreground'>Write Capacity Units</p>
                      <Input value={writeCapacityUnits} onChange={(event) => setWriteCapacityUnits(event.target.value)} inputMode='numeric' />
                    </div>
                  </div>
                ) : null}
              </div>
            </CreateResourceDialog>
    </ServiceShell>
  );
}
