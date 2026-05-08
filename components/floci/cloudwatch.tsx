'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';

import { ConfirmDialog } from '@/components/floci/confirm-dialog';
import { CreateResourceDialog } from '@/components/floci/create-resource-dialog';
import { ServiceShell } from '@/components/floci/service-shell';
import { ScrollableCodeBlock } from '@/components/floci/scrollable-code-block';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { filterBySearch, normalizeSearchTerm } from '@/lib/floci/search';
import { EMPTY_SERVICE_STATUS, type ServiceStatus } from '@/lib/floci/service-ui';
import { useFlociApi } from '@/lib/floci/use-floci-api';
import { getCreateErrorMessage, isValidCloudWatchLogGroupName, logCreateAction, useOptimisticCreateRefresh } from '@/lib/floci/create-workflows';
import type { CloudWatchLogEvent, CloudWatchLogGroupSummary, CloudWatchLogStreamSummary } from '@/lib/floci/types';
import type { FlociElement } from '@/lib/floci/elements';
import { cn } from '@/lib/utils';

export default function CloudWatchPage({ enabledElements }: { enabledElements: FlociElement[] }) {
  const api = useFlociApi();

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
  const [status, setStatus] = useState<ServiceStatus>(EMPTY_SERVICE_STATUS);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [editRetentionOpen, setEditRetentionOpen] = useState(false);
  const [editRetentionError, setEditRetentionError] = useState('');
  const [updatingRetention, setUpdatingRetention] = useState(false);
  const [clearLogsOpen, setClearLogsOpen] = useState(false);
  const [deleteGroupsOpen, setDeleteGroupsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const eventsListRef = useRef<HTMLDivElement | null>(null);
  const lastGroupAnchorRef = useRef<number | null>(null);
  const hasInitializedGroupSelectionRef = useRef(false);
  const effectiveGroupNames = useMemo(() => {
    if (selectedGroups.length) return selectedGroups;
    return groups.map((group) => group.logGroupName);
  }, [groups, selectedGroups]);

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
        if (existing.length > 0) {
          hasInitializedGroupSelectionRef.current = true;
          return existing;
        }

        if (!hasInitializedGroupSelectionRef.current) {
          hasInitializedGroupSelectionRef.current = true;
          return next[0]?.logGroupName ? [next[0].logGroupName] : [];
        }

        return [];
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
    if (!effectiveGroupNames.length) {
      setStreams([]);
      return;
    }
    try {
      let sawMissingGroup = false;
      const allStreams = await Promise.all(
        effectiveGroupNames.map(async (groupName) => {
          let groupStreams: CloudWatchLogStreamSummary[] = [];
          try {
            groupStreams = await api.listLogStreams(groupName);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes('ResourceNotFoundException')) {
              sawMissingGroup = true;
              return [];
            }
            throw error;
          }
          return groupStreams.map((stream) => ({
            ...stream,
            logStreamName: `${groupName}:${stream.logStreamName}`,
          }));
        })
      );
      setStreams(allStreams.flat());
      if (sawMissingGroup) {
        await loadGroups({ silent: true });
      }
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to load log streams' });
    }
  }, [api, effectiveGroupNames, loadGroups]);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    void loadStreams();
  }, [loadStreams]);

  const filtered = useMemo(() => filterBySearch(groups, search, (group) => group.logGroupName), [groups, search]);
  const normalizedMessageFilter = useMemo(() => normalizeSearchTerm(messageFilter), [messageFilter]);

  const refreshGroupsOptimistically = useOptimisticCreateRefresh<CloudWatchLogGroupSummary>({
    upsert: (group) => {
      setGroups((current) => [group, ...current.filter((candidate) => candidate.logGroupName !== group.logGroupName)]);
      setSelectedGroups([group.logGroupName]);
    },
    refresh: async () => {
      await loadGroups();
      await loadStreams();
    },
  });

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
          if (next.size === 1 && next.has(group.logGroupName)) {
            next.clear();
            lastGroupAnchorRef.current = null;
          } else {
            next.clear();
            next.add(group.logGroupName);
            lastGroupAnchorRef.current = index;
          }
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

  const runFilter = useCallback(async (silent = false) => {
    if (!effectiveGroupNames.length) {
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
        effectiveGroupNames.map(async (groupName) => {
          let groupEvents: CloudWatchLogEvent[] = [];
          try {
            groupEvents = await api.filterLogEvents(groupName, '', { startTime, endTime });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes('ResourceNotFoundException')) {
              return [];
            }
            throw error;
          }
          return groupEvents.map((event) => ({
            ...event,
            eventId: event.eventId ? `${groupName}:${event.eventId}` : '',
            logStreamName: `${groupName}:${event.logStreamName}`,
          }));
        })
      );
      const deduped = groupedEvents
        .flat()
        .sort((a, b) => b.timestamp - a.timestamp)
        .filter((event, index, items) => {
          const key = event.eventId || `${event.timestamp}:${event.ingestionTime}:${event.logStreamName}:${event.message}`;
          return items.findIndex((candidate) => {
            const candidateKey =
              candidate.eventId || `${candidate.timestamp}:${candidate.ingestionTime}:${candidate.logStreamName}:${candidate.message}`;
            return candidateKey === key;
          }) === index;
        })
        .slice(0, 200);
      setEvents(deduped);
      if (!silent) setStatus({ type: 'info', message: `Loaded ${deduped.length} event(s).` });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to filter logs' });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [api, effectiveGroupNames, fromDateTime, toDateTime, toEpochMs]);

  const clearFilters = useCallback(() => {
    setSearch('');
    setMessageFilter('');
    setSeverityFilter('ALL');
    setFromDateTime('');
    setToDateTime('');
    setStatus({ type: 'info', message: 'Filters cleared.' });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedGroups([]);
    lastGroupAnchorRef.current = null;
    setStatus({ type: 'info', message: 'Selection cleared. Showing all groups.' });
  }, []);

  useEffect(() => {
    if (!effectiveGroupNames.length) {
      setEvents([]);
      return;
    }
    void runFilter(true);
  }, [effectiveGroupNames, runFilter]);

  const createGroup = useCallback(
    async (nameRaw: string) => {
      const name = nameRaw.trim();
      if (!name) return;
      if (!isValidCloudWatchLogGroupName(name)) {
        setCreateError('Log group name must be 1-512 chars and use letters, numbers, `.`, `-`, `_`, `/`, or `#`.');
        return;
      }
      setCreateError('');
      setCreating(true);
      logCreateAction('cloudwatch-log-group', 'start', { name });
      try {
        await api.createLogGroup(name);
        await refreshGroupsOptimistically({
          logGroupName: name,
          storedBytes: 0,
          retentionInDays: 0,
        });
        setCreateOpen(false);
        setStatus({ type: 'info', message: `Created log group ${name}.` });
        logCreateAction('cloudwatch-log-group', 'success', { name });
      } catch (error) {
        logCreateAction('cloudwatch-log-group', 'error', { name, error: error instanceof Error ? error.message : String(error) });
        setCreateError(getCreateErrorMessage(error, 'Failed to create log group'));
      } finally {
        setCreating(false);
      }
    },
    [api, refreshGroupsOptimistically]
  );

  const clearSelectedGroups = useCallback(async () => {
    const groupsToClear = effectiveGroupNames.map((group) => group.trim()).filter(Boolean);
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
  }, [api, effectiveGroupNames, loadGroups]);

  const deleteSelectedGroups = useCallback(async () => {
    const groupsToDelete = effectiveGroupNames.map((group) => group.trim()).filter(Boolean);
    if (!groupsToDelete.length) {
      setStatus({ type: 'error', message: 'No log groups available to delete.' });
      return;
    }

    setLoading(true);
    setGroups((current) => current.filter((group) => !groupsToDelete.includes(group.logGroupName)));
    setSelectedGroups((current) => current.filter((groupName) => !groupsToDelete.includes(groupName)));
    setStreams([]);
    setEvents([]);
    setSelectedEventKey('');
    try {
      await Promise.all(groupsToDelete.map((group) => api.deleteLogGroup(group)));
      await loadGroups({ silent: true });
      setStatus({ type: 'info', message: `Deleted ${groupsToDelete.length} log group(s).` });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to delete selected log groups' });
      await loadGroups({ silent: true });
    } finally {
      setDeleteGroupsOpen(false);
      setLoading(false);
    }
  }, [api, effectiveGroupNames, loadGroups]);

  const updateRetention = useCallback(
    async (retentionRaw: string) => {
      const groupsToUpdate = selectedGroups.map((group) => group.trim()).filter(Boolean);
      if (!groupsToUpdate.length) {
        setEditRetentionError('Select at least one log group first.');
        return;
      }

      const trimmed = retentionRaw.trim();
      const allowedRetention = new Set([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653]);

      if (trimmed) {
        const retention = Number(trimmed);
        if (!Number.isInteger(retention) || !allowedRetention.has(retention)) {
          setEditRetentionError('Use a valid AWS retention value (for example: 7, 14, 30, 90, 365). Leave blank for no retention.');
          return;
        }
      }

      setEditRetentionError('');
      setUpdatingRetention(true);
      try {
        await Promise.all(
          groupsToUpdate.map((group) => {
            if (!trimmed) return api.deleteLogGroupRetentionPolicy(group);
            return api.putLogGroupRetentionPolicy(group, Number(trimmed));
          })
        );
        await loadGroups({ silent: true });
        setEditRetentionOpen(false);
        setStatus({
          type: 'info',
          message: trimmed
            ? `Updated retention to ${trimmed} day(s) for ${groupsToUpdate.length} group(s).`
            : `Removed retention policy for ${groupsToUpdate.length} group(s).`,
        });
      } catch (error) {
        setEditRetentionError(error instanceof Error ? error.message : 'Failed to update retention policy');
      } finally {
        setUpdatingRetention(false);
      }
    },
    [api, loadGroups, selectedGroups]
  );

  const parsedEvents = useMemo(() => {
    type AttributeRow = {
      key: string;
      value: string;
      depth: number;
    };

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

      // Parse protobuf text-like payloads:
      // key:"value" key2:true key3:10 key4:abc
      const fields: Record<string, string> = {};
      const pattern = /([A-Za-z0-9_.-]+)\s*:\s*(?:"([^"]*)"|([^\s]+))/g;
      let match: RegExpExecArray | null = pattern.exec(trimmed);
      while (match) {
        fields[match[1]] = match[2] ?? match[3] ?? '';
        match = pattern.exec(trimmed);
      }

      if (Object.keys(fields).length > 0) {
        return fields;
      }

      // Last resort for scalar request strings.
      return { value: raw };
    };

    const parseJsonString = (raw: string): unknown | null => {
      const trimmed = raw.trim();
      if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return null;
      try {
        return JSON.parse(trimmed);
      } catch {
        return null;
      }
    };

    const flattenAttributeRows = (input: unknown, depth = 0, parentKey = ''): AttributeRow[] => {
      if (Array.isArray(input)) {
        if (input.length === 1) {
          return flattenAttributeRows(input[0], depth, parentKey);
        }

        return input.flatMap((item, index) => {
          const nextKey = `[${index}]`;
          if (item && typeof item === 'object') {
            return [{ key: nextKey, value: '', depth }, ...flattenAttributeRows(item, depth + 1, '')];
          }
          return [{ key: nextKey, value: item === null || item === undefined ? '' : String(item), depth }];
        });
      }

      if (input && typeof input === 'object') {
        return Object.entries(input as Record<string, unknown>).flatMap(([key, value]) => {
          const nextKey = key;

          if (nextKey === 'request' && typeof value === 'string') {
            const requestFields = parseRequestFields(value);
            const parsedKeys = Object.keys(requestFields).filter((itemKey) => itemKey !== 'value');
            if (parsedKeys.length) {
              return [
                { key: nextKey, value: '', depth },
                ...parsedKeys.map((itemKey) => ({
                  key: itemKey,
                  value: requestFields[itemKey] ?? '',
                  depth: depth + 1,
                })),
              ];
            }
          }

          if (typeof value === 'string') {
            const parsedJson = parseJsonString(value);
            if (parsedJson && typeof parsedJson === 'object') {
              return [{ key: nextKey, value: '', depth }, ...flattenAttributeRows(parsedJson, depth + 1, '')];
            }
          }

          if (value && typeof value === 'object') {
            return [{ key: nextKey, value: '', depth }, ...flattenAttributeRows(value, depth + 1, nextKey)];
          }
          return [{ key: nextKey, value: value === null || value === undefined ? '' : String(value), depth }];
        });
      }

      return [{ key: parentKey || 'value', value: input === null || input === undefined ? '' : String(input), depth }];
    };

    const tryParseStructuredMessage = (raw: string): {
      displayMessage: string;
      severityText: string;
      service: string;
      parsedPayload: Record<string, unknown> | null;
      requestFields: Record<string, string>;
      attributeRows: AttributeRow[];
      requestRaw: string;
      enduserId: string;
    } => {
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const body = typeof parsed.body === 'string' ? parsed.body : '';
        const severityText = typeof parsed.severity_text === 'string' ? parsed.severity_text : '';
        const attributes = parsed.attributes && typeof parsed.attributes === 'object' ? (parsed.attributes as Record<string, unknown>) : {};
        const attributeRows = flattenAttributeRows(attributes);
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
          attributeRows,
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
          attributeRows: [],
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
        const payloadText = structured.parsedPayload ? JSON.stringify(structured.parsedPayload) : '';
        const requestFieldText = Object.entries(structured.requestFields)
          .map(([key, value]) => `${key}:${value}`)
          .join(' ');
        const searchableText = normalizeSearchTerm(
          [
            message,
            displayMessage,
            structured.service,
            structured.enduserId,
            structured.requestRaw,
            requestFieldText,
            requestIdMatch?.[0] || '',
            payloadText,
          ].join('\n')
        );
        return {
          ...event,
          level,
          requestId: requestIdMatch?.[0] || '',
          service: structured.service,
          enduserId: structured.enduserId,
          requestRaw: structured.requestRaw,
          requestFields: structured.requestFields,
          attributeRows: structured.attributeRows,
          displayMessage,
          parsedPayload: structured.parsedPayload,
          preview: displayMessage.length > 180 ? `${displayMessage.slice(0, 180)}...` : displayMessage,
          searchableText,
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [events]);

  const filteredEvents = useMemo(() => {
    const severityTarget = severityFilter === 'ALL' ? '' : severityFilter;
    return parsedEvents.filter((event) => {
      const severityMatch =
        !severityTarget ||
        event.level === severityTarget ||
        (severityTarget === 'WARN' && event.level === 'WARNING');
      if (!severityMatch) return false;
      if (!normalizedMessageFilter) return true;
      return event.searchableText.includes(normalizedMessageFilter);
    });
  }, [normalizedMessageFilter, parsedEvents, severityFilter]);

  const getEventKey = useCallback((event: CloudWatchLogEvent) => {
    if (event.eventId) {
      return event.eventId;
    }
    return `${event.timestamp}:${event.ingestionTime}:${event.logStreamName}:${event.message}`;
  }, []);

  useEffect(() => {
    if (!filteredEvents.length) {
      if (selectedEventKey) setSelectedEventKey('');
      return;
    }

    if (!selectedEventKey || !filteredEvents.some((event) => getEventKey(event) === selectedEventKey)) {
      setSelectedEventKey(getEventKey(filteredEvents[0]));
    }
  }, [filteredEvents, getEventKey, selectedEventKey]);

  const selectedEvent = useMemo(() => {
    if (!filteredEvents.length) return null;
    if (!selectedEventKey) return filteredEvents[0];
    return filteredEvents.find((event) => getEventKey(event) === selectedEventKey) || filteredEvents[0];
  }, [filteredEvents, getEventKey, selectedEventKey]);

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
      enabledElements={enabledElements}
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
            <div className='flex items-center gap-2'>
              <Button size='icon' className='size-9' onClick={() => setCreateOpen(true)} aria-label='Create log group' title='Create log group'>
                <Plus className='size-4' />
              </Button>
              <Button
                variant='outline'
                size='icon'
                className='size-9'
                onClick={() => setEditRetentionOpen(true)}
                disabled={!selectedGroups.length || loading}
                aria-label='Edit retention'
                title='Edit retention'
              >
                <Pencil className='size-4' />
              </Button>
              <Button
                variant='outline'
                size='icon'
                className='size-9'
                onClick={clearSelection}
                disabled={loading || !selectedGroups.length}
                aria-label='Clear selection'
                title='Clear selection'
              >
                <X className='size-4' />
              </Button>
              <Button
                variant='destructive'
                size='icon'
                className='size-9'
                onClick={() => setDeleteGroupsOpen(true)}
                disabled={loading || !effectiveGroupNames.length}
                aria-label='Delete log groups'
                title='Delete log groups'
              >
                <Trash2 className='size-4' />
              </Button>
            </div>
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
                    className={cn('w-full rounded-md border px-3 py-2 text-left text-sm transition', active ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-background hover:bg-accent')}
                  >
                    <div className='truncate font-medium'>{group.logGroupName}</div>
                    <p className={cn('mt-1 truncate text-xs', active ? 'text-primary/80' : 'text-muted-foreground')}>{group.retentionInDays ? `${group.retentionInDays} day retention` : 'No retention'}</p>
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
              <div className='flex items-center gap-2'>
                <Button onClick={() => void runFilter()} disabled={loading || !effectiveGroupNames.length}>
                  Run Filter
                </Button>
                <Button variant='outline' onClick={() => void clearFilters()} disabled={loading}>
                  Clear Filters
                </Button>
              </div>
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
                    {streams.length} stream(s) across {effectiveGroupNames.length} selected group(s)
                  </p>
                </div>
                <Button variant='destructive' size='sm' onClick={() => setClearLogsOpen(true)} disabled={loading || !effectiveGroupNames.length}>
                  Clear Logs
                </Button>
              </div>
            </CardHeader>
            <CardContent className='min-h-0 lg:flex-1 lg:overflow-hidden'>
              {!filteredEvents.length ? (
                <p className='text-sm text-muted-foreground'>No events matched current filters.</p>
              ) : (
                <div
                  ref={eventsListRef}
                  className='flex h-full min-h-0 flex-col gap-2 overflow-auto pr-1'
                  tabIndex={0}
                  role='listbox'
                  aria-label='CloudWatch events'
                  onKeyDown={(event) => {
                    if (!filteredEvents.length) return;
                    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

                    event.preventDefault();
                    const currentIndex = filteredEvents.findIndex((item) => getEventKey(item) === selectedEventKey);
                    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
                    const nextIndex =
                      event.key === 'ArrowDown'
                        ? Math.min(filteredEvents.length - 1, safeIndex + 1)
                        : Math.max(0, safeIndex - 1);
                    const nextEvent = filteredEvents[nextIndex];
                    if (!nextEvent) return;

                    setSelectedEventKey(getEventKey(nextEvent));

                    const nextButton = eventsListRef.current?.querySelector<HTMLButtonElement>(`[data-event-key="${getEventKey(nextEvent)}"]`);
                    nextButton?.scrollIntoView({ block: 'nearest' });
                    nextButton?.focus({ preventScroll: true });
                  }}
                >
                  {filteredEvents.map((event) => {
                    const active = getEventKey(event) === selectedEventKey;
                    const timestampLabel = new Date(event.timestamp).toLocaleString();
                    return (
                      <button
                        key={getEventKey(event)}
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
                          <div className='flex w-40 shrink-0 flex-col items-end gap-1'>
                            <span title={timestampLabel} className='block max-w-full truncate text-right text-xs text-muted-foreground'>
                              {timestampLabel}
                            </span>
                            <Badge
                              variant={
                                event.level === 'ERROR'
                                  ? 'destructive'
                                  : event.level === 'WARN' || event.level === 'WARNING'
                                    ? 'warning'
                                    : 'outline'
                              }
                            >
                              {event.level}
                            </Badge>
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
          <CardContent className='flex min-h-0 flex-col lg:flex-1 lg:overflow-hidden'>
              {selectedEvent && selectedEvent.attributeRows?.length ? (
                <div className='mb-3 shrink-0 rounded-md border bg-background/40 p-3'>
                  <p className='mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Attributes</p>
                  <dl className='grid gap-1'>
                    {selectedEvent.attributeRows.map((entry, index) => (
                      <div key={`${selectedEvent.eventId}-${entry.key}-${index}`} className='grid grid-cols-[180px_minmax(0,1fr)] gap-2 text-xs'>
                        <dt className='truncate text-muted-foreground' style={{ paddingLeft: `${entry.depth * 10}px` }}>{entry.key}</dt>
                        <dd className='whitespace-pre-wrap break-all font-medium text-foreground'>{entry.value}</dd>
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
                className='flex-1 min-h-0'
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
      <CreateResourceDialog
        open={editRetentionOpen}
        onOpenChange={(open) => {
          setEditRetentionOpen(open);
          if (!open) setEditRetentionError('');
        }}
        title='Update Log Retention'
        description={`Set retention for ${selectedGroups.length} selected log group(s). Leave blank to keep logs indefinitely.`}
        label='Retention Days'
        placeholder='e.g. 30 (leave blank for no retention)'
        confirmLabel='Update Retention'
        submitting={updatingRetention}
        errorMessage={editRetentionError}
        allowEmptySubmit
        onSubmit={updateRetention}
      />
      <ConfirmDialog
        open={clearLogsOpen}
        onOpenChange={setClearLogsOpen}
        title='Clear CloudWatch Logs'
        description={
          <>
            This will delete and recreate <strong>{effectiveGroupNames.length} {selectedGroups.length ? 'selected' : 'available'} log group(s)</strong>. Existing events will be removed.
          </>
        }
        onCancel={() => setClearLogsOpen(false)}
        onConfirm={() => void clearSelectedGroups()}
        confirmLabel='Clear Logs'
        confirmDisabled={loading || !effectiveGroupNames.length}
        cancelDisabled={loading}
      />
      <ConfirmDialog
        open={deleteGroupsOpen}
        onOpenChange={setDeleteGroupsOpen}
        title='Delete CloudWatch Log Groups'
        description={
          <>
            This will permanently delete <strong>{effectiveGroupNames.length} log group(s)</strong>.
          </>
        }
        onCancel={() => setDeleteGroupsOpen(false)}
        onConfirm={() => void deleteSelectedGroups()}
        confirmLabel='Delete Log Groups'
        confirmDisabled={loading || !effectiveGroupNames.length}
        cancelDisabled={loading}
      />
    </ServiceShell>
  );
}
