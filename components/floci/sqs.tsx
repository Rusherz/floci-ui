'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { ConfirmDialog } from '@/components/floci/confirm-dialog';
import { CreateResourceDialog } from '@/components/floci/create-resource-dialog';
import { DetailSkeleton, ListSkeleton } from '@/components/floci/loading';
import { ScrollableCodeBlock } from '@/components/floci/scrollable-code-block';
import { ServicePanelColumn } from '@/components/floci/service-panel-column';
import { ServiceShell } from '@/components/floci/service-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { filterBySearch } from '@/lib/floci/search';
import { EMPTY_SERVICE_STATUS, type ServiceStatus } from '@/lib/floci/service-ui';
import { createApiClient } from '@/lib/floci/api';
import { selectableRowButtonClass, selectableRowMetaTextClass } from '@/lib/floci/button-styles';
import { createApiConfig } from '@/lib/floci/config';
import { createInitialState, STORAGE_KEYS, type AppState, type Queue, VIEWS } from '@/lib/floci/types';
import { applyLoadedUiState, joinUrl, loadUiState, persistUiState } from '@/lib/floci/utils';
import type { FlociElement } from '@/lib/floci/elements';

type Banner = ServiceStatus;

type ConfirmState = {
  open: boolean;
  title: string;
  message: string;
};

function clampIndex(index: number, maxLength: number): number {
  if (!maxLength) return 0;
  return Math.max(0, Math.min(index, maxLength - 1));
}

