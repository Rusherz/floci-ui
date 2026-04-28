'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { ServicePanelColumn } from '@/components/floci/service-panel-column';
import { ServiceShell } from '@/components/floci/service-shell';
import { ScrollableCodeBlock } from '@/components/floci/scrollable-code-block';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
  const [status, setStatus] = useState<{ type: 'info' | 'error' | null; message: string }>({ type: null, message: '' });
  const [loading, setLoading] = useState(false);

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

  const runFilter = useCallback(async () => {
    if (!selectedGroup) {
      setStatus({ type: 'error', message: 'Select a log group first.' });
      return;
    }

    setLoading(true);
    try {
      const next = await api.filterLogEvents(selectedGroup, filterPattern.trim());
      setEvents(next);
      setStatus({ type: 'info', message: `Loaded ${next.length} event(s).` });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to filter logs' });
    } finally {
      setLoading(false);
    }
  }, [api, filterPattern, selectedGroup]);

  return (
    <ServiceShell
      activeSlug='cloudwatch'
      title='CloudWatch Logs'
      description='Log groups, streams, and filtered event viewing.'
      summaryCountLabel={`${groups.length} group(s)`}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder='Search log groups...'
      onRefresh={() => void loadGroups()}
      refreshDisabled={loading}
      status={status}
    >
      <Card className='min-h-0 min-w-0 rounded-md shadow-none xl:flex xl:h-full xl:flex-col xl:overflow-hidden'>
        <CardHeader>
          <CardTitle className='text-base'>Log Groups</CardTitle>
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

      <ServicePanelColumn rowsClassName='lg:grid-rows-[auto_minmax(0,1fr)]'>
        <Card className='min-h-[180px] min-w-0 rounded-md shadow-none'>
          <CardHeader>
            <CardTitle className='text-base'>Filter</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-3'>
            <Input value={filterPattern} onChange={(event) => setFilterPattern(event.target.value)} placeholder='Filter pattern (optional)' />
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
            <ScrollableCodeBlock content={JSON.stringify(events, null, 2) || '[]'} fillContainer />
          </CardContent>
        </Card>
      </ServicePanelColumn>
    </ServiceShell>
  );
}
