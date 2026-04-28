'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { BoundedTextarea } from '@/components/floci/bounded-textarea';
import { CreateResourceDialog } from '@/components/floci/create-resource-dialog';
import { ServicePanelColumn } from '@/components/floci/service-panel-column';
import { ServiceShell } from '@/components/floci/service-shell';
import { ScrollableCodeBlock } from '@/components/floci/scrollable-code-block';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { createApiClient } from '@/lib/floci/api';
import { createApiConfig } from '@/lib/floci/config';
import type { StepFunctionExecutionSummary, StepFunctionStateMachineSummary } from '@/lib/floci/types';
import { cn } from '@/lib/utils';

export default function StepFunctionsPage() {
  const api = useMemo(() => createApiClient(createApiConfig()), []);

  const [stateMachines, setStateMachines] = useState<StepFunctionStateMachineSummary[]>([]);
  const [selectedArn, setSelectedArn] = useState('');
  const [executions, setExecutions] = useState<StepFunctionExecutionSummary[]>([]);
  const [search, setSearch] = useState('');
  const [executionInput, setExecutionInput] = useState('{\n  "trigger": "manual"\n}');
  const [status, setStatus] = useState<{ type: 'info' | 'error' | null; message: string }>({ type: null, message: '' });
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [machineType, setMachineType] = useState<'STANDARD' | 'EXPRESS'>('STANDARD');
  const [roleArn, setRoleArn] = useState('arn:aws:iam::000000000000:role/states-role');
  const [definition, setDefinition] = useState(
    '{\n  "Comment": "Hello world",\n  "StartAt": "Done",\n  "States": {\n    "Done": { "Type": "Succeed" }\n  }\n}'
  );

  const loadStateMachines = useCallback(async () => {
    setLoading(true);
    try {
      const next = await api.listStepFunctionsStateMachines();
      setStateMachines(next);
      setSelectedArn((current) => (current && next.some((sm) => sm.arn === current) ? current : next[0]?.arn || ''));
      setStatus({ type: 'info', message: `Loaded ${next.length} state machine(s).` });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to load state machines' });
    } finally {
      setLoading(false);
    }
  }, [api]);

  const loadExecutions = useCallback(async () => {
    if (!selectedArn) {
      setExecutions([]);
      return;
    }

    try {
      const next = await api.listStepFunctionsExecutions(selectedArn);
      setExecutions(next);
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to load executions' });
    }
  }, [api, selectedArn]);

  useEffect(() => {
    void loadStateMachines();
  }, [loadStateMachines]);

  useEffect(() => {
    void loadExecutions();
  }, [loadExecutions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stateMachines;
    return stateMachines.filter((sm) => sm.name.toLowerCase().includes(q));
  }, [search, stateMachines]);

  const startExecution = useCallback(async () => {
    if (!selectedArn) {
      setStatus({ type: 'error', message: 'Select a state machine first.' });
      return;
    }

    try {
      JSON.parse(executionInput);
    } catch {
      setStatus({ type: 'error', message: 'Execution input must be valid JSON.' });
      return;
    }

    setLoading(true);
    try {
      const executionArn = await api.startStepFunctionsExecution(selectedArn, executionInput);
      setStatus({ type: 'info', message: `Execution started: ${executionArn || 'ok'}` });
      await loadExecutions();
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to start execution' });
    } finally {
      setLoading(false);
    }
  }, [api, executionInput, loadExecutions, selectedArn]);

  const createStateMachine = useCallback(
    async (nameRaw: string) => {
      const name = nameRaw.trim();
      if (!name || !roleArn.trim()) {
        setCreateError('Name and role ARN are required.');
        return;
      }
      try {
        JSON.parse(definition);
      } catch {
        setCreateError('State machine definition must be valid JSON.');
        return;
      }
      setCreateError('');
      setCreating(true);
      try {
        const arn = await api.createStepFunctionsStateMachine(name, roleArn.trim(), definition, machineType);
        await loadStateMachines();
        setSelectedArn(arn);
        setCreateOpen(false);
        setStatus({ type: 'info', message: `Created state machine ${name}.` });
      } catch (error) {
        setCreateError(error instanceof Error ? error.message : 'Failed to create state machine');
      } finally {
        setCreating(false);
      }
    },
    [api, definition, loadStateMachines, machineType, roleArn]
  );

  return (
    <ServiceShell
      activeSlug='step-functions'
      title='Step Functions'
      description='State machine list, execution history, and start execution action.'
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder='Search state machines...'
      onRefresh={() => void loadStateMachines()}
      refreshDisabled={loading}
      status={status}
    >
      <Card className='min-h-0 min-w-0 rounded-md shadow-none xl:flex xl:h-full xl:flex-col xl:overflow-hidden'>
        <CardHeader>
          <div className='flex items-center justify-between gap-2'>
            <CardTitle className='text-base'>State Machines ({filtered.length})</CardTitle>
            <Button size='sm' onClick={() => setCreateOpen(true)}>
              Create State Machine
            </Button>
          </div>
        </CardHeader>
        <CardContent className='xl:min-h-0 xl:flex-1'>
          {!filtered.length ? (
            <p className='text-sm text-muted-foreground'>No state machines found.</p>
          ) : (
            <div className='flex max-h-[560px] flex-col gap-2 overflow-auto pr-1 xl:h-full xl:max-h-none xl:min-h-0'>
              {filtered.map((sm) => {
                const active = sm.arn === selectedArn;
                return (
                  <button
                    key={sm.arn}
                    type='button'
                    onClick={() => setSelectedArn(sm.arn)}
                    className={cn('w-full rounded-md border px-3 py-2 text-left text-sm transition', active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-accent')}
                  >
                    <div className='truncate font-medium'>{sm.name}</div>
                    <p className={cn('mt-1 truncate text-xs', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{sm.type || 'STANDARD'}</p>
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
            <CardTitle className='text-base'>Executions</CardTitle>
          </CardHeader>
          <CardContent className='min-h-0 lg:flex-1 lg:overflow-hidden'>
            <ScrollableCodeBlock content={JSON.stringify(executions, null, 2) || '[]'} fillContainer />
          </CardContent>
        </Card>

        <Card className='min-h-[240px] min-w-0 rounded-md shadow-none'>
          <CardHeader>
            <CardTitle className='text-base'>Start Execution</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-3'>
            <BoundedTextarea value={executionInput} onChange={(event) => setExecutionInput(event.target.value)} className='font-mono' minHeightClassName='min-h-[130px]' maxHeightClassName='max-h-[34vh]' />
            <Button onClick={() => void startExecution()} disabled={loading || !selectedArn}>
              Start Execution
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
        title='Create State Machine'
        description='Create a Step Functions state machine.'
        label='State Machine Name'
        placeholder='my-state-machine'
        confirmLabel='Create State Machine'
        submitting={creating}
        errorMessage={createError}
        onSubmit={createStateMachine}
      >
        <div className='grid gap-2 rounded-md border p-3'>
          <div className='grid gap-1 sm:grid-cols-2 sm:gap-2'>
            <div className='grid gap-1'>
              <p className='text-xs text-muted-foreground'>Type</p>
              <Button type='button' variant='outline' size='sm' onClick={() => setMachineType((current) => (current === 'STANDARD' ? 'EXPRESS' : 'STANDARD'))}>
                {machineType}
              </Button>
            </div>
            <div className='grid gap-1'>
              <p className='text-xs text-muted-foreground'>Role ARN</p>
              <Input value={roleArn} onChange={(event) => setRoleArn(event.target.value)} />
            </div>
          </div>
          <div className='grid gap-1'>
            <p className='text-xs text-muted-foreground'>Definition JSON</p>
            <BoundedTextarea value={definition} onChange={(event) => setDefinition(event.target.value)} className='font-mono' minHeightClassName='min-h-[120px]' maxHeightClassName='max-h-[28vh]' />
          </div>
        </div>
      </CreateResourceDialog>
    </ServiceShell>
  );
}
