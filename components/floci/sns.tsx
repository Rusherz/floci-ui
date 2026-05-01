'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { BoundedTextarea } from '@/components/floci/bounded-textarea';
import { CreateResourceDialog } from '@/components/floci/create-resource-dialog';
import { ServicePanelColumn } from '@/components/floci/service-panel-column';
import { ServiceShell } from '@/components/floci/service-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { createApiClient } from '@/lib/floci/api';
import { createApiConfig } from '@/lib/floci/config';
import type { SnsSubscription, SnsTopic } from '@/lib/floci/types';
import { cn } from '@/lib/utils';

export default function SnsPage() {
  const api = useMemo(() => createApiClient(createApiConfig()), []);

  const [topics, setTopics] = useState<SnsTopic[]>([]);
  const [selectedTopicArn, setSelectedTopicArn] = useState('');
  const [subscriptions, setSubscriptions] = useState<SnsSubscription[]>([]);
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<{ type: 'info' | 'error' | null; message: string }>({ type: null, message: '' });
  const [loading, setLoading] = useState(false);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const selectedTopic = topics.find((topic) => topic.arn === selectedTopicArn) || null;

  const loadTopics = useCallback(async () => {
    setLoading(true);
    try {
      const nextTopics = await api.loadSnsTopics();
      setTopics(nextTopics);
      setSelectedTopicArn((current) => {
        if (current && nextTopics.some((topic) => topic.arn === current)) {
          return current;
        }
        return nextTopics[0]?.arn || '';
      });
      setStatus({ type: 'info', message: `Loaded ${nextTopics.length} topic(s).` });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to load SNS topics' });
    } finally {
      setLoading(false);
    }
  }, [api]);

  const loadSubscriptions = useCallback(
    async (topicArn: string) => {
      if (!topicArn) {
        setSubscriptions([]);
        return;
      }

      setSubscriptionsLoading(true);
      try {
        const nextSubscriptions = await api.loadSnsSubscriptionsByTopic(topicArn);
        setSubscriptions(nextSubscriptions);
      } catch (error) {
        setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to load subscriptions' });
      } finally {
        setSubscriptionsLoading(false);
      }
    },
    [api]
  );

  useEffect(() => {
    void loadTopics();
  }, [loadTopics]);

  useEffect(() => {
    void loadSubscriptions(selectedTopicArn);
  }, [loadSubscriptions, selectedTopicArn]);

  const filteredTopics = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return topics;
    return topics.filter((topic) => topic.name.toLowerCase().includes(query));
  }, [search, topics]);

  const publishMessage = useCallback(async () => {
    if (!selectedTopicArn || !message.trim()) {
      setStatus({ type: 'error', message: 'Select a topic and provide a message first.' });
      return;
    }

    setLoading(true);
    try {
      const messageId = await api.publishSnsMessage(selectedTopicArn, message.trim(), subject.trim());
      setStatus({ type: 'info', message: `Published message ${messageId || '(no id returned)'}.` });
      setMessage('');
      setSubject('');
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to publish message' });
    } finally {
      setLoading(false);
    }
  }, [api, message, selectedTopicArn, subject]);

  const createTopic = useCallback(
    async (nameRaw: string) => {
      const name = nameRaw.trim();
      if (!/^[A-Za-z0-9_-]{1,256}(\.fifo)?$/.test(name)) {
        setCreateError('Topic name must be 1-256 chars and use letters, numbers, underscore, hyphen, optional .fifo.');
        return;
      }
      setCreateError('');
      setCreating(true);
      try {
        const arn = await api.createSnsTopic(name);
        await loadTopics();
        setSelectedTopicArn(arn);
        setCreateOpen(false);
        setStatus({ type: 'info', message: `Created topic ${name}.` });
      } catch (error) {
        setCreateError(error instanceof Error ? error.message : 'Failed to create topic');
      } finally {
        setCreating(false);
      }
    },
    [api, loadTopics]
  );

  return (
    <ServiceShell
      activeSlug='sns'
      title='SNS'
      description='Topics, subscriptions, and publish workflows.'
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder='Search topics...'
      onRefresh={() => void loadTopics()}
      refreshDisabled={loading}
      status={status}
    >
            <Card className='min-h-0 min-w-0 rounded-md shadow-none xl:flex xl:h-full xl:flex-col xl:overflow-hidden'>
              <CardHeader>
                <div className='flex items-center justify-between gap-2'>
                  <CardTitle className='text-base'>Topics ({filteredTopics.length})</CardTitle>
                  <Button size='sm' onClick={() => setCreateOpen(true)}>
                    Create Topic
                  </Button>
                </div>
              </CardHeader>
              <CardContent className='xl:min-h-0 xl:flex-1'>
                {!filteredTopics.length ? (
                  <p className='text-sm text-muted-foreground'>No topics found.</p>
                ) : (
                  <div className='flex max-h-[560px] flex-col gap-2 overflow-auto pr-1 xl:h-full xl:max-h-none xl:min-h-0'>
                    {filteredTopics.map((topic) => {
                      const active = topic.arn === selectedTopicArn;
                      return (
                        <button
                          key={topic.arn}
                          type='button'
                          onClick={() => setSelectedTopicArn(topic.arn)}
                          className={cn('w-full rounded-md border px-3 py-2 text-left text-sm transition', active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-accent')}
                        >
                          <div className='truncate font-medium'>{topic.name}</div>
                          <p className={cn('mt-1 truncate text-xs', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{topic.arn}</p>
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
                  <CardTitle className='text-base'>Subscriptions</CardTitle>
                </CardHeader>
                <CardContent className='min-h-0 lg:flex-1 lg:overflow-hidden'>
                  {!selectedTopic ? (
                    <p className='text-sm text-muted-foreground'>Select a topic.</p>
                  ) : subscriptionsLoading ? (
                    <p className='text-sm text-muted-foreground'>Loading subscriptions...</p>
                  ) : !subscriptions.length ? (
                    <p className='text-sm text-muted-foreground'>No subscriptions for this topic.</p>
                  ) : (
                    <div className='flex h-full min-h-0 flex-col gap-2 overflow-auto pr-1'>
                      {subscriptions.map((subscription) => (
                        <div key={subscription.subscriptionArn || `${subscription.protocol}:${subscription.endpoint}`} className='rounded-md border p-3 text-sm'>
                          <div className='font-medium'>{subscription.protocol}</div>
                          <p className='truncate text-xs text-muted-foreground'>{subscription.endpoint}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className='min-h-[240px] min-w-0 rounded-md shadow-none lg:flex lg:flex-col lg:overflow-hidden'>
                <CardHeader>
                  <CardTitle className='text-base'>Publish Message</CardTitle>
                </CardHeader>
                <CardContent className='grid gap-3'>
                  <Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder='Subject (optional)' />
                  <BoundedTextarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder='Message payload'
                    minHeightClassName='min-h-[120px]'
                    maxHeightClassName='max-h-[36vh]'
                  />
                  <Button onClick={() => void publishMessage()} disabled={loading || !selectedTopicArn || !message.trim()}>
                    Publish
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
              title='Create SNS Topic'
              description='Create a new topic in local Floci.'
              label='Topic Name'
              placeholder='my-topic'
              confirmLabel='Create Topic'
              submitting={creating}
              errorMessage={createError}
              onSubmit={createTopic}
            />
    </ServiceShell>
  );
}