export function SqsOpsPage({ enabledElements }: { enabledElements: FlociElement[] }) {
  const apiConfig = useMemo(() => createApiConfig(), []);
  const api = useMemo(() => createApiClient(apiConfig), [apiConfig]);

  const [state, setState] = useState<AppState>(() => {
    const initial = createInitialState(apiConfig);
    initial.view = VIEWS.sqs;
    return initial;
  });
  const stateRef = useRef<AppState>(state);

  const [bootstrapped, setBootstrapped] = useState(false);
  const [banner, setBanner] = useState<Banner>(EMPTY_SERVICE_STATUS);
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    open: false,
    title: 'Confirm',
    message: '',
  });
  const [createQueueOpen, setCreateQueueOpen] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [selectedMessageKeys, setSelectedMessageKeys] = useState<Set<string>>(new Set());
  const [sqsAdvancedOpen, setSqsAdvancedOpen] = useState(false);
  const [sqsSettings, setSqsSettings] = useState({
    delaySeconds: '0',
    visibilityTimeout: '30',
    messageRetentionPeriod: '345600',
    receiveMessageWaitTimeSeconds: '0',
    maximumMessageSize: '262144',
    contentBasedDeduplication: false,
  });
  const [hasLoadedInitial, setHasLoadedInitial] = useState(false);

  const confirmResolveRef = useRef<((value: boolean) => void) | null>(null);
  const lastMessageAnchorRef = useRef<number | null>(null);

  const commitState = useCallback((recipe: (draft: AppState) => void) => {
    const next = structuredClone(stateRef.current);
    recipe(next);
    stateRef.current = next;
    setState(next);
    return next;
  }, []);

  const setStatus = useCallback((message: string, type: Banner['type'] = 'info') => {
    if (!message) {
      setBanner({ type: null, message: '' });
      return;
    }

    setBanner({ type, message });
  }, []);

  const getFilteredQueues = useCallback((snapshot: AppState): Queue[] => {
    return filterBySearch(snapshot.sqs.queues, snapshot.search, (queue) => queue.name);
  }, []);

  const extractQueueUrl = useCallback(
    (queueName: string) => `${joinUrl(apiConfig.baseUrl)}/${apiConfig.sqsAccountId}/${queueName}`,
    [apiConfig.baseUrl, apiConfig.sqsAccountId]
  );

  const loadMessagesForQueue = useCallback(
    async (queue: Queue, force = false) => {
      const cached = stateRef.current.sqs.messagesByQueue[queue.name];
      if (cached && !force) {
        return cached;
      }

      const queueUrl = queue.queueUrl || extractQueueUrl(queue.name);
      const messages = await api.loadMessagesForQueue(queueUrl);
      commitState((draft) => {
        draft.sqs.messagesByQueue[queue.name] = messages;
      });
      return messages;
    },
    [api, commitState, extractQueueUrl]
  );

  const refreshSqsView = useCallback(
    async (options?: { silent?: boolean }) => {
      const snapshot = stateRef.current;
      const silent = options?.silent ?? false;

      if (!silent) {
        commitState((draft) => {
          draft.loading = true;
        });
      }

      try {
        if (!silent) {
          setStatus('Loading SQS data...', 'info');
        }

        const queues = await api.loadQueues();
        const selectedQueue = clampIndex(snapshot.selectedQueue, queues.length);
        const messagesByQueue: AppState['sqs']['messagesByQueue'] = {};

        let selectedMessage = 0;

        if (queues.length) {
          const queue = queues[selectedQueue];
          const queueMessages = await api.loadMessagesForQueue(queue.queueUrl || extractQueueUrl(queue.name));
          messagesByQueue[queue.name] = queueMessages;
          selectedMessage = clampIndex(snapshot.selectedMessage, queueMessages.length);
        }

        commitState((draft) => {
          draft.sqs.queues = queues;
          draft.sqs.messagesByQueue = messagesByQueue;
          draft.selectedQueue = selectedQueue;
          draft.selectedMessage = selectedMessage;
          draft.polling.nextPollAt = Date.now() + draft.polling.intervalMs;
        });

        if (!silent) {
          setStatus(`Loaded ${queues.length} queue(s).`, 'info');
        }
        setHasLoadedInitial(true);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to refresh view', 'error');
      } finally {
        if (!silent) {
          commitState((draft) => {
            draft.loading = false;
          });
        }
      }
    },
    [api, commitState, extractQueueUrl, setStatus]
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      commitState((draft) => {
        draft.search = value;
        draft.selectedQueue = 0;
        draft.selectedMessage = 0;
      });
    },
    [commitState]
  );

  const handleRefresh = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        commitState((draft) => {
          draft.sqs.messagesByQueue = {};
        });
      }

      await refreshSqsView({ silent: options?.silent });
    },
    [commitState, refreshSqsView]
  );

  const handleSelectQueue = useCallback(
    async (index: number) => {
      commitState((draft) => {
        draft.selectedQueue = index;
        draft.selectedMessage = 0;
      });

      const snapshot = stateRef.current;
      const selectedQueue = getFilteredQueues(snapshot)[snapshot.selectedQueue];
      if (!selectedQueue) {
        return;
      }

      try {
        commitState((draft) => {
          draft.loading = true;
        });
        await loadMessagesForQueue(selectedQueue);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to load queue messages', 'error');
      } finally {
        commitState((draft) => {
          draft.loading = false;
        });
      }
    },
    [commitState, getFilteredQueues, loadMessagesForQueue, setStatus]
  );

  const confirmDialog = useCallback((message: string, title = 'Confirm') => {
    return new Promise<boolean>((resolve) => {
      confirmResolveRef.current = resolve;
      setConfirmState({
        open: true,
        title,
        message,
      });
    });
  }, []);

  const resolveConfirm = useCallback((value: boolean) => {
    setConfirmState((prev) => ({ ...prev, open: false }));
    if (confirmResolveRef.current) {
      const resolve = confirmResolveRef.current;
      confirmResolveRef.current = null;
      resolve(value);
    }
  }, []);

  const handleDeleteMessage = useCallback(async () => {
    const snapshot = stateRef.current;
    const queue = getFilteredQueues(snapshot)[snapshot.selectedQueue];
    const messages = queue ? snapshot.sqs.messagesByQueue[queue.name] || [] : [];
    if (!queue || !messages.length) {
      return;
    }
    const multiActive = selectedMessageKeys.size > 1;
    const targetMessages = multiActive
      ? messages.filter((message, index) => selectedMessageKeys.has(message.raw?.receiptHandle || `${message.id}:${index}`))
      : [messages[snapshot.selectedMessage]].filter(Boolean);
    const validTargets = targetMessages.filter((message) => message?.raw?.receiptHandle && message?.id);
    if (!validTargets.length) {
      return;
    }

    const confirmed = await confirmDialog(
      multiActive
        ? `Delete ${validTargets.length} messages from ${queue.name}?`
        : `Delete message ${validTargets[0].id} from ${queue.name}?`,
      multiActive ? 'Delete Messages' : 'Delete Message'
    );
    if (!confirmed) {
      return;
    }

    try {
      commitState((draft) => {
        draft.loading = true;
      });

      const queueUrl = queue.queueUrl || extractQueueUrl(queue.name);
      const latestMessages = await api.loadMessagesForQueue(queueUrl);
      for (const message of validTargets) {
        const latestMatch = latestMessages.find((candidate) => candidate.id === message.id);
        const freshReceiptHandle = latestMatch?.raw?.receiptHandle || message.raw.receiptHandle;
        await api.deleteMessage(queueUrl, freshReceiptHandle);
      }

      const refreshed = await api.loadMessagesForQueue(queueUrl);
      commitState((draft) => {
        draft.sqs.messagesByQueue[queue.name] = refreshed;
        draft.selectedMessage = 0;
      });
      setSelectedMessageKeys(new Set());

      setStatus(multiActive ? `Deleted ${validTargets.length} messages.` : `Deleted message ${validTargets[0].id}`, 'info');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to delete message', 'error');
    } finally {
      commitState((draft) => {
        draft.loading = false;
      });
    }
  }, [api, commitState, confirmDialog, extractQueueUrl, getFilteredQueues, selectedMessageKeys, setStatus]);

  const handleCreateQueue = useCallback(
    async (rawName: string) => {
      const name = rawName.trim();
      const isValid = /^[A-Za-z0-9_-]{1,80}(\.fifo)?$/.test(name);

      if (!isValid) {
        setCreateError('Queue name must be 1-80 chars using letters, numbers, hyphen, underscore, optional .fifo.');
        return;
      }

      setCreateSubmitting(true);
      setCreateError('');
      try {
        const delay = Number(sqsSettings.delaySeconds.trim());
        const visibility = Number(sqsSettings.visibilityTimeout.trim());
        const retention = Number(sqsSettings.messageRetentionPeriod.trim());
        const waitTime = Number(sqsSettings.receiveMessageWaitTimeSeconds.trim());
        const maxSize = Number(sqsSettings.maximumMessageSize.trim());
        const validNumbers =
          Number.isInteger(delay) &&
          Number.isInteger(visibility) &&
          Number.isInteger(retention) &&
          Number.isInteger(waitTime) &&
          Number.isInteger(maxSize);
        if (!validNumbers) {
          throw new Error('Advanced SQS settings must be integers.');
        }
        if (delay < 0 || delay > 900) {
          throw new Error('Delay Seconds must be between 0 and 900.');
        }
        if (visibility < 0 || visibility > 43200) {
          throw new Error('Visibility Timeout must be between 0 and 43200.');
        }
        if (retention < 60 || retention > 1209600) {
          throw new Error('Message Retention must be between 60 and 1209600.');
        }
        if (waitTime < 0 || waitTime > 20) {
          throw new Error('Receive Wait Time must be between 0 and 20.');
        }
        if (maxSize < 1024 || maxSize > 262144) {
          throw new Error('Max Message Size must be between 1024 and 262144.');
        }

        const attrs: Record<string, string> = {
          DelaySeconds: String(delay),
          VisibilityTimeout: String(visibility),
          MessageRetentionPeriod: String(retention),
          ReceiveMessageWaitTimeSeconds: String(waitTime),
          MaximumMessageSize: String(maxSize),
        };
        const isFifo = name.endsWith('.fifo');
        if (isFifo) {
          attrs.FifoQueue = 'true';
          attrs.ContentBasedDeduplication = sqsSettings.contentBasedDeduplication ? 'true' : 'false';
        }

        await api.createSqsQueue(name, attrs);

        const queues = await api.loadQueues();
        const selectedQueue = Math.max(
          0,
          queues.findIndex((queue) => queue.name === name)
        );
        const messagesByQueue: AppState['sqs']['messagesByQueue'] = {};
        let selectedMessage = 0;

        if (queues.length) {
          const queue = queues[selectedQueue];
          const queueMessages = await api.loadMessagesForQueue(queue.queueUrl || extractQueueUrl(queue.name));
          messagesByQueue[queue.name] = queueMessages;
          selectedMessage = clampIndex(0, queueMessages.length);
        }

        commitState((draft) => {
          draft.sqs.queues = queues;
          draft.sqs.messagesByQueue = messagesByQueue;
          draft.selectedQueue = selectedQueue;
          draft.selectedMessage = selectedMessage;
        });

        setCreateQueueOpen(false);
        setStatus(`Created queue ${name}.`, 'info');
      } catch (error) {
        setCreateError(error instanceof Error ? error.message : 'Failed to create queue');
      } finally {
        setCreateSubmitting(false);
      }
    },
    [api, commitState, extractQueueUrl, setStatus, sqsSettings]
  );

  const filteredQueues = useMemo(() => getFilteredQueues(state), [getFilteredQueues, state]);
  const selectedQueue = filteredQueues[clampIndex(state.selectedQueue, filteredQueues.length)] || null;
  const selectedQueueMessages = selectedQueue ? state.sqs.messagesByQueue[selectedQueue.name] || [] : [];
  const selectedMessage = selectedQueueMessages[clampIndex(state.selectedMessage, selectedQueueMessages.length)] || null;
  const messageMultiSelectActive = selectedMessageKeys.size > 1;
  const isInitialLoading = state.loading && !hasLoadedInitial;

  useEffect(() => {
    const saved = loadUiState(STORAGE_KEYS.uiState);
    if (saved) {
      commitState((draft) => {
        applyLoadedUiState(draft, saved);
        draft.view = VIEWS.sqs;
      });
    }

    setBootstrapped(true);
  }, [commitState]);

  useEffect(() => {
    if (!bootstrapped) return;

    persistUiState(state, STORAGE_KEYS.uiState);
  }, [bootstrapped, state]);

  useEffect(() => {
    if (!bootstrapped) return;

    void refreshSqsView();
  }, [bootstrapped, refreshSqsView]);

  const handleSelectMessage = useCallback(
    (index: number, event?: MouseEvent<HTMLButtonElement>) => {
      const withRange = Boolean(event?.shiftKey);
      const withToggle = Boolean(event?.metaKey || event?.ctrlKey);
      if (withRange && event) {
        event.preventDefault();
      }
      const snapshot = stateRef.current;
      const queue = getFilteredQueues(snapshot)[snapshot.selectedQueue];
      const messages = queue ? snapshot.sqs.messagesByQueue[queue.name] || [] : [];
      const message = messages[index];
      if (!message) return;
      const key = message.raw?.receiptHandle || `${message.id}:${index}`;

      setSelectedMessageKeys((prev) => {
        const next = new Set(prev);
        if (withRange && lastMessageAnchorRef.current !== null) {
          const start = Math.min(lastMessageAnchorRef.current, index);
          const end = Math.max(lastMessageAnchorRef.current, index);
          for (let i = start; i <= end; i += 1) {
            const candidate = messages[i];
            if (!candidate) continue;
            next.add(candidate.raw?.receiptHandle || `${candidate.id}:${i}`);
          }
        } else if (withToggle) {
          if (next.has(key)) {
            next.delete(key);
          } else {
            next.add(key);
          }
          lastMessageAnchorRef.current = index;
        } else {
          next.clear();
          next.add(key);
          lastMessageAnchorRef.current = index;
        }
        return next;
      });

      commitState((draft) => {
        draft.selectedMessage = index;
      });
    },
    [commitState, getFilteredQueues]
  );

  useEffect(() => {
    setSelectedMessageKeys(new Set());
    lastMessageAnchorRef.current = null;
  }, [state.selectedQueue, selectedQueue?.name]);

  return (
    <ServiceShell
      enabledElements={enabledElements}
      activeSlug={VIEWS.sqs}
      title='SQS'
      description='Queue operations, message inspection, and timed polling.'
      search={state.search}
      onSearchChange={handleSearchChange}
      searchPlaceholder='Search queues...'
      pollingIntervalMs={state.polling.intervalMs}
      pollingDefaultEnabled
      onRefresh={(options) => void handleRefresh(options)}
      refreshDisabled={state.loading}
      status={banner}
      contentClassName='overflow-hidden p-4 md:p-6'
    >
      <Card className='min-h-0 rounded-md shadow-none xl:flex xl:h-full xl:flex-col xl:overflow-hidden'>
        <CardHeader>
          <div className='flex items-center justify-between gap-2'>
            <CardTitle className='text-base'>Queues ({filteredQueues.length})</CardTitle>
            <Button
              variant='emphasis'
              size='icon'
              className='size-9'
              aria-label='Create queue'
              title='Create queue'
              onClick={() => {
                setCreateError('');
                setSqsAdvancedOpen(false);
                setCreateQueueOpen(true);
              }}
            >
              <Plus className='size-4' />
            </Button>
          </div>
        </CardHeader>
        <CardContent className='xl:min-h-0 xl:flex-1'>
          {isInitialLoading ? (
            <ListSkeleton items={8} inline />
          ) : !filteredQueues.length ? (
            <p className='text-sm text-muted-foreground'>No queues found.</p>
          ) : (
            <div className='flex max-h-[560px] flex-col gap-2 overflow-auto pr-1 xl:h-full xl:max-h-none xl:min-h-0'>
              {filteredQueues.map((queue, index) => {
                const active = index === clampIndex(state.selectedQueue, filteredQueues.length);

                return (
                  <button
                    key={queue.name}
                    type='button'
                    onClick={() => void handleSelectQueue(index)}
                    className={selectableRowButtonClass(active)}
                  >
                    {queue.name}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ServicePanelColumn rowsClassName='lg:grid-rows-[minmax(0,2fr)_minmax(0,1fr)]'>
        <Card className='min-h-0 rounded-md shadow-none lg:flex lg:h-full lg:flex-col lg:overflow-hidden'>
          <CardHeader>
            <div className='flex items-center justify-between gap-2'>
              <CardTitle className='text-base'>Messages</CardTitle>
            </div>
          </CardHeader>
          <CardContent className='min-h-0 lg:flex-1 lg:overflow-hidden'>
            {isInitialLoading ? (
              <ListSkeleton items={6} inline />
            ) : !selectedQueue || !selectedQueueMessages.length ? (
              <p className='text-sm text-muted-foreground'>No messages available.</p>
            ) : (
              <div className='flex h-full min-h-0 flex-col gap-2 overflow-auto pr-1'>
                {selectedQueueMessages.map((message, index) => {
                  const selectionKey = message.raw?.receiptHandle || `${message.id}:${index}`;
                  const active =
                    selectedMessageKeys.has(selectionKey) ||
                    (!selectedMessageKeys.size && index === clampIndex(state.selectedMessage, selectedQueueMessages.length));
                  return (
                    <button
                      key={message.id}
                      type='button'
                      onClick={(event) => handleSelectMessage(index, event)}
                      className={selectableRowButtonClass(active, 'select-none')}
                    >
                      <div>{message.id}</div>
                      {message.sentAt && (
                        <p className={selectableRowMetaTextClass(active, 'mt-1')}>
                          {message.sentAt}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className='min-h-[220px] rounded-md shadow-none lg:flex lg:flex-col lg:overflow-hidden'>
          <CardHeader>
            <div className='flex items-center justify-between gap-2'>
              <CardTitle className='text-base'>Message Detail</CardTitle>
              <Button
                variant='destructive'
                size='sm'
                aria-label='Delete selected message'
                onClick={() => void handleDeleteMessage()}
                disabled={!selectedQueue || (!selectedMessage?.raw?.receiptHandle && !selectedMessageKeys.size)}
              >
                <Trash2 className='size-4' />
              </Button>
            </div>
          </CardHeader>
          <CardContent className='min-h-0 lg:flex-1 lg:overflow-hidden'>
            {isInitialLoading ? (
              <DetailSkeleton lines={9} />
            ) : (
              <ScrollableCodeBlock
                content={
                  !messageMultiSelectActive && selectedQueue && selectedMessage
                    ? JSON.stringify(
                        {
                          queue: selectedQueue.name,
                          queueUrl: selectedQueue.queueUrl || extractQueueUrl(selectedQueue.name),
                          message: selectedMessage,
                        },
                        null,
                        2
                      )
                    : messageMultiSelectActive
                      ? 'Preview disabled while multi-select is active.'
                      : 'Select a message.'
                }
                fillContainer
              />
            )}
          </CardContent>
        </Card>
      </ServicePanelColumn>

      <ConfirmDialog
        open={confirmState.open}
        onOpenChange={(open) => {
          if (!open) {
            resolveConfirm(false);
          }
        }}
        title={confirmState.title}
        description={confirmState.message}
        onCancel={() => resolveConfirm(false)}
        onConfirm={() => resolveConfirm(true)}
      />

      <CreateResourceDialog
        open={createQueueOpen}
        onOpenChange={(open) => {
          setCreateQueueOpen(open);
          if (!open) {
            setCreateError('');
          }
        }}
        title='Create SQS Queue'
        description='Create a new queue in local Floci.'
        label='Queue Name'
        placeholder='my-queue'
        confirmLabel='Create Queue'
        submitting={createSubmitting}
        errorMessage={createError}
        submitDisabled={
          !sqsSettings.delaySeconds.trim() ||
          !sqsSettings.visibilityTimeout.trim() ||
          !sqsSettings.messageRetentionPeriod.trim() ||
          !sqsSettings.receiveMessageWaitTimeSeconds.trim() ||
          !sqsSettings.maximumMessageSize.trim()
        }
        onSubmit={handleCreateQueue}
      >
        <div className='grid gap-2'>
          <Button type='button' variant='link' size='sm' className='h-auto w-fit p-0 text-xs' onClick={() => setSqsAdvancedOpen((current) => !current)}>
            {sqsAdvancedOpen ? 'Hide advanced settings' : 'Show advanced settings'}
          </Button>
          {sqsAdvancedOpen ? (
            <div className='grid gap-2 rounded-md border p-3 sm:grid-cols-2'>
              <div className='grid gap-1'>
                <p className='text-xs text-muted-foreground'>Delay Seconds</p>
                <Input value={sqsSettings.delaySeconds} onChange={(event) => setSqsSettings((current) => ({ ...current, delaySeconds: event.target.value }))} />
              </div>
              <div className='grid gap-1'>
                <p className='text-xs text-muted-foreground'>Visibility Timeout</p>
                <Input value={sqsSettings.visibilityTimeout} onChange={(event) => setSqsSettings((current) => ({ ...current, visibilityTimeout: event.target.value }))} />
              </div>
              <div className='grid gap-1'>
                <p className='text-xs text-muted-foreground'>Message Retention</p>
                <Input
                  value={sqsSettings.messageRetentionPeriod}
                  onChange={(event) => setSqsSettings((current) => ({ ...current, messageRetentionPeriod: event.target.value }))}
                />
              </div>
              <div className='grid gap-1'>
                <p className='text-xs text-muted-foreground'>Receive Wait Time</p>
                <Input
                  value={sqsSettings.receiveMessageWaitTimeSeconds}
                  onChange={(event) => setSqsSettings((current) => ({ ...current, receiveMessageWaitTimeSeconds: event.target.value }))}
                />
              </div>
              <div className='grid gap-1'>
                <p className='text-xs text-muted-foreground'>Max Message Size</p>
                <Input value={sqsSettings.maximumMessageSize} onChange={(event) => setSqsSettings((current) => ({ ...current, maximumMessageSize: event.target.value }))} />
              </div>
              <div className='flex items-end'>
                <Button
                  type='button'
                  variant={sqsSettings.contentBasedDeduplication ? 'default' : 'outline'}
                  size='sm'
                  onClick={() =>
                    setSqsSettings((current) => ({
                      ...current,
                      contentBasedDeduplication: !current.contentBasedDeduplication,
                    }))
                  }
                >
                  Content-Based Dedup
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </CreateResourceDialog>
    </ServiceShell>
  );
}
