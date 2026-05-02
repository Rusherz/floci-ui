'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';

import { ConfirmDialog } from '@/components/floci/confirm-dialog';
import { CreateResourceDialog } from '@/components/floci/create-resource-dialog';
import { ServiceShell } from '@/components/floci/service-shell';
import { ScrollableCodeBlock } from '@/components/floci/scrollable-code-block';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createApiClient } from '@/lib/floci/api';
import { createApiConfig } from '@/lib/floci/config';
import type { CloudWatchLogEvent, CloudWatchLogGroupSummary, CloudWatchLogStreamSummary } from '@/lib/floci/types';
import { cn } from '@/lib/utils';

export default function CloudWatchPage() {
  const api = useMemo(() => createApiClient(createApiConfig()), []);

  const [groups, setGroups] = useState<CloudWatchLogGroupSummary[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [streams, setStreams] = useState<CloudWatchLogStreamSummary[]>([]);
  const [events, setEvents] = useState<CloudWatchLogEvent[]>([]);
  const [search, setSearch] = useState('');
  const [messageFilter, setMessageFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE'>('ALL');
  const [fromDateTime, setFromDateTime] = useState('');
  const [toDateTime, setToDateTime] = useState('');
  const [selectedEventKey, setSelectedEventKey] = useState('');
  const [status, setStatus] = useState<{ type: 'info' | 'error' | null; message: string }>({ type: null, message: '' });
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [clearLogsOpen, setClearLogsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const eventsListRef = useRef<HTMLDivElement | null>(null);
  const lastGroupAnchorRef = useRef<number | null>(null);

  const loadGroups = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setLoading(true);
    }
    try {
      const next = await api.listLogGroups();
      setGroups(next);
      setSelectedGroups((current) => {
        const existing = current.filter((groupName) => next.some((group) => group.logGroupName === groupName));
        if (existing.length > 0) return existing;
        return next[0]?.logGroupName ? [next[0].logGroupName] : [];
      });
      if (!silent) {
        setStatus({ type: 'info', message: `Loaded ${next.length} log group(s).` });
      }
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to load log groups' });
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [api]);

  const loadStreams = useCallback(async () => {
    if (!selectedGroups.length) {
      setStreams([]);
      return;
    }
    try {
      const allStreams = await Promise.all(
        selectedGroups.map(async (groupName) => {
          const groupStreams = await api.listLogStreams(groupName);
          return groupStreams.map((stream) => ({
            ...stream,
            logStreamName: `${groupName}:${stream.logStreamName}`,
          }));
        })
      );
      setStreams(allStreams.flat());
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to load log streams' });
    }
  }, [api, selectedGroups]);

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

  const handleSelectGroup = useCallback(
    (index: number, event?: MouseEvent<HTMLButtonElement>) => {
      const withRange = Boolean(event?.shiftKey);
      const withToggle = Boolean(event?.metaKey || event?.ctrlKey);
      if (withRange && event) {
        event.preventDefault();
      }

      const group = filtered[index];
      if (!group) return;

      setSelectedGroups((prev) => {
        const next = new Set(prev);
        if (withRange && lastGroupAnchorRef.current !== null) {
          const start = Math.min(lastGroupAnchorRef.current, index);
          const end = Math.max(lastGroupAnchorRef.current, index);
          for (let i = start; i <= end; i += 1) {
            const candidate = filtered[i];
            if (!candidate) continue;
            next.add(candidate.logGroupName);
          }
        } else if (withToggle) {
          if (next.has(group.logGroupName)) {
            next.delete(group.logGroupName);
          } else {
            next.add(group.logGroupName);
          }
          lastGroupAnchorRef.current = index;
        } else {
          next.clear();
          next.add(group.logGroupName);
          lastGroupAnchorRef.current = index;
        }
        return Array.from(next);
      });
    },
    [filtered]
  );

  const toEpochMs = useCallback((value: string): number | undefined => {
    if (!value.trim()) return undefined;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : undefined;
  }, []);

  const compiledFilterPattern = useMemo(() => {
    const parts: string[] = [];
    if (severityFilter !== 'ALL') {
      parts.push(severityFilter);
    }
    if (messageFilter.trim()) {
      parts.push(messageFilter.trim());
    }
    return parts.join(' ');
  }, [messageFilter, severityFilter]);

  const runFilter = useCallback(async (silent = false) => {
    if (!selectedGroups.length) {
      if (!silent) setStatus({ type: 'error', message: 'Select at least one log group first.' });
      return;
    }

    const startTime = toEpochMs(fromDateTime);
    const endTime = toEpochMs(toDateTime);

    if (startTime !== undefined && endTime !== undefined && startTime > endTime) {
      if (!silent) {
        setStatus({ type: 'error', message: 'Start date must be before end date.' });
      }
      return;
    }

    if (!silent) setLoading(true);
    try {
      const groupedEvents = await Promise.all(
        selectedGroups.map(async (groupName) => {
          const groupEvents = await api.filterLogEvents(groupName, compiledFilterPattern, { startTime, endTime });
          return groupEvents.map((event) => ({
            ...event,
            eventId: event.eventId ? `${groupName}:${event.eventId}` : '',
            logStreamName: `${groupName}:${event.logStreamName}`,
          }));
        })
      );
      const next = groupedEvents.flat().sort((a, b) => b.timestamp - a.timestamp).slice(0, 200);
      setEvents(next);
      if (!silent) setStatus({ type: 'info', message: `Loaded ${next.length} event(s).` });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to filter logs' });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [api, compiledFilterPattern, fromDateTime, selectedGroups, toDateTime, toEpochMs]);

  useEffect(() => {
    if (!selectedGroups.length) {
      setEvents([]);
      return;
    }
    void runFilter(true);
  }, [runFilter, selectedGroups]);

  const createGroup = useCallback(
    async (nameRaw: string) => {
      const name = nameRaw.trim();
      if (!name) return;
      setCreateError('');
      setCreating(true);
      try {
        await api.createLogGroup(name);
        await loadGroups();
        setSelectedGroups([name]);
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

  const clearSelectedGroups = useCallback(async () => {
    const groupsToClear = selectedGroups.map((group) => group.trim()).filter(Boolean);
    if (!groupsToClear.length) {
      setStatus({ type: 'error', message: 'Select at least one log group first.' });
      return;
    }

    setLoading(true);
    try {
      await Promise.all(
        groupsToClear.map(async (group) => {
          await api.deleteLogGroup(group);
          await api.createLogGroup(group);
        })
      );
      setStreams([]);
      setEvents([]);
      setSelectedEventKey('');
      await loadGroups({ silent: true });
      setSelectedGroups(groupsToClear);
      setStatus({ type: 'info', message: `Cleared logs for ${groupsToClear.length} group(s).` });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to clear selected log groups' });
    } finally {
      setClearLogsOpen(false);
      setLoading(false);
    }
  }, [api, loadGroups, selectedGroups]);

  const parsedEvents = useMemo(() => {
    const parseRequestFields = (raw: string): Record<string, string> => {
      const trimmed = raw.trim();
      if (!trimmed) return {};

      // Handle JSON payloads first.
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return Object.fromEntries(
              Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [key, String(value)])
            );
          }
        } catch {
          // Fall through to protobuf-text-like parsing.
        }
      }

      // Parse protobuf text-like payloads: key:"value" key2:"value2"
      const fields: Record<string, string> = {};
      const pattern = /([A-Za-z0-9_.-]+)\s*:\s*"([^"]*)"/g;
      let match: RegExpExecArray | null = pattern.exec(trimmed);
      while (match) {
        fields[match[1]] = match[2];
        match = pattern.exec(trimmed);
      }

      if (Object.keys(fields).length > 0) {
        return fields;
      }

      // Last resort for scalar request strings.
      return { value: raw };
    };

    const tryParseStructuredMessage = (raw: string): {
      displayMessage: string;
      severityText: string;
      service: string;
      parsedPayload: Record<string, unknown> | null;
      requestFields: Record<string, string>;
      requestRaw: string;
      enduserId: string;
    } => {
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const body = typeof parsed.body === 'string' ? parsed.body : '';
        const severityText = typeof parsed.severity_text === 'string' ? parsed.severity_text : '';
        const attributes = parsed.attributes && typeof parsed.attributes === 'object' ? (parsed.attributes as Record<string, unknown>) : {};
        const service = typeof attributes.service === 'string' ? attributes.service : '';
        const requestRaw = typeof attributes.request === 'string' ? attributes.request : '';
        const requestFields = requestRaw ? parseRequestFields(requestRaw) : {};
        const enduserId = typeof attributes['enduser.id'] === 'string' ? attributes['enduser.id'] : '';

        return {
          displayMessage: body || raw,
          severityText,
          service,
          parsedPayload: parsed,
          requestFields,
          requestRaw,
          enduserId,
        };
      } catch {
        return {
          displayMessage: raw,
          severityText: '',
          service: '',
          parsedPayload: null,
          requestFields: {},
          requestRaw: '',
          enduserId: '',
        };
      }
    };

    return events
      .map((event) => {
        const message = event.message || '';
        const structured = tryParseStructuredMessage(message);
        const displayMessage = structured.displayMessage || message;
        const requestIdMatch = message.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i);
        const levelMatch = displayMessage.match(/\b(INFO|ERROR|WARN|DEBUG|TRACE)\b/i);
        const level = (structured.severityText || levelMatch?.[1] || 'INFO').toUpperCase();
        return {
          ...event,
          level,
          requestId: requestIdMatch?.[0] || '',
          service: structured.service,
          enduserId: structured.enduserId,
          requestRaw: structured.requestRaw,
          requestFields: structured.requestFields,
          displayMessage,
          parsedPayload: structured.parsedPayload,
          preview: displayMessage.length > 180 ? `${displayMessage.slice(0, 180)}...` : displayMessage,
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [events]);

  const getEventKey = useCallback((event: CloudWatchLogEvent) => {
    if (event.eventId) {
      return event.eventId;
    }
    return `${event.timestamp}:${event.ingestionTime}:${event.logStreamName}:${event.message}`;
  }, []);

  useEffect(() => {
    if (!parsedEvents.length) {
      if (selectedEventKey) setSelectedEventKey('');
      return;
    }

    if (!selectedEventKey || !parsedEvents.some((event) => getEventKey(event) === selectedEventKey)) {
      setSelectedEventKey(getEventKey(parsedEvents[0]));
    }
  }, [getEventKey, parsedEvents, selectedEventKey]);

  const selectedEvent = useMemo(() => {
    if (!parsedEvents.length) return null;
    if (!selectedEventKey) return parsedEvents[0];
    return parsedEvents.find((event) => getEventKey(event) === selectedEventKey) || parsedEvents[0];
  }, [getEventKey, parsedEvents, selectedEventKey]);

  const handleRefresh = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      await loadGroups({ silent });
      await loadStreams();
      await runFilter(true);
    },
    [loadGroups, loadStreams, runFilter]
  );

  return (
    <ServiceShell
      activeSlug='cloudwatch'
      title='CloudWatch Logs'
      description='Log groups, streams, and filtered event viewing.'
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder='Search log groups...'
      onRefresh={handleRefresh}
      refreshDisabled={loading}
      pollingDefaultEnabled
      status={status}
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
              {filtered.map((group, index) => {
                const active = selectedGroups.includes(group.logGroupName);
                return (
                  <button
                    key={group.logGroupName}
                    type='button'
                    onClick={(event) => handleSelectGroup(index, event)}
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

      <section className='grid min-h-0 min-w-0 gap-4 lg:grid-rows-[auto_minmax(0,1fr)]'>
        <Card className={cn('min-w-0 rounded-md shadow-none', filtersOpen ? 'min-h-[180px]' : 'min-h-0')}>
          <CardHeader>
            <div className='flex items-center justify-between gap-2'>
              <CardTitle className='text-base'>Filter</CardTitle>
              <Button variant='outline' size='sm' onClick={() => setFiltersOpen((current) => !current)}>
                {filtersOpen ? 'Collapse' : 'Expand'}
              </Button>
            </div>
          </CardHeader>
          {filtersOpen ? (
            <CardContent className='grid gap-4'>
              <div className='grid gap-2'>
                <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>Message</p>
                <Input value={messageFilter} onChange={(event) => setMessageFilter(event.target.value)} placeholder='Filter message text' />
              </div>
              <div className='grid gap-3 md:grid-cols-3'>
                <div className='grid gap-2'>
                  <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>Severity</p>
                  <Select value={severityFilter} onValueChange={(value) => setSeverityFilter(value as 'ALL' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE')}>
                    <SelectTrigger>
                      <SelectValue placeholder='Select severity' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='ALL'>All</SelectItem>
                      <SelectItem value='ERROR'>Error</SelectItem>
                      <SelectItem value='WARN'>Warn</SelectItem>
                      <SelectItem value='INFO'>Info</SelectItem>
                      <SelectItem value='DEBUG'>Debug</SelectItem>
                      <SelectItem value='TRACE'>Trace</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className='grid gap-2'>
                  <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>From</p>
                  <Input type='datetime-local' value={fromDateTime} onChange={(event) => setFromDateTime(event.target.value)} />
                </div>
                <div className='grid gap-2'>
                  <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>To</p>
                  <Input type='datetime-local' value={toDateTime} onChange={(event) => setToDateTime(event.target.value)} />
                </div>
              </div>
              <Button onClick={() => void runFilter()} disabled={loading || !selectedGroups.length}>
                Run Filter
              </Button>
            </CardContent>
          ) : null}
        </Card>

        <div className='grid min-h-0 min-w-0 gap-4 lg:grid-cols-2'>
          <Card className='min-h-0 min-w-0 rounded-md shadow-none lg:flex lg:flex-col lg:overflow-hidden'>
            <CardHeader>
              <div className='flex items-center justify-between gap-2'>
                <div>
                  <CardTitle className='text-base'>Events</CardTitle>
                  <p className='text-xs text-muted-foreground'>
                    {streams.length} stream(s) across {selectedGroups.length} selected group(s)
                  </p>
                </div>
                <Button variant='destructive' size='sm' onClick={() => setClearLogsOpen(true)} disabled={loading || !selectedGroups.length}>
                  Clear Logs
                </Button>
              </div>
            </CardHeader>
            <CardContent className='min-h-0 lg:flex-1 lg:overflow-hidden'>
              {!parsedEvents.length ? (
                <p className='text-sm text-muted-foreground'>No events loaded.</p>
              ) : (
                <div
                  ref={eventsListRef}
                  className='flex h-full min-h-0 flex-col gap-2 overflow-auto pr-1'
                  tabIndex={0}
                  role='listbox'
                  aria-label='CloudWatch events'
                  onKeyDown={(event) => {
                    if (!parsedEvents.length) return;
                    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

                    event.preventDefault();
                    const currentIndex = parsedEvents.findIndex((item) => getEventKey(item) === selectedEventKey);
                    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
                    const nextIndex =
                      event.key === 'ArrowDown'
                        ? Math.min(parsedEvents.length - 1, safeIndex + 1)
                        : Math.max(0, safeIndex - 1);
                    const nextEvent = parsedEvents[nextIndex];
                    if (!nextEvent) return;

                    setSelectedEventKey(getEventKey(nextEvent));

                    const nextButton = eventsListRef.current?.querySelector<HTMLButtonElement>(`[data-event-key="${getEventKey(nextEvent)}"]`);
                    nextButton?.scrollIntoView({ block: 'nearest' });
                    nextButton?.focus({ preventScroll: true });
                  }}
                >
                  {parsedEvents.map((event, index) => {
                    const active = getEventKey(event) === selectedEventKey;
                    return (
                      <button
                        key={event.eventId || `${event.timestamp}-${event.ingestionTime}-${index}`}
                        data-event-key={getEventKey(event)}
                        type='button'
                        onClick={() => setSelectedEventKey(getEventKey(event))}
                        onFocus={() => setSelectedEventKey(getEventKey(event))}
                        className={cn(
                          'w-full rounded-md border px-3 py-2 text-left transition focus:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary',
                          active ? 'border-primary bg-primary/20' : 'border-border bg-background hover:bg-accent'
                        )}
                      >
                        <div className='flex items-start justify-between gap-2'>
                          <div className='min-w-0 pr-2'>
                            <p className='line-clamp-2 text-sm font-medium text-foreground'>{event.preview}</p>
                          </div>
                          <div className='flex min-w-[128px] flex-col items-end gap-1'>
                            <span className='text-xs text-muted-foreground'>{new Date(event.timestamp).toLocaleString()}</span>
                            <Badge variant={event.level === 'ERROR' ? 'destructive' : 'outline'}>{event.level}</Badge>
                          </div>
                        </div>
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
              {selectedEvent && Object.keys(selectedEvent.requestFields).length ? (
                <div className='mb-3 rounded-md border bg-background/40 p-3'>
                  <p className='mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Request Fields</p>
                  <dl className='grid gap-1'>
                    {Object.entries(selectedEvent.requestFields).map(([key, value]) => (
                      <div key={`${selectedEvent.eventId}-${key}`} className='grid grid-cols-[140px_minmax(0,1fr)] gap-2 text-xs'>
                        <dt className='truncate text-muted-foreground'>{key}</dt>
                        <dd className='truncate font-medium text-foreground'>{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}
              <ScrollableCodeBlock
                content={
                  selectedEvent
                    ? JSON.stringify(
                        {
                          timestamp: selectedEvent.timestamp,
                          iso: new Date(selectedEvent.timestamp).toISOString(),
                          level: selectedEvent.level,
                          requestId: selectedEvent.requestId,
                          service: selectedEvent.service,
                          enduserId: selectedEvent.enduserId,
                          requestRaw: selectedEvent.requestRaw,
                          request: selectedEvent.requestFields,
                          eventId: selectedEvent.eventId,
                          logStreamName: selectedEvent.logStreamName,
                          ingestionTime: selectedEvent.ingestionTime,
                          message: selectedEvent.message,
                          structured: selectedEvent.parsedPayload,
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
        </div>
      </section>
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
      <ConfirmDialog
        open={clearLogsOpen}
        onOpenChange={setClearLogsOpen}
        title='Clear CloudWatch Logs'
        description={
          <>
            This will delete and recreate <strong>{selectedGroups.length} selected log group(s)</strong>. Existing events will be removed.
          </>
        }
        onCancel={() => setClearLogsOpen(false)}
        onConfirm={() => void clearSelectedGroups()}
        confirmLabel='Clear Logs'
        confirmDisabled={loading || !selectedGroups.length}
        cancelDisabled={loading}
      />
    </ServiceShell>
  );
}
