'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';

import { BoundedTextarea } from '@/components/floci/bounded-textarea';
import { CreateResourceDialog } from '@/components/floci/create-resource-dialog';
import { ServicePanelColumn } from '@/components/floci/service-panel-column';
import { ServiceShell } from '@/components/floci/service-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { filterBySearch } from '@/lib/floci/search';
import { EMPTY_SERVICE_STATUS, type ServiceStatus } from '@/lib/floci/service-ui';
import { useFlociApi } from '@/lib/floci/use-floci-api';
import { getCreateErrorMessage, isNonEmpty, logCreateAction } from '@/lib/floci/create-workflows';
import type { SsmParameterSummary } from '@/lib/floci/types';
import { cn } from '@/lib/utils';

const DEFAULT_CREATE_NAME = '/app/example';
const DEFAULT_CREATE_VALUE = '{\n  "enabled": true\n}';
type SsmParameterType = 'String' | 'SecureString';
type SsmParameterTier = 'Standard' | 'Advanced' | 'Intelligent-Tiering';

type SsmParameterOptionsFieldsProps = {
  description: string;
  onDescriptionChange: (value: string) => void;
  type: SsmParameterType;
  onTypeChange: (next: SsmParameterType) => void;
  typeLocked?: boolean;
  tier: SsmParameterTier;
  onTierChange: (next: SsmParameterTier) => void;
  disabled?: boolean;
};

