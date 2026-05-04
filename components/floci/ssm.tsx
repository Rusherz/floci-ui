'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { BoundedTextarea } from '@/components/floci/bounded-textarea';
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

export default function SsmPage() {
  const api = useMemo(() => createApiClient(createApiConfig()), []);

  const [parameters, setParameters] = useState<SsmParameterSummary[]>([]);
  const [selectedName, setSelectedName] = useState('');
  const [selectedValue, setSelectedValue] = useState('');
  const [newName, setNewName] = useState('/app/example');
  const [newValue, setNewValue] = useState('{\n  "enabled": true\n}');
  const [newType, setNewType] = useState<'String' | 'SecureString'>('String');
  const [newDescription, setNewDescription] = useState('');
  const [newTier, setNewTier] = useState<'Standard' | 'Advanced' | 'Intelligent-Tiering'>('Standard');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<{ type: 'info' | 'error' | null; message: string }>({ type: null, message: '' });
  const [loading, setLoading] = useState(false);

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

  const saveParameter = useCallback(async () => {
    if (!isNonEmpty(newName)) {
      setStatus({ type: 'error', message: 'Parameter name is required.' });
      return;
    }

    setLoading(true);
    logCreateAction('ssm-parameter', 'start', { name: newName.trim(), type: newType, tier: newTier });
    try {
      const version = await api.putSsmParameter(newName.trim(), newValue, newType, {
        description: newDescription.trim(),
        tier: newTier,
      });
      setStatus({ type: 'info', message: `Saved ${newName.trim()} (v${version}).` });
      await loadParameters();
      setSelectedName(newName.trim());
      logCreateAction('ssm-parameter', 'success', { name: newName.trim(), version });
    } catch (error) {
      logCreateAction('ssm-parameter', 'error', { name: newName.trim(), error: error instanceof Error ? error.message : String(error) });
      setStatus({ type: 'error', message: getCreateErrorMessage(error, 'Failed to save parameter') });
    } finally {
      setLoading(false);
    }
  }, [api, loadParameters, newDescription, newName, newTier, newType, newValue]);

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
          <CardTitle className='text-base'>Parameters ({filtered.length})</CardTitle>
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
            <BoundedTextarea value={selectedValue} onChange={(event) => setSelectedValue(event.target.value)} className='font-mono' minHeightClassName='min-h-[220px]' maxHeightClassName='max-h-[56vh]' disabled />
          </CardContent>
        </Card>

        <Card className='min-h-[280px] min-w-0 rounded-md shadow-none'>
          <CardHeader>
            <CardTitle className='text-base'>Create or Update</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-3'>
            <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder='Parameter name (e.g. /app/config)' />
            <Input value={newDescription} onChange={(event) => setNewDescription(event.target.value)} placeholder='Description (optional)' />
            <div className='grid gap-2 sm:grid-cols-2'>
              <div className='flex gap-2'>
                <Button type='button' variant={newType === 'String' ? 'default' : 'outline'} size='sm' onClick={() => setNewType('String')}>
                  String
                </Button>
                <Button type='button' variant={newType === 'SecureString' ? 'default' : 'outline'} size='sm' onClick={() => setNewType('SecureString')}>
                  SecureString
                </Button>
              </div>
              <div className='flex gap-2'>
                <Button type='button' variant={newTier === 'Standard' ? 'default' : 'outline'} size='sm' onClick={() => setNewTier('Standard')}>
                  Standard
                </Button>
                <Button type='button' variant={newTier === 'Advanced' ? 'default' : 'outline'} size='sm' onClick={() => setNewTier('Advanced')}>
                  Advanced
                </Button>
                <Button type='button' variant={newTier === 'Intelligent-Tiering' ? 'default' : 'outline'} size='sm' onClick={() => setNewTier('Intelligent-Tiering')}>
                  Intelligent
                </Button>
              </div>
            </div>
            <BoundedTextarea value={newValue} onChange={(event) => setNewValue(event.target.value)} className='font-mono' minHeightClassName='min-h-[130px]' maxHeightClassName='max-h-[32vh]' />
            <Button onClick={() => void saveParameter()} disabled={loading || !newName.trim()}>
              Save Parameter
            </Button>
          </CardContent>
        </Card>
      </ServicePanelColumn>
    </ServiceShell>
  );
}
