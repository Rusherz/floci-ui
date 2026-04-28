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
import type { EventBusSummary, EventRuleSummary, EventTargetSummary } from '@/lib/floci/types';
import { cn } from '@/lib/utils';

export default function EventBridgePage() {
  const api = useMemo(() => createApiClient(createApiConfig()), []);

  const [buses, setBuses] = useState<EventBusSummary[]>([]);
  const [selectedBus, setSelectedBus] = useState('default');
  const [rules, setRules] = useState<EventRuleSummary[]>([]);
  const [selectedRule, setSelectedRule] = useState('');
  const [targets, setTargets] = useState<EventTargetSummary[]>([]);
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('floci.ui');
  const [detailType, setDetailType] = useState('manual.test');
  const [detail, setDetail] = useState('{\n  "ok": true\n}');
  const [status, setStatus] = useState<{ type: 'info' | 'error' | null; message: string }>({ type: null, message: '' });
  const [loading, setLoading] = useState(false);

  const loadBuses = useCallback(async () => {
    setLoading(true);
    try {
      const next = await api.listEventBuses();
      setBuses(next);
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rules;
    return rules.filter((r) => r.name.toLowerCase().includes(q));
  }, [rules, search]);

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

  return (
    <ServiceShell
      activeSlug='eventbridge'
      title='EventBridge'
      description='Event bus, rule, target visibility, and test event publishing.'
      summaryCountLabel={`${rules.length} rule(s)`}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder='Search rules...'
      onRefresh={() => void loadBuses()}
      refreshDisabled={loading}
      status={status}
    >
      <Card className='min-h-0 min-w-0 rounded-md shadow-none xl:flex xl:h-full xl:flex-col xl:overflow-hidden'>
        <CardHeader>
          <CardTitle className='text-base'>Rules</CardTitle>
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
                    className={cn('w-full rounded-md border px-3 py-2 text-left text-sm transition', active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-accent')}
                  >
                    <div className='truncate font-medium'>{rule.name}</div>
                    <p className={cn('mt-1 truncate text-xs', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{rule.state}</p>
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
    </ServiceShell>
  );
}
