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
import { filterBySearch } from '@/lib/floci/search';
import { EMPTY_SERVICE_STATUS, type ServiceStatus } from '@/lib/floci/service-ui';
import { useFlociApi } from '@/lib/floci/use-floci-api';
import { getCreateErrorMessage, isNonEmpty, logCreateAction, useOptimisticCreateRefresh } from '@/lib/floci/create-workflows';
import type { EventRuleSummary, EventTargetSummary } from '@/lib/floci/types';
import type { FlociElement } from '@/lib/floci/elements';
import { cn } from '@/lib/utils';

export default function EventBridgePage({ enabledElements }: { enabledElements: FlociElement[] }) {
  const api = useFlociApi();

  const [selectedBus, setSelectedBus] = useState('default');
  const [rules, setRules] = useState<EventRuleSummary[]>([]);
  const [selectedRule, setSelectedRule] = useState('');
  const [targets, setTargets] = useState<EventTargetSummary[]>([]);
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('floci.ui');
  const [detailType, setDetailType] = useState('manual.test');
  const [detail, setDetail] = useState('{\n  "ok": true\n}');
  const [status, setStatus] = useState<ServiceStatus>(EMPTY_SERVICE_STATUS);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createStage, setCreateStage] = useState<'bus' | 'rule'>('bus');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [rulePattern, setRulePattern] = useState('{\n  "source": ["floci.ui"]\n}');
  const [ruleMode, setRuleMode] = useState<'pattern' | 'schedule'>('pattern');
  const [scheduleExpression, setScheduleExpression] = useState('rate(5 minutes)');

  const loadBuses = useCallback(async () => {
    setLoading(true);
    try {
      const next = await api.listEventBuses();
      setSelectedBus((current) => current || next[0]?.name || 'default');
      setStatus({ type: 'info', message: `Loaded ${next.length} bus(es).` });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to load buses' });
    } finally {
      setLoading(false);
    }
  }, [api]);

  const loadRules = useCallback(async () => {
    if (!selectedBus) return;
    setLoading(true);
    try {
      const next = await api.listEventRules(selectedBus);
      setRules(next);
      setSelectedRule((current) => (current && next.some((r) => r.name === current) ? current : next[0]?.name || ''));
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to load rules' });
    } finally {
      setLoading(false);
    }
  }, [api, selectedBus]);

  const loadTargets = useCallback(async () => {
    if (!selectedRule || !selectedBus) {
      setTargets([]);
      return;
    }
    try {
      const next = await api.listEventTargetsByRule(selectedRule, selectedBus);
      setTargets(next);
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to load targets' });
    }
  }, [api, selectedBus, selectedRule]);

  useEffect(() => {
    void loadBuses();
  }, [loadBuses]);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  useEffect(() => {
    void loadTargets();
  }, [loadTargets]);

  const filtered = useMemo(() => filterBySearch(rules, search, (rule) => rule.name), [rules, search]);

  const refreshBusOptimistically = useOptimisticCreateRefresh<string>({
    upsert: (busName) => {
      setSelectedBus(busName);
    },
    refresh: loadBuses,
  });

  const refreshRulesOptimistically = useOptimisticCreateRefresh<EventRuleSummary>({
    upsert: (rule) => {
      setRules((current) => [rule, ...current.filter((candidate) => candidate.name !== rule.name)]);
      setSelectedRule(rule.name);
    },
    refresh: loadRules,
  });

  const sendTest = useCallback(async () => {
    try {
      JSON.parse(detail);
    } catch {
      setStatus({ type: 'error', message: 'Detail must be valid JSON.' });
      return;
    }

    setLoading(true);
    try {
      const ids = await api.putEventBridgeEvent(source.trim(), detailType.trim(), detail, selectedBus || 'default');
      setStatus({ type: 'info', message: `Sent ${ids.length} event(s).` });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to send event' });
    } finally {
      setLoading(false);
    }
  }, [api, detail, detailType, selectedBus, source]);

  const createBus = useCallback(async (nameRaw: string) => {
    const name = nameRaw.trim();
    if (!isNonEmpty(name)) return;
    setCreating(true);
    setCreateError('');
    logCreateAction('eventbridge-bus', 'start', { name });
    try {
      await api.createEventBus(name);
      await refreshBusOptimistically(name);
      setCreateOpen(false);
      setStatus({ type: 'info', message: `Created bus ${name}.` });
      logCreateAction('eventbridge-bus', 'success', { name });
    } catch (error) {
      logCreateAction('eventbridge-bus', 'error', { name, error: error instanceof Error ? error.message : String(error) });
      setCreateError(getCreateErrorMessage(error, 'Failed to create bus'));
    } finally {
      setCreating(false);
    }
  }, [api, refreshBusOptimistically]);

  const createRule = useCallback(async (nameRaw: string) => {
    const name = nameRaw.trim();
    if (!isNonEmpty(name) || !selectedBus) return;
    if (ruleMode === 'pattern') {
      try {
        JSON.parse(rulePattern);
      } catch {
        setCreateError('Event pattern must be valid JSON.');
        return;
      }
    } else if (!isNonEmpty(scheduleExpression)) {
      setCreateError('Schedule expression is required.');
      return;
    }
    setCreating(true);
    setCreateError('');
    logCreateAction('eventbridge-rule', 'start', { name, bus: selectedBus, mode: ruleMode });
    try {
      await api.createEventRule(
        name,
        selectedBus,
        ruleMode === 'pattern' ? rulePattern : undefined,
        ruleMode === 'schedule' ? scheduleExpression.trim() : undefined
      );
      await refreshRulesOptimistically({
        name,
        arn: '',
        eventBusName: selectedBus,
        state: 'ENABLED',
      });
      setCreateOpen(false);
      setStatus({ type: 'info', message: `Created rule ${name}.` });
      logCreateAction('eventbridge-rule', 'success', { name, bus: selectedBus, mode: ruleMode });
    } catch (error) {
      logCreateAction('eventbridge-rule', 'error', { name, bus: selectedBus, mode: ruleMode, error: error instanceof Error ? error.message : String(error) });
      setCreateError(getCreateErrorMessage(error, 'Failed to create rule'));
    } finally {
      setCreating(false);
    }
  }, [api, refreshRulesOptimistically, ruleMode, rulePattern, scheduleExpression, selectedBus]);

  const handleCreate = useCallback(async (nameRaw: string) => {
    if (createStage === 'bus') {
      await createBus(nameRaw);
      return;
    }
    await createRule(nameRaw);
  }, [createBus, createRule, createStage]);

  return (
    <ServiceShell
      enabledElements={enabledElements}
      activeSlug='eventbridge'
      title='EventBridge'
      description='Event bus, rule, target visibility, and test event publishing.'
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder='Search rules...'
      onRefresh={() => void loadBuses()}
      refreshDisabled={loading}
      status={status}
    >
      <Card className='min-h-0 min-w-0 rounded-md shadow-none xl:flex xl:h-full xl:flex-col xl:overflow-hidden'>
        <CardHeader>
          <div className='flex items-center justify-between gap-2'>
            <CardTitle className='text-base'>Rules ({filtered.length})</CardTitle>
            <Button
              size='icon'
              className='size-9'
              onClick={() => setCreateOpen(true)}
              aria-label='Create eventbridge resource'
              title='Create eventbridge resource'
            >
              <Plus className='size-4' />
            </Button>
          </div>
        </CardHeader>
        <CardContent className='xl:min-h-0 xl:flex-1'>
          {!filtered.length ? (
            <p className='text-sm text-muted-foreground'>No rules found.</p>
          ) : (
            <div className='flex max-h-[560px] flex-col gap-2 overflow-auto pr-1 xl:h-full xl:max-h-none xl:min-h-0'>
              {filtered.map((rule) => {
                const active = rule.name === selectedRule;
                return (
                  <button
                    key={rule.arn || rule.name}
                    type='button'
                    onClick={() => setSelectedRule(rule.name)}
                    className={cn('w-full rounded-md border px-3 py-2 text-left text-sm transition', active ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-background hover:bg-accent')}
                  >
                    <div className='truncate font-medium'>{rule.name}</div>
                    <p className={cn('mt-1 truncate text-xs', active ? 'text-primary/80' : 'text-muted-foreground')}>{rule.state}</p>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ServicePanelColumn rowsClassName='lg:grid-rows-[minmax(0,1fr)_auto]'>
        <Card className='min-h-0 min-w-0 rounded-md shadow-none lg:flex lg:h-full lg:flex-col'>
          <CardHeader>
            <CardTitle className='text-base'>Targets</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <Input value={selectedBus} onChange={(event) => setSelectedBus(event.target.value)} placeholder='Event bus name' />
            {!targets.length ? (
              <p className='text-sm text-muted-foreground'>No targets for selected rule.</p>
            ) : (
              <div className='space-y-2'>
                {targets.map((target) => (
                  <div key={`${target.id}:${target.arn}`} className='rounded-md border p-3 text-sm'>
                    <div className='font-medium'>{target.id}</div>
                    <p className='truncate text-xs text-muted-foreground'>{target.arn}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className='min-h-[260px] min-w-0 rounded-md shadow-none'>
          <CardHeader>
            <CardTitle className='text-base'>Send Test Event</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-3'>
            <Input value={source} onChange={(event) => setSource(event.target.value)} placeholder='Source' />
            <Input value={detailType} onChange={(event) => setDetailType(event.target.value)} placeholder='Detail type' />
            <BoundedTextarea value={detail} onChange={(event) => setDetail(event.target.value)} className='font-mono' minHeightClassName='min-h-[120px]' maxHeightClassName='max-h-[32vh]' />
            <Button onClick={() => void sendTest()} disabled={loading || !selectedBus.trim()}>
              Send Event
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
        title='Create EventBridge Resource'
        description={createStage === 'bus' ? 'Create a new EventBridge bus.' : `Create a rule on bus ${selectedBus || 'default'}.`}
        label={createStage === 'bus' ? 'Bus Name' : 'Rule Name'}
        placeholder={createStage === 'bus' ? 'custom-bus' : 'my-rule'}
        confirmLabel={createStage === 'bus' ? 'Create Bus' : 'Create Rule'}
        submitting={creating}
        errorMessage={createError}
        onSubmit={handleCreate}
      >
        <div className='grid gap-2'>
          <div className='grid gap-1'>
            <p className='text-xs text-muted-foreground'>Create Stage</p>
            <div className='flex gap-2'>
              <Button type='button' size='sm' variant={createStage === 'bus' ? 'default' : 'outline'} onClick={() => setCreateStage('bus')}>
                Bus
              </Button>
              <Button type='button' size='sm' variant={createStage === 'rule' ? 'default' : 'outline'} onClick={() => setCreateStage('rule')}>
                Rule
              </Button>
            </div>
          </div>

          {createStage === 'rule' ? (
            <>
              <div className='grid gap-1'>
                <p className='text-xs text-muted-foreground'>Event Bus Name</p>
                <Input value={selectedBus} onChange={(event) => setSelectedBus(event.target.value)} placeholder='default' />
              </div>
              <div className='grid gap-1'>
                <p className='text-xs text-muted-foreground'>Rule Type</p>
                <div className='flex gap-2'>
                  <Button type='button' size='sm' variant={ruleMode === 'pattern' ? 'default' : 'outline'} onClick={() => setRuleMode('pattern')}>
                    Event Pattern
                  </Button>
                  <Button type='button' size='sm' variant={ruleMode === 'schedule' ? 'default' : 'outline'} onClick={() => setRuleMode('schedule')}>
                    Schedule
                  </Button>
                </div>
              </div>
              {ruleMode === 'pattern' ? (
                <div className='grid gap-1'>
                  <p className='text-xs text-muted-foreground'>Event Pattern JSON</p>
                  <BoundedTextarea value={rulePattern} onChange={(event) => setRulePattern(event.target.value)} className='font-mono' minHeightClassName='min-h-[100px]' maxHeightClassName='max-h-[24vh]' />
                </div>
              ) : (
                <div className='grid gap-1'>
                  <p className='text-xs text-muted-foreground'>Schedule Expression</p>
                  <Input value={scheduleExpression} onChange={(event) => setScheduleExpression(event.target.value)} placeholder='rate(5 minutes)' />
                </div>
              )}
            </>
          ) : null}
        </div>
      </CreateResourceDialog>
    </ServiceShell>
  );
}
