'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';

import { BoundedTextarea } from '@/components/floci/bounded-textarea';
import { CreateResourceDialog } from '@/components/floci/create-resource-dialog';
import { DetailSkeleton, ListSkeleton } from '@/components/floci/loading';
import { ServicePanelColumn } from '@/components/floci/service-panel-column';
import { ServiceShell } from '@/components/floci/service-shell';
import { ScrollableCodeBlock } from '@/components/floci/scrollable-code-block';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { filterBySearch } from '@/lib/floci/search';
import { selectableRowButtonClass, selectableRowMetaTextClass } from '@/lib/floci/button-styles';
import { EMPTY_SERVICE_STATUS, type ServiceStatus } from '@/lib/floci/service-ui';
import { useFlociApi } from '@/lib/floci/use-floci-api';
import { getCreateErrorMessage, isNonEmpty, logCreateAction, useOptimisticCreateRefresh } from '@/lib/floci/create-workflows';
import type { SecretDetails, SecretSummary } from '@/lib/floci/types';
import type { FlociElement } from '@/lib/floci/elements';

export default function SecretsManagerPage({ enabledElements }: { enabledElements: FlociElement[] }) {
  const api = useFlociApi();

  const [secrets, setSecrets] = useState<SecretSummary[]>([]);
  const [selectedSecretId, setSelectedSecretId] = useState('');
  const [details, setDetails] = useState<SecretDetails | null>(null);
  const [value, setValue] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ServiceStatus>(EMPTY_SERVICE_STATUS);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [hasLoadedSecrets, setHasLoadedSecrets] = useState(false);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [hasLoadedSelected, setHasLoadedSelected] = useState(false);

  const loadSecrets = useCallback(async () => {
    setLoading(true);
    try {
      const next = await api.listSecrets();
      setSecrets(next);
      setSelectedSecretId((current) => (current && next.some((secret) => secret.arn === current || secret.name === current) ? current : next[0]?.arn || next[0]?.name || ''));
      setStatus({ type: 'info', message: `Loaded ${next.length} secret(s).` });
      setHasLoadedSecrets(true);
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

    setSelectedLoading(true);
    try {
      const [nextDetails, nextValue] = await Promise.all([api.describeSecret(selectedSecretId), api.getSecretValue(selectedSecretId)]);
      setDetails(nextDetails);
      setValue(nextValue);
      setHasLoadedSelected(true);
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to load secret details' });
    } finally {
      setSelectedLoading(false);
    }
  }, [api, selectedSecretId]);

  useEffect(() => {
    void loadSecrets();
  }, [loadSecrets]);

  useEffect(() => {
    void loadSelected();
  }, [loadSelected]);

  const filtered = useMemo(() => filterBySearch(secrets, search, (secret) => secret.name), [search, secrets]);
  const isInitialSecretsLoading = loading && !hasLoadedSecrets;
  const isInitialSelectedLoading = selectedLoading && !hasLoadedSelected;

  const refreshSecretsOptimistically = useOptimisticCreateRefresh<SecretSummary>({
    upsert: (secret) => {
      setSecrets((current) => [secret, ...current.filter((candidate) => candidate.arn !== secret.arn && candidate.name !== secret.name)]);
      setSelectedSecretId(secret.arn || secret.name);
    },
    refresh: loadSecrets,
  });

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

  const createSecret = useCallback(
    async (nameRaw: string) => {
      const name = nameRaw.trim();
      if (!isNonEmpty(name) || !isNonEmpty(value)) {
        setCreateError('Secret name and value are required.');
        return;
      }
      setCreateError('');
      setCreating(true);
      logCreateAction('secret', 'start', { name });
      try {
        const arn = await api.createSecret(name, value, createDescription.trim());
        await refreshSecretsOptimistically({
          name,
          arn,
          description: createDescription.trim(),
          lastChangedDate: '',
        });
        setCreateOpen(false);
        setStatus({ type: 'info', message: `Created secret ${name}.` });
        logCreateAction('secret', 'success', { name, arn });
      } catch (error) {
        logCreateAction('secret', 'error', { name, error: error instanceof Error ? error.message : String(error) });
        setCreateError(getCreateErrorMessage(error, 'Failed to create secret'));
      } finally {
        setCreating(false);
      }
    },
    [api, createDescription, refreshSecretsOptimistically, value]
  );

  return (
    <ServiceShell
      enabledElements={enabledElements}
      activeSlug='secrets-manager'
      title='Secrets Manager'
      description='Secret listing, version metadata, and value updates.'
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder='Search secrets...'
      onRefresh={() => void loadSecrets()}
      refreshDisabled={loading}
      status={status}
    >
      <Card className='min-h-0 min-w-0 rounded-md shadow-none xl:flex xl:h-full xl:flex-col xl:overflow-hidden'>
        <CardHeader>
          <div className='flex items-center justify-between gap-2'>
            <CardTitle className='text-base'>Secrets ({filtered.length})</CardTitle>
            <Button variant='emphasis' size='icon' className='size-9' onClick={() => setCreateOpen(true)} aria-label='Create secret' title='Create secret'>
              <Plus className='size-4' />
            </Button>
          </div>
        </CardHeader>
        <CardContent className='xl:min-h-0 xl:flex-1'>
          {isInitialSecretsLoading ? (
            <ListSkeleton items={8} inline />
          ) : !filtered.length ? (
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
                    className={selectableRowButtonClass(active)}
                  >
                    <div className='truncate font-medium'>{secret.name}</div>
                    <p className={selectableRowMetaTextClass(active)}>{secret.description || 'No description'}</p>
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
            {isInitialSelectedLoading ? <DetailSkeleton lines={10} /> : <ScrollableCodeBlock content={JSON.stringify(details, null, 2) || 'Select a secret.'} fillContainer />}
          </CardContent>
        </Card>

        <Card className='min-h-[280px] min-w-0 rounded-md shadow-none'>
          <CardHeader>
            <CardTitle className='text-base'>Secret Value</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-3'>
            {isInitialSelectedLoading ? (
              <DetailSkeleton lines={7} />
            ) : (
              <BoundedTextarea value={value} onChange={(event) => setValue(event.target.value)} className='font-mono' minHeightClassName='min-h-[150px]' maxHeightClassName='max-h-[34vh]' />
            )}
            <Button variant='emphasis' onClick={() => void saveValue()} disabled={loading || !selectedSecretId}>
              Put Secret Value
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
        title='Create Secret'
        description='Create a new secret using the value currently in the Secret Value editor.'
        label='Secret Name'
        placeholder='my/secret'
        confirmLabel='Create Secret'
        submitting={creating}
        errorMessage={createError}
        onSubmit={createSecret}
      >
        <div className='grid gap-1'>
          <p className='text-xs text-muted-foreground'>Description (optional)</p>
          <Input value={createDescription} onChange={(event) => setCreateDescription(event.target.value)} />
        </div>
      </CreateResourceDialog>
    </ServiceShell>
  );
}
