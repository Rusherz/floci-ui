'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Folder, Moon, RefreshCcw, Sun } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { createApiClient } from '@/lib/floci/api';
import { createApiConfig } from '@/lib/floci/config';
import { createInitialState, STORAGE_KEYS, type AppState, type FileEntry, type Queue, type View, VIEWS } from '@/lib/floci/types';
import { applyLoadedUiState, joinUrl, loadUiState, locationKey, parentPrefix, persistUiState } from '@/lib/floci/utils';

type Banner = {
  type: 'info' | 'error' | null;
  message: string;
};

type ConfirmState = {
  open: boolean;
  title: string;
  message: string;
};

type ObjectViewModel = {
  folders: { type: 'folder'; name: string; prefix: string }[];
  files: FileEntry[];
  loading: boolean;
  emptyMessage: string;
  normalizedPathQuery: string;
  isPathSearch: boolean;
};

function clampIndex(index: number, maxLength: number): number {
  if (!maxLength) return 0;
  return Math.max(0, Math.min(index, maxLength - 1));
}

function readStoredTheme(): 'light' | 'dark' {
  try {
    const value = window.localStorage.getItem(STORAGE_KEYS.theme);
    if (value === 'light' || value === 'dark') {
      return value;
    }
  } catch {
    // noop
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function HomePage() {
  const apiConfig = useMemo(() => createApiConfig(), []);
  const api = useMemo(() => createApiClient(apiConfig), [apiConfig]);

  const [state, setState] = useState<AppState>(() => createInitialState(apiConfig));
  const stateRef = useRef<AppState>(state);

  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [bootstrapped, setBootstrapped] = useState(false);
  const [banner, setBanner] = useState<Banner>({ type: null, message: '' });
  const [pollProgress, setPollProgress] = useState(0);
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    open: false,
    title: 'Confirm',
    message: '',
  });

  const confirmResolveRef = useRef<((value: boolean) => void) | null>(null);

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

  const clearS3SearchState = useCallback(
    ({ incrementRequestId = false }: { incrementRequestId?: boolean } = {}) => {
      commitState((draft) => {
        draft.s3.searchResults = null;
        draft.s3.searchLoading = false;
        if (incrementRequestId) {
          draft.s3.searchRequestId += 1;
        }
      });
    },
    [commitState]
  );

  const getFilteredQueues = useCallback((snapshot: AppState): Queue[] => {
    const query = snapshot.search.trim().toLowerCase();
    if (!query) return snapshot.sqs.queues;
    return snapshot.sqs.queues.filter((queue) => queue.name.toLowerCase().includes(query));
  }, []);

  const getSelectedBucket = useCallback((snapshot: AppState) => {
    if (!snapshot.s3.buckets.length) {
      return { bucket: null, index: 0 };
    }

    const index = clampIndex(snapshot.selectedBucket, snapshot.s3.buckets.length);
    return { bucket: snapshot.s3.buckets[index], index };
  }, []);

  const ensureObjectsLoadedForBucketPrefix = useCallback(
    async (bucketName: string, prefix: string, force = false) => {
      const cacheKey = locationKey(bucketName, prefix);
      if (!force && stateRef.current.s3.entriesByLocation[cacheKey]) {
        return;
      }

      const listing = await api.loadObjectsForBucketPrefix(bucketName, prefix);
      commitState((draft) => {
        draft.s3.entriesByLocation[cacheKey] = listing;
      });
    },
    [api, commitState]
  );

  const listAllKeysForPrefix = useCallback(
    async (bucketName: string, prefix: string) => {
      if (!prefix && Array.isArray(stateRef.current.s3.allKeysByBucket[bucketName])) {
        return stateRef.current.s3.allKeysByBucket[bucketName];
      }

      const keys = await api.listAllKeysForPrefix(bucketName, prefix);
      if (!prefix) {
        commitState((draft) => {
          draft.s3.allKeysByBucket[bucketName] = keys;
        });
      }
      return keys;
    },
    [api, commitState]
  );

  const clearBucketCache = useCallback(
    (bucketName: string) => {
      commitState((draft) => {
        const bucketPrefix = `${bucketName}|`;
        for (const key of Object.keys(draft.s3.entriesByLocation)) {
          if (key.startsWith(bucketPrefix)) {
            delete draft.s3.entriesByLocation[key];
          }
        }

        delete draft.s3.allKeysByBucket[bucketName];
      });
    },
    [commitState]
  );

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

  const runS3SearchForCurrentBucket = useCallback(async () => {
    const snapshot = stateRef.current;
    const queryRaw = snapshot.search.trim();

    if (!queryRaw || snapshot.view !== VIEWS.s3) {
      clearS3SearchState();
      return;
    }

    const { bucket } = getSelectedBucket(snapshot);
    if (!bucket) {
      clearS3SearchState();
      return;
    }

    const query = queryRaw.replace(/^\/+/, '');
    if (!query.includes('/')) {
      clearS3SearchState();
      return;
    }

    const requestId = snapshot.s3.searchRequestId + 1;
    commitState((draft) => {
      draft.s3.searchRequestId = requestId;
      draft.s3.searchLoading = true;
    });

    try {
      let folders: ObjectViewModel['folders'] = [];
      let files: FileEntry[] = [];

      if (query.endsWith('/')) {
        await ensureObjectsLoadedForBucketPrefix(bucket.name, query);
        const listing = stateRef.current.s3.entriesByLocation[locationKey(bucket.name, query)] || { folders: [], files: [] };
        folders = listing.folders;
        files = listing.files;
      } else {
        const slashIndex = query.lastIndexOf('/');
        const parent = slashIndex >= 0 ? query.slice(0, slashIndex + 1) : '';
        const leaf = slashIndex >= 0 ? query.slice(slashIndex + 1) : query;
        const leafLower = leaf.toLowerCase();

        await ensureObjectsLoadedForBucketPrefix(bucket.name, parent);
        const listing = stateRef.current.s3.entriesByLocation[locationKey(bucket.name, parent)] || { folders: [], files: [] };

        folders = listing.folders.filter((folder) => folder.name.toLowerCase().startsWith(leafLower));
        files = listing.files.filter((file) => file.name.toLowerCase().startsWith(leafLower));
      }

      if (stateRef.current.s3.searchRequestId !== requestId) {
        return;
      }

      commitState((draft) => {
        draft.s3.searchResults = {
          bucket: bucket.name,
          query,
          folders,
          files,
        };
      });
    } catch (error) {
      if (stateRef.current.s3.searchRequestId === requestId) {
        setStatus(error instanceof Error ? error.message : 'Failed to search S3 objects', 'error');
      }
    } finally {
      if (stateRef.current.s3.searchRequestId === requestId) {
        commitState((draft) => {
          draft.s3.searchLoading = false;
        });
      }
    }
  }, [clearS3SearchState, commitState, ensureObjectsLoadedForBucketPrefix, getSelectedBucket, setStatus]);

  const refreshCurrentView = useCallback(async () => {
    const snapshot = stateRef.current;

    commitState((draft) => {
      draft.loading = true;
    });

    try {
      if (snapshot.view === VIEWS.sqs) {
        setStatus('Loading SQS data...', 'info');

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

        setStatus(`Loaded ${queues.length} queue(s).`, 'info');
        return;
      }

      setStatus('Loading S3 data...', 'info');
      const buckets = await api.loadBuckets();
      const selectedBucket = clampIndex(snapshot.selectedBucket, buckets.length);

      commitState((draft) => {
        draft.s3.buckets = buckets;
        draft.selectedBucket = selectedBucket;
        draft.s3.entriesByLocation = {};
        draft.s3.selectedObject = null;
        draft.s3.allKeysByBucket = {};
        draft.s3.searchResults = null;
        draft.s3.searchLoading = false;
        draft.s3.searchRequestId += 1;

        for (const bucket of buckets) {
          if (draft.s3.prefixByBucket[bucket.name] === undefined) {
            draft.s3.prefixByBucket[bucket.name] = '';
          }
        }
      });

      const current = stateRef.current;
      const selected = current.s3.buckets[current.selectedBucket];
      if (selected) {
        const prefix = current.s3.prefixByBucket[selected.name] || '';
        await ensureObjectsLoadedForBucketPrefix(selected.name, prefix);
      }

      setStatus(`Loaded ${buckets.length} bucket(s).`, 'info');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to refresh view', 'error');
    } finally {
      commitState((draft) => {
        draft.loading = false;
      });
    }
  }, [api, commitState, ensureObjectsLoadedForBucketPrefix, extractQueueUrl, setStatus]);

  const handleNavChange = useCallback(
    async (nextView: View) => {
      if (stateRef.current.view === nextView) return;

      commitState((draft) => {
        draft.view = nextView;
        draft.search = '';
      });

      await refreshCurrentView();
    },
    [commitState, refreshCurrentView]
  );

  const handleSearchChange = useCallback(
    async (value: string) => {
      const view = stateRef.current.view;
      commitState((draft) => {
        draft.search = value;

        if (draft.view === VIEWS.sqs) {
          draft.selectedQueue = 0;
          draft.selectedMessage = 0;
        } else {
          draft.s3.selectedObject = null;
          draft.s3.searchResults = null;
          draft.s3.searchLoading = false;
          draft.s3.searchRequestId += 1;
        }
      });

      if (view === VIEWS.s3 && value.trim().includes('/')) {
        await runS3SearchForCurrentBucket();
      }
    },
    [commitState, runS3SearchForCurrentBucket]
  );

  const handleRefresh = useCallback(async () => {
    commitState((draft) => {
      if (draft.view === VIEWS.sqs) {
        draft.sqs.messagesByQueue = {};
      } else {
        draft.s3.entriesByLocation = {};
        draft.s3.selectedObject = null;
        draft.s3.searchResults = null;
        draft.s3.searchLoading = false;
        draft.s3.searchRequestId += 1;
      }
    });

    await refreshCurrentView();
  }, [commitState, refreshCurrentView]);

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

  const handleSelectBucket = useCallback(
    async (index: number) => {
      commitState((draft) => {
        draft.selectedBucket = index;
        draft.s3.selectedObject = null;
        draft.s3.searchResults = null;
        draft.s3.searchLoading = false;
        draft.s3.searchRequestId += 1;
      });

      const snapshot = stateRef.current;
      const { bucket } = getSelectedBucket(snapshot);
      if (!bucket) {
        return;
      }

      try {
        commitState((draft) => {
          draft.loading = true;
          if (draft.s3.prefixByBucket[bucket.name] === undefined) {
            draft.s3.prefixByBucket[bucket.name] = '';
          }
        });

        const prefix = stateRef.current.s3.prefixByBucket[bucket.name] || '';
        await ensureObjectsLoadedForBucketPrefix(bucket.name, prefix);

        if (stateRef.current.search.trim().includes('/')) {
          await runS3SearchForCurrentBucket();
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to load bucket objects', 'error');
      } finally {
        commitState((draft) => {
          draft.loading = false;
        });
      }
    },
    [commitState, ensureObjectsLoadedForBucketPrefix, getSelectedBucket, runS3SearchForCurrentBucket, setStatus]
  );

  const navigateToPrefix = useCallback(
    async (prefix: string) => {
      const snapshot = stateRef.current;
      const { bucket } = getSelectedBucket(snapshot);
      if (!bucket) {
        return;
      }

      try {
        commitState((draft) => {
          draft.loading = true;
          draft.s3.prefixByBucket[bucket.name] = prefix;
          draft.s3.selectedObject = null;
        });

        await ensureObjectsLoadedForBucketPrefix(bucket.name, prefix);

        if (stateRef.current.search.trim().includes('/')) {
          await runS3SearchForCurrentBucket();
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to navigate path', 'error');
      } finally {
        commitState((draft) => {
          draft.loading = false;
        });
      }
    },
    [commitState, ensureObjectsLoadedForBucketPrefix, getSelectedBucket, runS3SearchForCurrentBucket, setStatus]
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
    const message = messages[snapshot.selectedMessage];

    const receiptHandle = message?.raw?.receiptHandle;
    const messageId = message?.id;

    if (!queue || !message || !receiptHandle || !messageId) {
      return;
    }

    const confirmed = await confirmDialog(`Delete message ${message.id} from ${queue.name}?`, 'Delete Message');
    if (!confirmed) {
      return;
    }

    try {
      commitState((draft) => {
        draft.loading = true;
      });

      const queueUrl = queue.queueUrl || extractQueueUrl(queue.name);
      const latestMessages = await api.loadMessagesForQueue(queueUrl);
      const latestMatch = latestMessages.find((candidate) => candidate.id === messageId);
      const freshReceiptHandle = latestMatch?.raw?.receiptHandle || receiptHandle;

      await api.deleteMessage(queueUrl, freshReceiptHandle);

      const refreshed = await api.loadMessagesForQueue(queueUrl);
      commitState((draft) => {
        draft.sqs.messagesByQueue[queue.name] = refreshed;
        draft.selectedMessage = 0;
      });

      setStatus(`Deleted message ${message.id}`, 'info');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to delete message', 'error');
    } finally {
      commitState((draft) => {
        draft.loading = false;
      });
    }
  }, [api, commitState, confirmDialog, extractQueueUrl, getFilteredQueues, setStatus]);

  const handleDeleteFolder = useCallback(
    async (folderPrefix: string) => {
      const snapshot = stateRef.current;
      const { bucket } = getSelectedBucket(snapshot);
      if (!bucket || !folderPrefix) {
        return;
      }

      const confirmed = await confirmDialog(`Delete all keys under ${folderPrefix}?`, 'Delete Folder');
      if (!confirmed) {
        return;
      }

      try {
        commitState((draft) => {
          draft.loading = true;
        });

        const keys = await listAllKeysForPrefix(bucket.name, folderPrefix);
        for (const key of keys) {
          await api.deleteObject(bucket.name, key);
        }

        clearBucketCache(bucket.name);
        const prefix = stateRef.current.s3.prefixByBucket[bucket.name] || '';
        await ensureObjectsLoadedForBucketPrefix(bucket.name, prefix);

        commitState((draft) => {
          draft.s3.selectedObject = null;
        });

        setStatus(`Deleted ${keys.length} key(s) in ${folderPrefix}`, 'info');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to delete folder prefix', 'error');
      } finally {
        commitState((draft) => {
          draft.loading = false;
        });
      }
    },
    [api, clearBucketCache, commitState, confirmDialog, ensureObjectsLoadedForBucketPrefix, getSelectedBucket, listAllKeysForPrefix, setStatus]
  );

  const handleDeleteFile = useCallback(
    async (key: string) => {
      const snapshot = stateRef.current;
      const { bucket } = getSelectedBucket(snapshot);
      if (!bucket || !key) {
        return;
      }

      const confirmed = await confirmDialog(`Delete ${key} from ${bucket.name}?`, 'Delete Object');
      if (!confirmed) {
        return;
      }

      try {
        commitState((draft) => {
          draft.loading = true;
        });

        await api.deleteObject(bucket.name, key);
        clearBucketCache(bucket.name);

        commitState((draft) => {
          if (draft.s3.selectedObject?.key === key) {
            draft.s3.selectedObject = null;
          }
        });

        const prefix = stateRef.current.s3.prefixByBucket[bucket.name] || '';
        await ensureObjectsLoadedForBucketPrefix(bucket.name, prefix);

        setStatus(`Deleted ${key}`, 'info');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to delete object', 'error');
      } finally {
        commitState((draft) => {
          draft.loading = false;
        });
      }
    },
    [api, clearBucketCache, commitState, confirmDialog, ensureObjectsLoadedForBucketPrefix, getSelectedBucket, setStatus]
  );

  const pollSelectedQueue = useCallback(async () => {
    const snapshot = stateRef.current;
    if (snapshot.view !== VIEWS.sqs || snapshot.loading || snapshot.polling.running) {
      return;
    }

    const queue = getFilteredQueues(snapshot)[snapshot.selectedQueue];
    if (!queue) {
      return;
    }

    commitState((draft) => {
      draft.polling.running = true;
    });

    try {
      await loadMessagesForQueue(queue, true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed polling selected queue', 'error');
    } finally {
      commitState((draft) => {
        draft.polling.running = false;
        draft.polling.nextPollAt = Date.now() + draft.polling.intervalMs;
      });
    }
  }, [commitState, getFilteredQueues, loadMessagesForQueue, setStatus]);

  const filteredQueues = useMemo(() => getFilteredQueues(state), [getFilteredQueues, state]);
  const selectedQueue = filteredQueues[clampIndex(state.selectedQueue, filteredQueues.length)] || null;
  const selectedQueueMessages = selectedQueue ? state.sqs.messagesByQueue[selectedQueue.name] || [] : [];
  const selectedMessage = selectedQueueMessages[clampIndex(state.selectedMessage, selectedQueueMessages.length)] || null;

  const selectedBucket = state.s3.buckets[clampIndex(state.selectedBucket, state.s3.buckets.length)] || null;
  const selectedPrefix = selectedBucket ? state.s3.prefixByBucket[selectedBucket.name] || '' : '';
  const selectedListing = useMemo(
    () =>
      selectedBucket
        ? state.s3.entriesByLocation[locationKey(selectedBucket.name, selectedPrefix)] || { folders: [], files: [] }
        : { folders: [], files: [] },
    [selectedBucket, selectedPrefix, state.s3.entriesByLocation]
  );

  const objectViewModel = useMemo<ObjectViewModel>(() => {
    if (!selectedBucket) {
      return {
        folders: [],
        files: [],
        loading: false,
        emptyMessage: 'No objects available.',
        normalizedPathQuery: '',
        isPathSearch: false,
      };
    }

    const searchTerm = state.search.trim();
    const normalizedPathQuery = searchTerm.replace(/^\/+/, '');
    const isPathSearch = normalizedPathQuery.includes('/');

    let folders = selectedListing.folders;
    let files = selectedListing.files;
    let loading = false;

    if (searchTerm) {
      if (isPathSearch) {
        if (
          state.s3.searchResults &&
          state.s3.searchResults.bucket === selectedBucket.name &&
          state.s3.searchResults.query === normalizedPathQuery
        ) {
          folders = state.s3.searchResults.folders;
          files = state.s3.searchResults.files;
        } else if (state.s3.searchLoading) {
          loading = true;
          folders = [];
          files = [];
        } else {
          folders = [];
          files = [];
        }
      } else {
        const query = searchTerm.toLowerCase();
        folders = selectedListing.folders.filter((folder) => folder.name.toLowerCase().startsWith(query));
        files = selectedListing.files.filter((file) => file.name.toLowerCase().startsWith(query));
      }
    }

    const emptyMessage = searchTerm
      ? 'No objects or folders match search.'
      : 'No objects or folders in this path.';

    return {
      folders,
      files,
      loading,
      emptyMessage,
      normalizedPathQuery,
      isPathSearch,
    };
  }, [selectedBucket, selectedListing, state.search, state.s3.searchLoading, state.s3.searchResults]);

  const renderedFileByKey = useMemo(() => {
    const map: Record<string, FileEntry> = {};
    for (const file of objectViewModel.files) {
      map[file.key] = file;
    }
    return map;
  }, [objectViewModel.files]);

  const objectPathParts = useMemo(() => {
    if (!selectedPrefix) {
      return [{ label: 'root', prefix: '' }];
    }

    const parts = selectedPrefix.split('/').filter(Boolean);
    const items = [{ label: 'root', prefix: '' }];

    let runningPrefix = '';
    for (const part of parts) {
      runningPrefix += `${part}/`;
      items.push({ label: part, prefix: runningPrefix });
    }

    return items;
  }, [selectedPrefix]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const snapshot = stateRef.current;

      if (!snapshot.polling.enabled || snapshot.view !== VIEWS.sqs) {
        setPollProgress(0);
      } else {
        const remaining = Math.max(0, snapshot.polling.nextPollAt - Date.now());
        const pct = ((snapshot.polling.intervalMs - remaining) / snapshot.polling.intervalMs) * 100;
        setPollProgress(Math.max(0, Math.min(100, pct)));
      }

      if (!snapshot.polling.enabled || snapshot.view !== VIEWS.sqs) return;
      if (snapshot.polling.running || snapshot.loading) return;
      if (Date.now() < snapshot.polling.nextPollAt) return;

      void pollSelectedQueue();
    }, 200);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [pollSelectedQueue]);

  useEffect(() => {
    const initialTheme = readStoredTheme();
    setTheme(initialTheme);

    const saved = loadUiState(STORAGE_KEYS.uiState);
    if (saved) {
      commitState((draft) => {
        applyLoadedUiState(draft, saved);
      });
    }

    setBootstrapped(true);
  }, [commitState]);

  useEffect(() => {
    if (!bootstrapped) return;

    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      window.localStorage.setItem(STORAGE_KEYS.theme, theme);
    } catch {
      // noop
    }
  }, [bootstrapped, theme]);

  useEffect(() => {
    if (!bootstrapped) return;

    persistUiState(state, STORAGE_KEYS.uiState);
  }, [bootstrapped, state]);

  useEffect(() => {
    if (!bootstrapped) return;

    void refreshCurrentView();
  }, [bootstrapped, refreshCurrentView]);

  useEffect(() => {
    if (state.view !== VIEWS.s3 || !selectedBucket) return;
    if (!objectViewModel.isPathSearch) return;
    if (objectViewModel.loading) return;

    const query = objectViewModel.normalizedPathQuery;
    if (!query) return;

    const hasActiveResults =
      state.s3.searchResults &&
      state.s3.searchResults.bucket === selectedBucket.name &&
      state.s3.searchResults.query === query;

    if (!hasActiveResults) {
      void runS3SearchForCurrentBucket();
    }
  }, [
    objectViewModel.isPathSearch,
    objectViewModel.loading,
    objectViewModel.normalizedPathQuery,
    runS3SearchForCurrentBucket,
    selectedBucket,
    state.s3.searchResults,
    state.view,
  ]);

  const handleSelectMessage = useCallback(
    (index: number) => {
      commitState((draft) => {
        draft.selectedMessage = index;
      });
    },
    [commitState]
  );

  const handleSelectFile = useCallback(
    (key: string) => {
      const snapshot = stateRef.current;
      const file = renderedFileByKey[key];
      const { bucket } = getSelectedBucket(snapshot);

      if (!file || !bucket) {
        return;
      }

      commitState((draft) => {
        draft.s3.selectedObject = {
          bucket: bucket.name,
          ...file,
        };
      });
    },
    [commitState, getSelectedBucket, renderedFileByKey]
  );

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  const togglePolling = useCallback(() => {
    commitState((draft) => {
      draft.polling.enabled = !draft.polling.enabled;
      if (draft.polling.enabled) {
        draft.polling.nextPollAt = Date.now() + draft.polling.intervalMs;
      }
    });
  }, [commitState]);

  return (
    <main className='mx-auto min-h-screen max-w-[1600px] p-4 lg:p-6'>
      <section className='grid min-h-[calc(100vh-3rem)] grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]'>
        <aside className='flex flex-col rounded-lg border bg-slate-900 p-4 text-slate-50 dark:bg-slate-950'>
          <h1 className='text-2xl font-semibold tracking-tight'>Floci</h1>
          <p className='mt-1 text-sm text-slate-300'>SQS/S3 Navigator</p>
          <div className='mt-auto'>
            <Button variant='secondary' className='w-full justify-start gap-2' onClick={toggleTheme}>
              {theme === 'dark' ? <Sun className='h-4 w-4' /> : <Moon className='h-4 w-4' />}
              {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </Button>
          </div>
        </aside>

        <section className='flex flex-col gap-4'>
          <div className='flex flex-col gap-3 rounded-lg border bg-card p-4'>
            <div className='flex flex-col justify-between gap-3 md:flex-row md:items-center'>
              <h2 className='text-xl font-semibold'>{state.view === VIEWS.sqs ? 'SQS Explorer' : 'S3 Explorer'}</h2>
              <div className='flex w-full flex-col gap-2 md:w-auto md:flex-row'>
                <Input
                  value={state.search}
                  onChange={(event) => {
                    void handleSearchChange(event.target.value);
                  }}
                  placeholder='Search...'
                  className='w-full md:w-[320px]'
                />
                <Button onClick={() => void handleRefresh()} disabled={state.loading} className='gap-2'>
                  <RefreshCcw className='h-4 w-4' />
                  Refresh
                </Button>
              </div>
            </div>

            {banner.type && (
              <div
                className={`rounded-md border px-3 py-2 text-sm ${
                  banner.type === 'error'
                    ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-900/40 dark:text-rose-200'
                    : 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                }`}
              >
                {banner.message}
              </div>
            )}

            <Tabs value={state.view} onValueChange={(next) => void handleNavChange(next as View)}>
              <TabsList>
                <TabsTrigger value={VIEWS.sqs}>SQS</TabsTrigger>
                <TabsTrigger value={VIEWS.s3}>S3</TabsTrigger>
              </TabsList>

              <TabsContent value={VIEWS.sqs}>
                <div className='grid grid-cols-1 gap-4 xl:grid-cols-3'>
                  <Card className='min-h-[380px]'>
                    <CardHeader>
                      <CardTitle>Queues</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {!filteredQueues.length ? (
                        <p className='text-sm text-muted-foreground'>No queues found.</p>
                      ) : (
                        <div className='space-y-2'>
                          {filteredQueues.map((queue, index) => {
                            const active = index === clampIndex(state.selectedQueue, filteredQueues.length);

                            return (
                              <button
                                key={queue.name}
                                type='button'
                                onClick={() => void handleSelectQueue(index)}
                                className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                                  active
                                    ? 'border-primary bg-accent text-accent-foreground'
                                    : 'border-border bg-background hover:bg-accent/60'
                                }`}
                              >
                                {queue.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className='min-h-[380px]'>
                    <CardHeader>
                      <div className='flex items-center justify-between gap-2'>
                        <CardTitle>Messages</CardTitle>
                        <Button variant='outline' size='sm' onClick={togglePolling}>
                          {state.polling.enabled ? 'Pause' : 'Resume'}
                        </Button>
                      </div>
                      <Progress value={pollProgress} />
                    </CardHeader>
                    <CardContent>
                      {!selectedQueue || !selectedQueueMessages.length ? (
                        <p className='text-sm text-muted-foreground'>No messages available.</p>
                      ) : (
                        <div className='space-y-2'>
                          {selectedQueueMessages.map((message, index) => {
                            const active = index === clampIndex(state.selectedMessage, selectedQueueMessages.length);
                            return (
                              <button
                                key={message.id}
                                type='button'
                                onClick={() => handleSelectMessage(index)}
                                className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                                  active
                                    ? 'border-primary bg-accent text-accent-foreground'
                                    : 'border-border bg-background hover:bg-accent/60'
                                }`}
                              >
                                <div>{message.id}</div>
                                {message.sentAt && <p className='mt-1 text-xs text-muted-foreground'>{message.sentAt}</p>}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className='min-h-[380px]'>
                    <CardHeader>
                      <div className='flex items-center justify-between gap-2'>
                        <CardTitle>Message Detail</CardTitle>
                        <Button
                          variant='destructive'
                          size='sm'
                          onClick={() => void handleDeleteMessage()}
                          disabled={!selectedQueue || !selectedMessage?.raw?.receiptHandle}
                        >
                          Delete
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <pre className='max-h-[440px] overflow-auto rounded-md border bg-muted/35 p-3 text-xs leading-5 text-muted-foreground'>
                        {selectedQueue && selectedMessage
                          ? JSON.stringify(
                              {
                                queue: selectedQueue.name,
                                queueUrl: selectedQueue.queueUrl || extractQueueUrl(selectedQueue.name),
                                message: selectedMessage,
                              },
                              null,
                              2
                            )
                          : 'Select a message.'}
                      </pre>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value={VIEWS.s3}>
                <div className='grid grid-cols-1 gap-4 xl:grid-cols-3'>
                  <Card className='min-h-[380px]'>
                    <CardHeader>
                      <CardTitle>Buckets</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {!state.s3.buckets.length ? (
                        <p className='text-sm text-muted-foreground'>No buckets found.</p>
                      ) : (
                        <div className='space-y-2'>
                          {state.s3.buckets.map((bucket, index) => {
                            const active = index === clampIndex(state.selectedBucket, state.s3.buckets.length);
                            return (
                              <button
                                key={bucket.name}
                                type='button'
                                onClick={() => void handleSelectBucket(index)}
                                className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                                  active
                                    ? 'border-primary bg-accent text-accent-foreground'
                                    : 'border-border bg-background hover:bg-accent/60'
                                }`}
                              >
                                <div>{bucket.name}</div>
                                <p className='mt-1 text-xs text-muted-foreground'>{bucket.region}</p>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className='min-h-[380px]'>
                    <CardHeader>
                      <CardTitle>Objects</CardTitle>
                      <div className='flex items-center gap-2'>
                        <Button
                          variant='outline'
                          size='sm'
                          disabled={!selectedPrefix}
                          onClick={() => void navigateToPrefix(parentPrefix(selectedPrefix))}
                        >
                          Up
                        </Button>
                        <div className='flex min-w-0 items-center gap-1 overflow-auto text-sm text-muted-foreground'>
                          {objectPathParts.map((item, index) => (
                            <div key={item.prefix} className='flex items-center gap-1'>
                              {index > 0 && <span>/</span>}
                              <button
                                type='button'
                                className='text-primary hover:underline'
                                onClick={() => void navigateToPrefix(item.prefix)}
                              >
                                {item.label}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {objectViewModel.loading ? (
                        <p className='text-sm text-muted-foreground'>Searching...</p>
                      ) : !objectViewModel.folders.length && !objectViewModel.files.length ? (
                        <p className='text-sm text-muted-foreground'>{objectViewModel.emptyMessage}</p>
                      ) : (
                        <div className='space-y-2'>
                          {objectViewModel.folders.map((folder) => (
                            <div key={folder.prefix} className='flex items-center gap-2 rounded-md border bg-muted/20 p-2'>
                              <button
                                type='button'
                                className='flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium hover:text-primary'
                                onClick={() => void navigateToPrefix(folder.prefix)}
                              >
                                <Folder className='h-4 w-4 shrink-0' />
                                <span className='truncate'>{folder.name}</span>
                              </button>
                              <Button variant='destructive' size='sm' onClick={() => void handleDeleteFolder(folder.prefix)}>
                                Delete
                              </Button>
                            </div>
                          ))}

                          {objectViewModel.files.map((file) => {
                            const active =
                              state.s3.selectedObject?.bucket === selectedBucket?.name && state.s3.selectedObject?.key === file.key;

                            return (
                              <div
                                key={file.key}
                                className={`rounded-md border p-2 text-sm transition ${
                                  active ? 'border-primary bg-accent text-accent-foreground' : 'bg-background hover:bg-accent/60'
                                }`}
                              >
                                <button
                                  type='button'
                                  className='w-full text-left font-medium'
                                  onClick={() => handleSelectFile(file.key)}
                                >
                                  {file.name}
                                </button>
                                <div className='mt-2 flex flex-wrap gap-2'>
                                  <Button
                                    variant='outline'
                                    size='sm'
                                    className='gap-1'
                                    onClick={() => {
                                      if (!selectedBucket) return;
                                      window.open(api.objectUrl(selectedBucket.name, file.key), '_blank', 'noopener');
                                    }}
                                  >
                                    <ExternalLink className='h-3.5 w-3.5' />
                                    Open
                                  </Button>
                                  <Button variant='destructive' size='sm' onClick={() => void handleDeleteFile(file.key)}>
                                    Delete
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className='min-h-[380px]'>
                    <CardHeader>
                      <div className='flex items-center justify-between gap-2'>
                        <CardTitle>Object Preview</CardTitle>
                        {state.s3.selectedObject && <Badge variant='secondary'>{state.s3.selectedObject.name}</Badge>}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <pre className='max-h-[440px] overflow-auto rounded-md border bg-muted/35 p-3 text-xs leading-5 text-muted-foreground'>
                        {selectedBucket && state.s3.selectedObject
                          ? JSON.stringify(
                              {
                                bucket: selectedBucket.name,
                                object: {
                                  key: state.s3.selectedObject.key,
                                  size: state.s3.selectedObject.size,
                                  lastModified: state.s3.selectedObject.lastModified,
                                  etag: state.s3.selectedObject.etag,
                                },
                                objectUrl: api.objectUrl(selectedBucket.name, state.s3.selectedObject.key),
                              },
                              null,
                              2
                            )
                          : 'Select an object.'}
                      </pre>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </section>
      </section>

      <Dialog
        open={confirmState.open}
        onOpenChange={(open) => {
          if (!open) {
            resolveConfirm(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmState.title}</DialogTitle>
            <DialogDescription>{confirmState.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant='outline' onClick={() => resolveConfirm(false)}>
              Cancel
            </Button>
            <Button variant='destructive' onClick={() => resolveConfirm(true)}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
