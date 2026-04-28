'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { BoundedTextarea } from '@/components/floci/bounded-textarea';
import { ServicePanelColumn } from '@/components/floci/service-panel-column';
import { ServiceShell } from '@/components/floci/service-shell';
import { ScrollableCodeBlock } from '@/components/floci/scrollable-code-block';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createApiClient } from '@/lib/floci/api';
import { createApiConfig } from '@/lib/floci/config';
import type { SecretDetails, SecretSummary } from '@/lib/floci/types';
import { cn } from '@/lib/utils';

export default function SecretsManagerPage() {
  const api = useMemo(() => createApiClient(createApiConfig()), []);

  const [secrets, setSecrets] = useState<SecretSummary[]>([]);
  const [selectedSecretId, setSelectedSecretId] = useState('');
  const [details, setDetails] = useState<SecretDetails | null>(null);
  const [value, setValue] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<{ type: 'info' | 'error' | null; message: string }>({ type: null, message: '' });
  const [loading, setLoading] = useState(false);

  const loadSecrets = useCallback(async () => {
    setLoading(true);
    try {
      const next = await api.listSecrets();
      setSecrets(next);
      setSelectedSecretId((current) => (current && next.some((secret) => secret.arn === current || secret.name === current) ? current : next[0]?.arn || next[0]?.name || ''));
      setStatus({ type: 'info', message: `Loaded ${next.length} secret(s).` });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to load secrets' });
    } finally {
      setLoading(false);
    }
  }, [api]);

  const loadSelected = useCallback(async () => {
    if (!selectedSecretId) {
      setDetails(null);
      setValue('');
      return;
    }

    try {
      const [nextDetails, nextValue] = await Promise.all([api.describeSecret(selectedSecretId), api.getSecretValue(selectedSecretId)]);
      setDetails(nextDetails);
      setValue(nextValue);
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to load secret details' });
    }
  }, [api, selectedSecretId]);

  useEffect(() => {
    void loadSecrets();
  }, [loadSecrets]);

  useEffect(() => {
    void loadSelected();
  }, [loadSelected]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return secrets;
    return secrets.filter((secret) => secret.name.toLowerCase().includes(q));
  }, [search, secrets]);

  const saveValue = useCallback(async () => {
    if (!selectedSecretId) {
      setStatus({ type: 'error', message: 'Select a secret first.' });
      return;
    }

    setLoading(true);
    try {
      const versionId = await api.putSecretValue(selectedSecretId, value);
      setStatus({ type: 'info', message: `Stored new secret version ${versionId || ''}.` });
      await loadSelected();
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to update secret value' });
    } finally {
      setLoading(false);
    }
  }, [api, loadSelected, selectedSecretId, value]);

  return (
    <ServiceShell
      activeSlug='secrets-manager'
      title='Secrets Manager'
      description='Secret listing, version metadata, and value updates.'
      summaryCountLabel={`${secrets.length} secret(s)`}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder='Search secrets...'
      onRefresh={() => void loadSecrets()}
      refreshDisabled={loading}
      status={status}
    >
      <Card className='min-h-0 min-w-0 rounded-md shadow-none xl:flex xl:h-full xl:flex-col xl:overflow-hidden'>
        <CardHeader>
          <CardTitle className='text-base'>Secrets</CardTitle>
        </CardHeader>
        <CardContent className='xl:min-h-0 xl:flex-1'>
          {!filtered.length ? (
            <p className='text-sm text-muted-foreground'>No secrets found.</p>
          ) : (
            <div className='flex max-h-[560px] flex-col gap-2 overflow-auto pr-1 xl:h-full xl:max-h-none xl:min-h-0'>
              {filtered.map((secret) => {
                const id = secret.arn || secret.name;
                const active = id === selectedSecretId;
                return (
                  <button
                    key={id}
                    type='button'
                    onClick={() => setSelectedSecretId(id)}
                    className={cn('w-full rounded-md border px-3 py-2 text-left text-sm transition', active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-accent')}
                  >
                    <div className='truncate font-medium'>{secret.name}</div>
                    <p className={cn('mt-1 truncate text-xs', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{secret.description || 'No description'}</p>
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
            <CardTitle className='text-base'>Secret Detail</CardTitle>
          </CardHeader>
          <CardContent className='min-h-0 lg:flex-1 lg:overflow-hidden'>
            <ScrollableCodeBlock content={JSON.stringify(details, null, 2) || 'Select a secret.'} fillContainer />
          </CardContent>
        </Card>

        <Card className='min-h-[280px] min-w-0 rounded-md shadow-none'>
          <CardHeader>
            <CardTitle className='text-base'>Secret Value</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-3'>
            <BoundedTextarea value={value} onChange={(event) => setValue(event.target.value)} className='font-mono' minHeightClassName='min-h-[150px]' maxHeightClassName='max-h-[34vh]' />
            <Button onClick={() => void saveValue()} disabled={loading || !selectedSecretId}>
              Put Secret Value
            </Button>
          </CardContent>
        </Card>
      </ServicePanelColumn>
    </ServiceShell>
  );
}
