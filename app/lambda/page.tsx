'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { BoundedTextarea } from '@/components/floci/bounded-textarea';
import { ServicePanelColumn } from '@/components/floci/service-panel-column';
import { ScrollableCodeBlock } from '@/components/floci/scrollable-code-block';
import { ServiceShell } from '@/components/floci/service-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createApiClient } from '@/lib/floci/api';
import { createApiConfig } from '@/lib/floci/config';
import type { LambdaFunctionSummary } from '@/lib/floci/types';
import { cn } from '@/lib/utils';

export default function LambdaPage() {
  const api = useMemo(() => createApiClient(createApiConfig()), []);

  const [functions, setFunctions] = useState<LambdaFunctionSummary[]>([]);
  const [selectedFunctionName, setSelectedFunctionName] = useState('');
  const [search, setSearch] = useState('');
  const [payload, setPayload] = useState('{\n  "ping": true\n}');
  const [invokeOutput, setInvokeOutput] = useState<unknown>(null);
  const [invokeLogs, setInvokeLogs] = useState('');
  const [status, setStatus] = useState<{ type: 'info' | 'error' | null; message: string }>({ type: null, message: '' });
  const [loading, setLoading] = useState(false);
  const [invoking, setInvoking] = useState(false);

  const loadFunctions = useCallback(async () => {
    setLoading(true);
    try {
      const nextFunctions = await api.listLambdaFunctions();
      setFunctions(nextFunctions);
      setSelectedFunctionName((current) => {
        if (current && nextFunctions.some((fn) => fn.name === current)) {
          return current;
        }
        return nextFunctions[0]?.name || '';
      });
      setStatus({ type: 'info', message: `Loaded ${nextFunctions.length} function(s).` });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to load Lambda functions' });
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadFunctions();
  }, [loadFunctions]);

  const filteredFunctions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return functions;
    return functions.filter((fn) => fn.name.toLowerCase().includes(query));
  }, [functions, search]);

  const selectedFunction = functions.find((fn) => fn.name === selectedFunctionName) || null;

  const invokeSelected = useCallback(async () => {
    if (!selectedFunctionName) {
      setStatus({ type: 'error', message: 'Select a function first.' });
      return;
    }

    try {
      JSON.parse(payload);
    } catch {
      setStatus({ type: 'error', message: 'Payload must be valid JSON.' });
      return;
    }

    setInvoking(true);
    try {
      const result = await api.invokeLambda(selectedFunctionName, payload);
      setInvokeOutput({
        statusCode: result.statusCode,
        functionError: result.functionError,
        result: result.result,
      });
      setInvokeLogs(result.logs || 'No logs returned.');
      setStatus({ type: result.functionError ? 'error' : 'info', message: result.functionError ? `Invocation returned function error: ${result.functionError}` : 'Invocation completed successfully.' });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to invoke function' });
    } finally {
      setInvoking(false);
    }
  }, [api, payload, selectedFunctionName]);

  return (
    <ServiceShell
      activeSlug='lambda'
      title='Lambda'
      description='Function list, test invoke, and basic logs output.'
      summaryCountLabel={`${functions.length} function(s)`}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder='Search functions...'
      onRefresh={() => void loadFunctions()}
      refreshDisabled={loading}
      status={status}
    >
            <Card className='min-h-0 min-w-0 rounded-md shadow-none xl:flex xl:h-full xl:flex-col xl:overflow-hidden'>
              <CardHeader>
                <CardTitle className='text-base'>Functions</CardTitle>
              </CardHeader>
              <CardContent className='xl:min-h-0 xl:flex-1'>
                {!filteredFunctions.length ? (
                  <p className='text-sm text-muted-foreground'>No functions found.</p>
                ) : (
                  <div className='flex max-h-[560px] flex-col gap-2 overflow-auto pr-1 xl:h-full xl:max-h-none xl:min-h-0'>
                    {filteredFunctions.map((fn) => {
                      const active = fn.name === selectedFunctionName;
                      return (
                        <button
                          key={fn.arn || fn.name}
                          type='button'
                          onClick={() => setSelectedFunctionName(fn.name)}
                          className={cn('w-full rounded-md border px-3 py-2 text-left text-sm transition', active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-accent')}
                        >
                          <div className='truncate font-medium'>{fn.name}</div>
                          <p className={cn('mt-1 truncate text-xs', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{fn.runtime}</p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <ServicePanelColumn rowsClassName='lg:grid-rows-[minmax(0,1fr)_auto_auto]'>
              <Card className='min-h-[320px] min-w-0 rounded-md shadow-none lg:flex lg:h-full lg:flex-col lg:overflow-hidden'>
                <CardHeader>
                  <div className='flex items-center justify-between gap-2'>
                    <CardTitle className='text-base'>Invoke</CardTitle>
                    <Button size='sm' onClick={() => void invokeSelected()} disabled={invoking || !selectedFunctionName}>
                      {invoking ? 'Invoking...' : 'Invoke'}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className='grid min-h-0 gap-3 lg:flex-1 lg:grid-rows-[auto_minmax(160px,1fr)]'>
                  <div className='rounded-md border bg-muted p-3 text-xs text-muted-foreground'>
                    {selectedFunction
                      ? `${selectedFunction.name} | ${selectedFunction.runtime} | ${selectedFunction.handler}`
                      : 'Select a function.'}
                  </div>
                  <BoundedTextarea
                    value={payload}
                    onChange={(event) => setPayload(event.target.value)}
                    className='font-mono'
                    minHeightClassName='min-h-[140px]'
                    maxHeightClassName='max-h-[38vh]'
                    placeholder='JSON payload'
                  />
                </CardContent>
              </Card>

              <Card className='min-h-[220px] min-w-0 rounded-md shadow-none lg:flex lg:flex-col'>
                <CardHeader>
                  <CardTitle className='text-base'>Invocation Result</CardTitle>
                </CardHeader>
                <CardContent className='min-h-0 lg:flex-1'>
                  <ScrollableCodeBlock
                    content={invokeOutput ? JSON.stringify(invokeOutput, null, 2) : 'Invoke a function to view output.'}
                    fillContainer
                  />
                </CardContent>
              </Card>

              <Card className='min-h-[180px] min-w-0 rounded-md shadow-none lg:flex lg:flex-col'>
                <CardHeader>
                  <CardTitle className='text-base'>Logs</CardTitle>
                </CardHeader>
                <CardContent className='min-h-0 lg:flex-1'>
                  <ScrollableCodeBlock content={invokeLogs || 'Invoke a function to view log output.'} fillContainer />
                </CardContent>
              </Card>
            </ServicePanelColumn>
    </ServiceShell>
  );
}
