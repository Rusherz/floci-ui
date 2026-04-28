'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { CreateResourceDialog } from '@/components/floci/create-resource-dialog';
import { ServicePanelColumn } from '@/components/floci/service-panel-column';
import { ServiceShell } from '@/components/floci/service-shell';
import { ScrollableCodeBlock } from '@/components/floci/scrollable-code-block';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { createApiClient } from '@/lib/floci/api';
import { createApiConfig } from '@/lib/floci/config';
import type { CloudWatchLogEvent, CloudWatchLogGroupSummary, CloudWatchLogStreamSummary } from '@/lib/floci/types';
import { cn } from '@/lib/utils';

export default function CloudWatchPage() {
  const api = useMemo(() => createApiClient(createApiConfig()), []);

  const [groups, setGroups] = useState<CloudWatchLogGroupSummary[]>([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [streams, setStreams] = useState<CloudWatchLogStreamSummary[]>([]);
  const [events, setEvents] = useState<CloudWatchLogEvent[]>([]);
  const [search, setSearch] = useState('');
  const [filterPattern, setFilterPattern] = useState('');
  const [eventSearch, setEventSearch] = useState('');
  const [selectedEventIndex, setSelectedEventIndex] = useState(0);
  const [status, setStatus] = useState<{ type: 'info' | 'error' | null; message: string }>({ type: null, message: '' });
  const [loading, setLoading] = useState(false);
  const [pollingEnabled, setPollingEnabled] = useState(true);
  const [pollingRunning, setPollingRunning] = useState(false);
  const [pollProgress, setPollProgress] = useState(0);
  const pollIntervalMs = 4000;
  const [nextPollAt, setNextPollAt] = useState(Date.now() + pollIntervalMs);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const pollProgressRef = useRef(0);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const next = await api.listLogGroups();
      setGroups(next);
      setSelectedGroup((current) => (current && next.some((group) => group.logGroupName === current) ? current : next[0]?.logGroupName || ''));
      setStatus({ type: 'info', message: `Loaded ${next.length} log group(s).` });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to load log groups' });
    } finally {
      setLoading(false);
    }
  }, [api]);

  const loadStreams = useCallback(async () => {
    if (!selectedGroup) {
      setStreams([]);
      return;
    }
    try {
      const next = await api.listLogStreams(selectedGroup);
      setStreams(next);
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to load log streams' });
    }
  }, [api, selectedGroup]);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    void loadStreams();
  }, [loadStreams]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((group) => group.logGroupName.toLowerCase().includes(q));
  }, [groups, search]);

  const runFilter = useCallback(async (silent = false) => {
    if (!selectedGroup) {
      if (!silent) setStatus({ type: 'error', message: 'Select a log group first.' });
      return;
    }

    if (!silent) setLoading(true);
    setPollingRunning(true);
    try {
      const next = await api.filterLogEvents(selectedGroup, filterPattern.trim());
      setEvents(next);
      setSelectedEventIndex(0);
      if (!silent) setStatus({ type: 'info', message: `Loaded ${next.length} event(s).` });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to filter logs' });
    } finally {
      if (!silent) setLoading(false);
      setPollingRunning(false);
      setNextPollAt(Date.now() + pollIntervalMs);
    }
  }, [api, filterPattern, pollIntervalMs, selectedGroup]);

  useEffect(() => {
    if (!selectedGroup) {
      setEvents([]);
      return;
    }
    void runFilter(true);
  }, [runFilter, selectedGroup]);

  const createGroup = useCallback(
    async (nameRaw: string) => {
      const name = nameRaw.trim();
      if (!name) return;
      setCreateError('');
      setCreating(true);
      try {
        await api.createLogGroup(name);
        await loadGroups();
        setSelectedGroup(name);
        setCreateOpen(false);
        setStatus({ type: 'info', message: `Created log group ${name}.` });
      } catch (error) {
        setCreateError(error instanceof Error ? error.message : 'Failed to create log group');
      } finally {
        setCreating(false);
      }
    },
    [api, loadGroups]
  );

  const parsedEvents = useMemo(() => {
    return events
      .map((event) => {
        const message = event.message || '';
        const requestIdMatch = message.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i);
        const levelMatch = message.match(/\b(INFO|ERROR|WARN|DEBUG|TRACE)\b/i);
        const level = (levelMatch?.[1] || 'INFO').toUpperCase();
        return {
          ...event,
          level,
          requestId: requestIdMatch?.[0] || '',
          preview: message.length > 140 ? `${message.slice(0, 140)}...` : message,
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [events]);

  const filteredEvents = useMemo(() => {
    const query = eventSearch.trim().toLowerCase();
    if (!query) return parsedEvents;
    return parsedEvents.filter(
      (event) =>
        event.preview.toLowerCase().includes(query) ||
        event.level.toLowerCase().includes(query) ||
        event.requestId.toLowerCase().includes(query)
    );
  }, [eventSearch, parsedEvents]);

  const selectedEvent =
    filteredEvents[Math.max(0, Math.min(selectedEventIndex, Math.max(0, filteredEvents.length - 1)))] || null;

  useEffect(() => {
    let rafId = 0;

    const tick = () => {
      if (!pollingEnabled || !selectedGroup || pollingRunning) {
        if (pollProgressRef.current !== 0) {
          pollProgressRef.current = 0;
          setPollProgress(0);
        }
      } else {
        const remaining = Math.max(0, nextPollAt - Date.now());
        const pct = ((pollIntervalMs - remaining) / pollIntervalMs) * 100;
        const clamped = Math.max(0, Math.min(100, pct));
        if (Math.abs(clamped - pollProgressRef.current) >= 0.5) {
          pollProgressRef.current = clamped;
          setPollProgress(clamped);
        }

        if (Date.now() >= nextPollAt) {
          void runFilter(true);
        }
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [nextPollAt, pollIntervalMs, pollingEnabled, pollingRunning, runFilter, selectedGroup]);

  return (
    <ServiceShell
      activeSlug='cloudwatch'
      title='CloudWatch Logs'
      description='Log groups, streams, and filtered event viewing.'
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder='Search log groups...'
      onRefresh={() => void loadGroups()}
      refreshDisabled={loading}
      status={status}
      headerTopActions={
        <Button
          variant='outline'
          size='sm'
          onClick={() => {
            setPollingEnabled((current) => !current);
            setNextPollAt(Date.now() + pollIntervalMs);
          }}
          disabled={!selectedGroup}
        >
          {pollingEnabled ? 'Pause' : 'Resume'}
        </Button>
      }
      statusSlotContent={<Progress value={pollProgress} className='rounded-l-none rounded-r-full' />}
    >
      <Card className='min-h-0 min-w-0 rounded-md shadow-none xl:flex xl:h-full xl:flex-col xl:overflow-hidden'>
        <CardHeader>
          <div className='flex items-center justify-between gap-2'>
            <CardTitle className='text-base'>Log Groups ({filtered.length})</CardTitle>
            <Button size='sm' onClick={() => setCreateOpen(true)}>
              Create Log Group
            </Button>
          </div>
        </CardHeader>
        <CardContent className='xl:min-h-0 xl:flex-1'>
          {!filtered.length ? (
            <p className='text-sm text-muted-foreground'>No log groups found.</p>
          ) : (
            <div className='flex max-h-[560px] flex-col gap-2 overflow-auto pr-1 xl:h-full xl:max-h-none xl:min-h-0'>
              {filtered.map((group) => {
                const active = group.logGroupName === selectedGroup;
                return (
                  <button
                    key={group.logGroupName}
                    type='button'
                    onClick={() => setSelectedGroup(group.logGroupName)}
                    className={cn('w-full rounded-md border px-3 py-2 text-left text-sm transition', active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-accent')}
                  >
                    <div className='truncate font-medium'>{group.logGroupName}</div>
                    <p className={cn('mt-1 truncate text-xs', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{group.retentionInDays ? `${group.retentionInDays} day retention` : 'No retention'}</p>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ServicePanelColumn rowsClassName='lg:grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)]'>
        <Card className='min-h-[180px] min-w-0 rounded-md shadow-none'>
          <CardHeader>
            <CardTitle className='text-base'>Filter</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-3'>
            <Input value={filterPattern} onChange={(event) => setFilterPattern(event.target.value)} placeholder='Filter pattern (optional)' />
            <Input value={eventSearch} onChange={(event) => setEventSearch(event.target.value)} placeholder='Search loaded events...' />
            <Button onClick={() => void runFilter()} disabled={loading || !selectedGroup}>
              Run Filter
            </Button>
          </CardContent>
        </Card>

        <Card className='min-h-0 min-w-0 rounded-md shadow-none lg:flex lg:flex-col lg:overflow-hidden'>
          <CardHeader>
            <CardTitle className='text-base'>Events</CardTitle>
            <p className='text-xs text-muted-foreground'>{streams.length} stream(s) in selected group</p>
          </CardHeader>
          <CardContent className='min-h-0 lg:flex-1 lg:overflow-hidden'>
            {!filteredEvents.length ? (
              <p className='text-sm text-muted-foreground'>No events loaded.</p>
            ) : (
              <div className='flex h-full min-h-0 flex-col gap-2 overflow-auto pr-1'>
                {filteredEvents.map((event, index) => {
                  const active = index === selectedEventIndex;
                  return (
                    <button
                      key={`${event.timestamp}-${event.ingestionTime}-${index}`}
                      type='button'
                      onClick={() => setSelectedEventIndex(index)}
                      className={cn(
                        'w-full rounded-md border px-3 py-2 text-left transition',
                        active ? 'border-primary bg-primary/20' : 'border-border bg-background hover:bg-accent'
                      )}
                    >
                      <div className='mb-1 flex items-center justify-between gap-2'>
                        <Badge variant={event.level === 'ERROR' ? 'destructive' : 'outline'}>{event.level}</Badge>
                        <span className='text-xs text-muted-foreground'>{new Date(event.timestamp).toLocaleString()}</span>
                      </div>
                      <p className='truncate text-xs'>{event.requestId || 'No request id'}</p>
                      <p className='mt-1 line-clamp-2 text-xs text-muted-foreground'>{event.preview}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className='min-h-0 min-w-0 rounded-md shadow-none lg:flex lg:flex-col lg:overflow-hidden'>
          <CardHeader>
            <CardTitle className='text-base'>Event Detail</CardTitle>
          </CardHeader>
          <CardContent className='min-h-0 lg:flex-1 lg:overflow-hidden'>
            <ScrollableCodeBlock
              content={
                selectedEvent
                  ? JSON.stringify(
                      {
                        timestamp: selectedEvent.timestamp,
                        iso: new Date(selectedEvent.timestamp).toISOString(),
                        level: selectedEvent.level,
                        requestId: selectedEvent.requestId,
                        ingestionTime: selectedEvent.ingestionTime,
                        message: selectedEvent.message,
                      },
                      null,
                      2
                    )
                  : 'Select an event.'
              }
              fillContainer
            />
          </CardContent>
        </Card>
      </ServicePanelColumn>
      <CreateResourceDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreateError('');
        }}
        title='Create CloudWatch Log Group'
        description='Create a log group in local Floci.'
        label='Log Group Name'
        placeholder='/aws/lambda/my-function'
        confirmLabel='Create Log Group'
        submitting={creating}
        errorMessage={createError}
        onSubmit={createGroup}
      />
    </ServiceShell>
  );
}
