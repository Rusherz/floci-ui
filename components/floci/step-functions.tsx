'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';

import { BoundedTextarea } from '@/components/floci/bounded-textarea';
import { CreateResourceDialog } from '@/components/floci/create-resource-dialog';
import { DetailSkeleton, ListSkeleton, PanelSkeleton } from '@/components/floci/loading';
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
import type { StepFunctionExecutionSummary, StepFunctionStateMachineSummary } from '@/lib/floci/types';
import type { FlociElement } from '@/lib/floci/elements';

export default function StepFunctionsPage({ enabledElements }: { enabledElements: FlociElement[] }) {
  const api = useFlociApi();

  const [stateMachines, setStateMachines] = useState<StepFunctionStateMachineSummary[]>([]);
  const [selectedArn, setSelectedArn] = useState('');
  const [executions, setExecutions] = useState<StepFunctionExecutionSummary[]>([]);
  const [search, setSearch] = useState('');
  const [executionInput, setExecutionInput] = useState('{\n  "trigger": "manual"\n}');
  const [status, setStatus] = useState<ServiceStatus>(EMPTY_SERVICE_STATUS);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [machineType, setMachineType] = useState<'STANDARD' | 'EXPRESS'>('STANDARD');
  const [roleArn, setRoleArn] = useState('arn:aws:iam::000000000000:role/states-role');
  const [definition, setDefinition] = useState(
    '{\n  "Comment": "Hello world",\n  "StartAt": "Done",\n  "States": {\n    "Done": { "Type": "Succeed" }\n  }\n}'
  );
  const [hasLoadedStateMachines, setHasLoadedStateMachines] = useState(false);
  const [hasLoadedExecutions, setHasLoadedExecutions] = useState(false);

  const loadStateMachines = useCallback(async () => {
    setLoading(true);
    try {
      const next = await api.listStepFunctionsStateMachines();
      setStateMachines(next);
      setSelectedArn((current) => (current && next.some((sm) => sm.arn === current) ? current : next[0]?.arn || ''));
      setStatus({ type: 'info', message: `Loaded ${next.length} state machine(s).` });
      setHasLoadedStateMachines(true);
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
      setHasLoadedExecutions(true);
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

  const filtered = useMemo(() => filterBySearch(stateMachines, search, (machine) => machine.name), [search, stateMachines]);
  const isInitialStateMachinesLoading = loading && !hasLoadedStateMachines;
  const isInitialExecutionsLoading = loading && !hasLoadedExecutions;

  const refreshStateMachinesOptimistically = useOptimisticCreateRefresh<StepFunctionStateMachineSummary>({
    upsert: (machine) => {
      setStateMachines((current) => [machine, ...current.filter((candidate) => candidate.arn !== machine.arn && candidate.name !== machine.name)]);
      setSelectedArn(machine.arn || machine.name);
    },
    refresh: loadStateMachines,
  });

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
      if (!isNonEmpty(name) || !isNonEmpty(roleArn)) {
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
      logCreateAction('step-function', 'start', { name, machineType });
      try {
        const arn = await api.createStepFunctionsStateMachine(name, roleArn.trim(), definition, machineType);
        await refreshStateMachinesOptimistically({
          name,
          arn,
          type: machineType,
          creationDate: '',
        });
        setCreateOpen(false);
        setStatus({ type: 'info', message: `Created state machine ${name}.` });
        logCreateAction('step-function', 'success', { name, arn, machineType });
      } catch (error) {
        logCreateAction('step-function', 'error', { name, machineType, error: error instanceof Error ? error.message : String(error) });
        setCreateError(getCreateErrorMessage(error, 'Failed to create state machine'));
      } finally {
        setCreating(false);
      }
    },
    [api, definition, machineType, refreshStateMachinesOptimistically, roleArn]
  );

  return (
    <ServiceShell
      enabledElements={enabledElements}
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
            <Button variant='emphasis' size='icon' className='size-9' onClick={() => setCreateOpen(true)} aria-label='Create state machine' title='Create state machine'>
              <Plus className='size-4' />
            </Button>
          </div>
        </CardHeader>
        <CardContent className='xl:min-h-0 xl:flex-1'>
          {isInitialStateMachinesLoading ? (
            <ListSkeleton items={8} inline />
          ) : !filtered.length ? (
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
                    className={selectableRowButtonClass(active)}
                  >
                    <div className='truncate font-medium'>{sm.name}</div>
                    <p className={selectableRowMetaTextClass(active)}>{sm.type || 'STANDARD'}</p>
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
            {isInitialExecutionsLoading ? <DetailSkeleton lines={10} /> : <ScrollableCodeBlock content={JSON.stringify(executions, null, 2) || '[]'} fillContainer />}
          </CardContent>
        </Card>

        <Card className='min-h-[240px] min-w-0 rounded-md shadow-none'>
          <CardHeader>
            <CardTitle className='text-base'>Start Execution</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-3'>
            {isInitialStateMachinesLoading ? (
              <PanelSkeleton rows={4} />
            ) : (
              <>
                <BoundedTextarea value={executionInput} onChange={(event) => setExecutionInput(event.target.value)} className='font-mono' minHeightClassName='min-h-[130px]' maxHeightClassName='max-h-[34vh]' />
                <Button onClick={() => void startExecution()} disabled={loading || !selectedArn}>
                  Start Execution
                </Button>
              </>
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
