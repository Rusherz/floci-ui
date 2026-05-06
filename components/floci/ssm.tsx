'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';

import { BoundedTextarea } from '@/components/floci/bounded-textarea';
import { CreateResourceDialog } from '@/components/floci/create-resource-dialog';
import { ServicePanelColumn } from '@/components/floci/service-panel-column';
import { ServiceShell } from '@/components/floci/service-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { createApiClient } from '@/lib/floci/api';
import { createApiConfig } from '@/lib/floci/config';
import { getCreateErrorMessage, isNonEmpty, logCreateAction } from '@/lib/floci/create-workflows';
import type { SsmParameterSummary } from '@/lib/floci/types';
import { cn } from '@/lib/utils';

const DEFAULT_CREATE_NAME = '/app/example';
const DEFAULT_CREATE_VALUE = '{\n  "enabled": true\n}';

export default function SsmPage() {
  const api = useMemo(() => createApiClient(createApiConfig()), []);

  const [parameters, setParameters] = useState<SsmParameterSummary[]>([]);
  const [selectedName, setSelectedName] = useState('');
  const [selectedValue, setSelectedValue] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [createType, setCreateType] = useState<'String' | 'SecureString'>('String');
  const [createDescription, setCreateDescription] = useState('');
  const [createTier, setCreateTier] = useState<'Standard' | 'Advanced' | 'Intelligent-Tiering'>('Standard');
  const [createValue, setCreateValue] = useState(DEFAULT_CREATE_VALUE);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<{ type: 'info' | 'error' | null; message: string }>({ type: null, message: '' });
  const [loading, setLoading] = useState(false);

  const selectedParameter = useMemo(() => parameters.find((parameter) => parameter.name === selectedName) || null, [parameters, selectedName]);

  const loadParameters = useCallback(async () => {
    setLoading(true);
    try {
      const next = await api.listSsmParameters();
      setParameters(next);
      setSelectedName((current) => (current && next.some((p) => p.name === current) ? current : next[0]?.name || ''));
      setStatus({ type: 'info', message: `Loaded ${next.length} parameter(s).` });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to load parameters' });
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadParameters();
  }, [loadParameters]);

  useEffect(() => {
    if (!selectedName) {
      setSelectedValue('');
      return;
    }

    void (async () => {
      try {
        const value = await api.getSsmParameter(selectedName);
        setSelectedValue(value);
      } catch (error) {
        setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to get parameter value' });
      }
    })();
  }, [api, selectedName]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return parameters;
    return parameters.filter((p) => p.name.toLowerCase().includes(q));
  }, [parameters, search]);

  const createParameter = useCallback(async (nameRaw: string) => {
    const name = nameRaw.trim();
    if (!isNonEmpty(name)) {
      setCreateError('Parameter name is required.');
      return;
    }

    setCreating(true);
    setCreateError('');
    logCreateAction('ssm-parameter', 'start', { name, type: createType, tier: createTier });
    try {
      const version = await api.putSsmParameter(name, createValue, createType, {
        description: createDescription.trim(),
        tier: createTier,
      });
      await loadParameters();
      setSelectedName(name);
      setCreateOpen(false);
      setStatus({ type: 'info', message: `Created ${name} (v${version}).` });
      logCreateAction('ssm-parameter', 'success', { name, version });
    } catch (error) {
      logCreateAction('ssm-parameter', 'error', { name, error: error instanceof Error ? error.message : String(error) });
      setCreateError(getCreateErrorMessage(error, 'Failed to create parameter'));
    } finally {
      setCreating(false);
    }
  }, [api, createDescription, createTier, createType, createValue, loadParameters]);

  const updateSelectedParameter = useCallback(async () => {
    if (!selectedName) {
      setStatus({ type: 'error', message: 'Select a parameter first.' });
      return;
    }

    const selectedType = selectedParameter?.type === 'SecureString' ? 'SecureString' : 'String';

    setLoading(true);
    logCreateAction('ssm-parameter', 'start', { name: selectedName, mode: 'update', type: selectedType });
    try {
      const version = await api.putSsmParameter(selectedName, selectedValue, selectedType);
      setStatus({ type: 'info', message: `Updated ${selectedName} (v${version}).` });
      logCreateAction('ssm-parameter', 'success', { name: selectedName, version, mode: 'update' });
      await loadParameters();
    } catch (error) {
      logCreateAction('ssm-parameter', 'error', { name: selectedName, mode: 'update', error: error instanceof Error ? error.message : String(error) });
      setStatus({ type: 'error', message: getCreateErrorMessage(error, 'Failed to update parameter') });
    } finally {
      setLoading(false);
    }
  }, [api, loadParameters, selectedName, selectedParameter?.type, selectedValue]);

  const openCreateDialog = useCallback(() => {
    setCreateType('String');
    setCreateDescription('');
    setCreateTier('Standard');
    setCreateValue(DEFAULT_CREATE_VALUE);
    setCreateError('');
    setCreateOpen(true);
  }, []);

  return (
    <ServiceShell
      activeSlug='ssm'
      title='SSM Parameter Store'
      description='Parameter list, value inspection, and write/update actions.'
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder='Search parameters...'
      onRefresh={() => void loadParameters()}
      refreshDisabled={loading}
      status={status}
    >
      <Card className='min-h-0 min-w-0 rounded-md shadow-none xl:flex xl:h-full xl:flex-col xl:overflow-hidden'>
        <CardHeader>
          <div className='flex items-center justify-between gap-2'>
            <CardTitle className='text-base'>Parameters ({filtered.length})</CardTitle>
            <Button
              size='icon'
              className='size-9'
              onClick={openCreateDialog}
              aria-label='Create parameter'
              title='Create parameter'
            >
              <Plus className='size-4' />
            </Button>
          </div>
        </CardHeader>
        <CardContent className='xl:min-h-0 xl:flex-1'>
          {!filtered.length ? (
            <p className='text-sm text-muted-foreground'>No parameters found.</p>
          ) : (
            <div className='flex max-h-[560px] flex-col gap-2 overflow-auto pr-1 xl:h-full xl:max-h-none xl:min-h-0'>
              {filtered.map((parameter) => {
                const active = parameter.name === selectedName;
                return (
                  <button
                    key={parameter.name}
                    type='button'
                    onClick={() => setSelectedName(parameter.name)}
                    className={cn('w-full rounded-md border px-3 py-2 text-left text-sm transition', active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-accent')}
                  >
                    <div className='truncate font-medium'>{parameter.name}</div>
                    <p className={cn('mt-1 truncate text-xs', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{parameter.type}</p>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ServicePanelColumn rowsClassName='lg:grid-rows-[minmax(0,1fr)_auto]'>
        <Card className='min-h-0 min-w-0 rounded-md shadow-none lg:flex lg:h-full lg:flex-col lg:overflow-hidden'>
          <CardHeader>
            <CardTitle className='text-base'>Parameter Value</CardTitle>
          </CardHeader>
          <CardContent className='min-h-0 lg:flex-1'>
            <BoundedTextarea value={selectedValue} onChange={(event) => setSelectedValue(event.target.value)} className='font-mono' minHeightClassName='min-h-[220px]' maxHeightClassName='max-h-[56vh]' disabled={!selectedName} />
          </CardContent>
        </Card>

        <Card className='min-h-[220px] min-w-0 rounded-md shadow-none'>
          <CardHeader>
            <CardTitle className='text-base'>Update Selected</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-3'>
            <Input value={selectedName || ''} disabled placeholder='Select a parameter' />
            <Button onClick={() => void updateSelectedParameter()} disabled={loading || !selectedName.trim()}>
              Save Parameter
            </Button>
          </CardContent>
        </Card>
      </ServicePanelColumn>

      <CreateResourceDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreateError('');
        }}
        title='Create SSM Parameter'
        description='Create a new parameter in local Floci.'
        label='Parameter Name'
        placeholder='Parameter name (e.g. /app/config)'
        confirmLabel='Create Parameter'
        submitting={creating}
        initialValue={DEFAULT_CREATE_NAME}
        errorMessage={createError}
        onSubmit={createParameter}
      >
        <div className='grid gap-3'>
          <Input value={createDescription} onChange={(event) => setCreateDescription(event.target.value)} placeholder='Description (optional)' />
          <div className='grid gap-2 sm:grid-cols-2'>
            <div className='flex gap-2'>
              <Button type='button' variant={createType === 'String' ? 'default' : 'outline'} size='sm' onClick={() => setCreateType('String')}>
                String
              </Button>
              <Button type='button' variant={createType === 'SecureString' ? 'default' : 'outline'} size='sm' onClick={() => setCreateType('SecureString')}>
                SecureString
              </Button>
            </div>
            <div className='flex gap-2'>
              <Button type='button' variant={createTier === 'Standard' ? 'default' : 'outline'} size='sm' onClick={() => setCreateTier('Standard')}>
                Standard
              </Button>
              <Button type='button' variant={createTier === 'Advanced' ? 'default' : 'outline'} size='sm' onClick={() => setCreateTier('Advanced')}>
                Advanced
              </Button>
              <Button type='button' variant={createTier === 'Intelligent-Tiering' ? 'default' : 'outline'} size='sm' onClick={() => setCreateTier('Intelligent-Tiering')}>
                Intelligent
              </Button>
            </div>
          </div>
          <BoundedTextarea value={createValue} onChange={(event) => setCreateValue(event.target.value)} className='font-mono' minHeightClassName='min-h-[130px]' maxHeightClassName='max-h-[32vh]' />
        </div>
      </CreateResourceDialog>
    </ServiceShell>
  );
}