function SsmParameterOptionsFields({
  description,
  onDescriptionChange,
  type,
  onTypeChange,
  typeLocked = false,
  tier,
  onTierChange,
  disabled = false,
}: SsmParameterOptionsFieldsProps) {
  return (
    <div className='grid gap-3'>
      <Input value={description} onChange={(event) => onDescriptionChange(event.target.value)} placeholder='Description (optional)' disabled={disabled} />
      <div className='grid gap-2 sm:grid-cols-2'>
        <div className='flex gap-2'>
          <Button type='button' variant={type === 'String' ? 'default' : 'outline'} size='sm' onClick={() => onTypeChange('String')} disabled={disabled || typeLocked}>
            String
          </Button>
          <Button type='button' variant={type === 'SecureString' ? 'default' : 'outline'} size='sm' onClick={() => onTypeChange('SecureString')} disabled={disabled || typeLocked}>
            SecureString
          </Button>
        </div>
        <div className='flex gap-2'>
          <Button type='button' variant={tier === 'Standard' ? 'default' : 'outline'} size='sm' onClick={() => onTierChange('Standard')} disabled={disabled}>
            Standard
          </Button>
          <Button type='button' variant={tier === 'Advanced' ? 'default' : 'outline'} size='sm' onClick={() => onTierChange('Advanced')} disabled={disabled}>
            Advanced
          </Button>
          <Button type='button' variant={tier === 'Intelligent-Tiering' ? 'default' : 'outline'} size='sm' onClick={() => onTierChange('Intelligent-Tiering')} disabled={disabled}>
            Intelligent
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function SsmPage() {
  const api = useFlociApi();

  const [parameters, setParameters] = useState<SsmParameterSummary[]>([]);
  const [selectedName, setSelectedName] = useState('');
  const [selectedValue, setSelectedValue] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [createType, setCreateType] = useState<SsmParameterType>('String');
  const [createDescription, setCreateDescription] = useState('');
  const [createTier, setCreateTier] = useState<SsmParameterTier>('Standard');
  const [createValue, setCreateValue] = useState(DEFAULT_CREATE_VALUE);
  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState('');
  const [updating, setUpdating] = useState(false);
  const [editDescription, setEditDescription] = useState('');
  const [editTier, setEditTier] = useState<SsmParameterTier>('Standard');
  const [editValue, setEditValue] = useState('');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ServiceStatus>(EMPTY_SERVICE_STATUS);
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

  const filtered = useMemo(() => filterBySearch(parameters, search, (parameter) => parameter.name), [parameters, search]);

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

    setUpdating(true);
    setEditError('');
    logCreateAction('ssm-parameter', 'start', { name: selectedName, mode: 'update', type: selectedType });
    try {
      const version = await api.putSsmParameter(selectedName, editValue, selectedType, {
        description: editDescription.trim(),
        tier: editTier,
      });
      setStatus({ type: 'info', message: `Updated ${selectedName} (v${version}).` });
      logCreateAction('ssm-parameter', 'success', { name: selectedName, version, mode: 'update' });
      setSelectedValue(editValue);
      setEditOpen(false);
      await loadParameters();
    } catch (error) {
      logCreateAction('ssm-parameter', 'error', { name: selectedName, mode: 'update', error: error instanceof Error ? error.message : String(error) });
      setEditError(getCreateErrorMessage(error, 'Failed to update parameter'));
    } finally {
      setUpdating(false);
    }
  }, [api, editDescription, editTier, editValue, loadParameters, selectedName, selectedParameter?.type]);

  const openCreateDialog = useCallback(() => {
    setCreateType('String');
    setCreateDescription('');
    setCreateTier('Standard');
    setCreateValue(DEFAULT_CREATE_VALUE);
    setCreateError('');
    setCreateOpen(true);
  }, []);

  const openEditDialogFor = useCallback(async (name: string) => {
    const targetName = name.trim();
    if (!targetName) return;
    setSelectedName(targetName);
    setEditError('');
    setEditDescription('');
    setEditTier('Standard');
    try {
      const value = await api.getSsmParameter(targetName);
      setSelectedValue(value);
      setEditValue(value);
      setEditOpen(true);
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to get parameter value' });
    }
  }, [api]);

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
                  <div
                    key={parameter.name}
                    className={cn('flex items-start gap-2 rounded-md border p-2 transition', active ? 'border-primary bg-primary/5' : 'border-border bg-background hover:bg-accent/40')}
                  >
                    <button
                      type='button'
                      onClick={() => setSelectedName(parameter.name)}
                      className={cn('min-w-0 flex-1 rounded-md px-1 py-1 text-left text-sm transition', active ? 'text-primary' : '')}
                    >
                      <div className='truncate font-medium'>{parameter.name}</div>
                      <p className={cn('mt-1 truncate text-xs', active ? 'text-primary/80' : 'text-muted-foreground')}>{parameter.type}</p>
                    </button>
                    <Button
                      type='button'
                      size='icon'
                      variant='outline'
                      className='size-8 shrink-0'
                      onClick={() => void openEditDialogFor(parameter.name)}
                      aria-label={`Edit parameter ${parameter.name}`}
                      title='Edit parameter'
                    >
                      <Pencil className='size-4' />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ServicePanelColumn rowsClassName='lg:grid-rows-[minmax(0,1fr)]'>
        <Card className='min-h-0 min-w-0 rounded-md shadow-none lg:flex lg:h-full lg:flex-col lg:overflow-hidden'>
          <CardHeader>
            <CardTitle className='text-base'>Parameter Value</CardTitle>
          </CardHeader>
          <CardContent className='min-h-0 lg:flex-1'>
            <BoundedTextarea value={selectedValue} onChange={(event) => setSelectedValue(event.target.value)} className='font-mono' minHeightClassName='min-h-[220px]' maxHeightClassName='max-h-[56vh]' disabled />
          </CardContent>
        </Card>
      </ServicePanelColumn>

      <CreateResourceDialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) setEditError('');
        }}
        title='Update SSM Parameter'
        description='Update the selected parameter value and metadata.'
        label='Parameter Name'
        placeholder='Select a parameter'
        confirmLabel='Update Parameter'
        submittingLabel='Updating...'
        submitting={updating}
        initialValue={selectedName}
        inputDisabled
        errorMessage={editError}
        submitDisabled={!selectedName.trim()}
        onSubmit={() => void updateSelectedParameter()}
      >
        <div className='grid gap-3'>
          <SsmParameterOptionsFields
            description={editDescription}
            onDescriptionChange={setEditDescription}
            type={selectedParameter?.type === 'SecureString' ? 'SecureString' : 'String'}
            onTypeChange={() => undefined}
            typeLocked
            tier={editTier}
            onTierChange={setEditTier}
            disabled={updating || !selectedName}
          />
          <BoundedTextarea value={editValue} onChange={(event) => setEditValue(event.target.value)} className='font-mono' minHeightClassName='min-h-[130px]' maxHeightClassName='max-h-[32vh]' />
        </div>
      </CreateResourceDialog>

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
          <SsmParameterOptionsFields
            description={createDescription}
            onDescriptionChange={setCreateDescription}
            type={createType}
            onTypeChange={setCreateType}
            tier={createTier}
            onTierChange={setCreateTier}
            disabled={creating}
          />
          <BoundedTextarea value={createValue} onChange={(event) => setCreateValue(event.target.value)} className='font-mono' minHeightClassName='min-h-[130px]' maxHeightClassName='max-h-[32vh]' />
        </div>
      </CreateResourceDialog>
    </ServiceShell>
  );
}
