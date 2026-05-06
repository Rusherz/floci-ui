'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { ExternalLink, Folder, Plus, Trash2 } from 'lucide-react';

import { ConfirmDialog } from '@/components/floci/confirm-dialog';
import { CreateResourceDialog } from '@/components/floci/create-resource-dialog';
import { ScrollableCodeBlock } from '@/components/floci/scrollable-code-block';
import { ServicePanelColumn } from '@/components/floci/service-panel-column';
import { ServiceShell } from '@/components/floci/service-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { createApiClient } from '@/lib/floci/api';
import { createApiConfig } from '@/lib/floci/config';
import { createInitialState, STORAGE_KEYS, type AppState, type FileEntry, VIEWS } from '@/lib/floci/types';
import { applyLoadedUiState, loadUiState, locationKey, parentPrefix, persistUiState } from '@/lib/floci/utils';
import { cn } from '@/lib/utils';

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

export function S3OpsPage() {
  const apiConfig = useMemo(() => createApiConfig(), []);
  const api = useMemo(() => createApiClient(apiConfig), [apiConfig]);

  const [state, setState] = useState<AppState>(() => {
    const initial = createInitialState(apiConfig);
    initial.view = VIEWS.s3;
    return initial;
  });
  const stateRef = useRef<AppState>(state);

  const [bootstrapped, setBootstrapped] = useState(false);
  const [banner, setBanner] = useState<Banner>({ type: null, message: '' });
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    open: false,
    title: 'Confirm',
    message: '',
  });
  const [createBucketOpen, setCreateBucketOpen] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [selectedObjectKeys, setSelectedObjectKeys] = useState<Set<string>>(new Set());
  const [s3AdvancedOpen, setS3AdvancedOpen] = useState(false);
  const [s3Settings, setS3Settings] = useState({
    region: 'ca-central-1',
    acl: 'private',
    objectLockEnabled: false,
  });

  const confirmResolveRef = useRef<((value: boolean) => void) | null>(null);
  const lastObjectAnchorRef = useRef<number | null>(null);

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

  const runS3SearchForCurrentBucket = useCallback(async () => {
    const snapshot = stateRef.current;
    const queryRaw = snapshot.search.trim();

    if (!queryRaw) {
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

  const refreshS3View = useCallback(
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
          setStatus('Loading S3 data...', 'info');
        }

        const buckets = await api.loadBuckets();
        const selectedBucket = clampIndex(snapshot.selectedBucket, buckets.length);

        if (silent) {
          commitState((draft) => {
            draft.s3.buckets = buckets;
            draft.selectedBucket = selectedBucket;

            for (const bucket of buckets) {
              if (draft.s3.prefixByBucket[bucket.name] === undefined) {
                draft.s3.prefixByBucket[bucket.name] = '';
              }
            }
          });
        } else {
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
        }

        const current = stateRef.current;
        const selected = current.s3.buckets[current.selectedBucket];
        if (selected) {
          const prefix = current.s3.prefixByBucket[selected.name] || '';
          await ensureObjectsLoadedForBucketPrefix(selected.name, prefix);
        }

        if (!silent) {
          setStatus(`Loaded ${buckets.length} bucket(s).`, 'info');
        }
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
    [api, commitState, ensureObjectsLoadedForBucketPrefix, setStatus]
  );

  const handleSearchChange = useCallback(
    async (value: string) => {
      commitState((draft) => {
        draft.search = value;
        draft.s3.selectedObject = null;
        draft.s3.searchResults = null;
        draft.s3.searchLoading = false;
        draft.s3.searchRequestId += 1;
      });

      if (value.trim().includes('/')) {
        await runS3SearchForCurrentBucket();
      }
    },
    [commitState, runS3SearchForCurrentBucket]
  );

  const handleRefresh = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        commitState((draft) => {
          draft.s3.entriesByLocation = {};
          draft.s3.selectedObject = null;
          draft.s3.searchResults = null;
          draft.s3.searchLoading = false;
          draft.s3.searchRequestId += 1;
        });
      }

      await refreshS3View({ silent: options?.silent });
    },
    [commitState, refreshS3View]
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
    async (prefix: string, options?: { clearSearch?: boolean }) => {
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
          if (options?.clearSearch) {
            draft.search = '';
            draft.s3.searchResults = null;
            draft.s3.searchLoading = false;
            draft.s3.searchRequestId += 1;
          }
        });

        await ensureObjectsLoadedForBucketPrefix(bucket.name, prefix);

        if (!options?.clearSearch && stateRef.current.search.trim().includes('/')) {
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

  const handleCreateBucket = useCallback(
    async (rawName: string) => {
      const name = rawName.trim().toLowerCase();
      const isValid = /^(?!\d+\.\d+\.\d+\.\d+$)(?!-)(?!.*--)[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(name);

      if (!isValid) {
        setCreateError('Bucket name must be 3-63 chars, lowercase, numbers, dot, hyphen.');
        return;
      }

      setCreateSubmitting(true);
      setCreateError('');
      try {
        await api.createS3Bucket(name, {
          region: s3Settings.region.trim() || 'ca-central-1',
          acl: s3Settings.acl.trim() || 'private',
          objectLockEnabled: s3Settings.objectLockEnabled,
        });

        const buckets = await api.loadBuckets();
        const selectedBucket = Math.max(
          0,
          buckets.findIndex((bucket) => bucket.name === name)
        );

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

        const selected = stateRef.current.s3.buckets[stateRef.current.selectedBucket];
        if (selected) {
          const prefix = stateRef.current.s3.prefixByBucket[selected.name] || '';
          await ensureObjectsLoadedForBucketPrefix(selected.name, prefix);
        }

        setCreateBucketOpen(false);
        setStatus(`Created bucket ${name}.`, 'info');
      } catch (error) {
        setCreateError(error instanceof Error ? error.message : 'Failed to create bucket');
      } finally {
        setCreateSubmitting(false);
      }
    },
    [api, commitState, ensureObjectsLoadedForBucketPrefix, s3Settings.acl, s3Settings.objectLockEnabled, s3Settings.region, setStatus]
  );

  const handleDeleteBucket = useCallback(
    async (bucketName: string) => {
      const confirmed = await confirmDialog(`Delete bucket ${bucketName}? Bucket must be empty.`, 'Delete Bucket');
      if (!confirmed) {
        return;
      }

      try {
        commitState((draft) => {
          draft.loading = true;
        });

        await api.deleteS3Bucket(bucketName);
        const buckets = await api.loadBuckets();
        const selectedBucket = clampIndex(stateRef.current.selectedBucket, buckets.length);

        commitState((draft) => {
          draft.s3.buckets = buckets;
          draft.selectedBucket = selectedBucket;
          draft.s3.entriesByLocation = {};
          draft.s3.selectedObject = null;
          draft.s3.allKeysByBucket = {};
          draft.s3.searchResults = null;
          draft.s3.searchLoading = false;
          draft.s3.searchRequestId += 1;
        });

        const selected = buckets[selectedBucket];
        if (selected) {
          const prefix = stateRef.current.s3.prefixByBucket[selected.name] || '';
          await ensureObjectsLoadedForBucketPrefix(selected.name, prefix);
        }

        setStatus(`Deleted bucket ${bucketName}.`, 'info');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to delete bucket', 'error');
      } finally {
        commitState((draft) => {
          draft.loading = false;
        });
      }
    },
    [api, commitState, confirmDialog, ensureObjectsLoadedForBucketPrefix, setStatus]
  );

  const handleDeleteFolder = useCallback(
    async (folderPrefix: string) => {
      const snapshot = stateRef.current;
      const { bucket } = getSelectedBucket(snapshot);
      if (!bucket || !folderPrefix) {
        return;
      }

      const trimmedPrefix = folderPrefix.replace(/^\/+/, '');
      const normalizedPrefix = trimmedPrefix.endsWith('/') ? trimmedPrefix : `${trimmedPrefix}/`;

      const confirmed = await confirmDialog(`Delete all keys under ${normalizedPrefix}?`, 'Delete Folder');
      if (!confirmed) {
        return;
      }

      try {
        commitState((draft) => {
          draft.loading = true;
        });

        const nestedKeys = await listAllKeysForPrefix(bucket.name, normalizedPrefix);
        const markerAndNestedKeys = await listAllKeysForPrefix(bucket.name, trimmedPrefix);
        const keys = Array.from(new Set([...nestedKeys, ...markerAndNestedKeys.filter((key) => key === trimmedPrefix || key.startsWith(normalizedPrefix))]));

        if (!keys.length) {
          setStatus(`No keys found under ${normalizedPrefix}`, 'info');
          return;
        }

        for (const key of keys) {
          await api.deleteObject(bucket.name, key);
        }

        clearBucketCache(bucket.name);
        const prefix = stateRef.current.s3.prefixByBucket[bucket.name] || '';
        await ensureObjectsLoadedForBucketPrefix(bucket.name, prefix);
        await runS3SearchForCurrentBucket();

        commitState((draft) => {
          draft.s3.selectedObject = null;
        });

        setStatus(`Deleted ${keys.length} key(s) in ${normalizedPrefix}`, 'info');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to delete folder prefix', 'error');
      } finally {
        commitState((draft) => {
          draft.loading = false;
        });
      }
    },
    [api, clearBucketCache, commitState, confirmDialog, ensureObjectsLoadedForBucketPrefix, getSelectedBucket, listAllKeysForPrefix, runS3SearchForCurrentBucket, setStatus]
  );

  const handleDeleteFile = useCallback(
    async (key: string) => {
      const snapshot = stateRef.current;
      const { bucket } = getSelectedBucket(snapshot);
      if (!bucket || !key) {
        return;
      }

      const multiActive = selectedObjectKeys.size > 1;
      const keysToDeleteTargets = multiActive ? Array.from(selectedObjectKeys) : [key];
      const confirmed = await confirmDialog(
        multiActive ? `Delete ${keysToDeleteTargets.length} objects from ${bucket.name}?` : `Delete ${key} from ${bucket.name}?`,
        multiActive ? 'Delete Objects' : 'Delete Object'
      );
      if (!confirmed) {
        return;
      }

      try {
        commitState((draft) => {
          draft.loading = true;
        });

        const expandedKeys: string[] = [];
        for (const targetKey of keysToDeleteTargets) {
          const nestedPrefix = targetKey.endsWith('/') ? targetKey : `${targetKey}/`;
          const nestedKeys = await listAllKeysForPrefix(bucket.name, nestedPrefix);
          expandedKeys.push(targetKey, ...nestedKeys);
        }
        const keysToDelete = Array.from(new Set(expandedKeys));

        for (const deleteKey of keysToDelete) {
          await api.deleteObject(bucket.name, deleteKey);
        }
        clearBucketCache(bucket.name);

        commitState((draft) => {
          if (draft.s3.selectedObject?.key && keysToDelete.includes(draft.s3.selectedObject.key)) {
            draft.s3.selectedObject = null;
          }
        });
        setSelectedObjectKeys(new Set());

        const prefix = stateRef.current.s3.prefixByBucket[bucket.name] || '';
        await ensureObjectsLoadedForBucketPrefix(bucket.name, prefix);
        await runS3SearchForCurrentBucket();

        if (keysToDelete.length > 1) {
          setStatus(`Deleted ${keysToDelete.length} key(s) for ${key}`, 'info');
        } else {
          setStatus(`Deleted ${key}`, 'info');
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to delete object', 'error');
      } finally {
        commitState((draft) => {
          draft.loading = false;
        });
      }
    },
    [api, clearBucketCache, commitState, confirmDialog, ensureObjectsLoadedForBucketPrefix, getSelectedBucket, listAllKeysForPrefix, runS3SearchForCurrentBucket, selectedObjectKeys, setStatus]
  );

  const selectedBucket = state.s3.buckets[clampIndex(state.selectedBucket, state.s3.buckets.length)] || null;
  const selectedPrefix = selectedBucket ? state.s3.prefixByBucket[selectedBucket.name] || '' : '';
  const objectMultiSelectActive = selectedObjectKeys.size > 1;
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
        if (state.s3.searchResults && state.s3.searchResults.bucket === selectedBucket.name && state.s3.searchResults.query === normalizedPathQuery) {
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

    const emptyMessage = searchTerm ? 'No objects or folders match search.' : 'No objects or folders in this path.';

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
    const saved = loadUiState(STORAGE_KEYS.uiState);
    if (saved) {
      commitState((draft) => {
        applyLoadedUiState(draft, saved);
        draft.view = VIEWS.s3;
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

    void refreshS3View();
  }, [bootstrapped, refreshS3View]);

  useEffect(() => {
    if (!selectedBucket) return;
    if (!objectViewModel.isPathSearch) return;
    if (objectViewModel.loading) return;

    const query = objectViewModel.normalizedPathQuery;
    if (!query) return;

    const hasActiveResults =
      state.s3.searchResults && state.s3.searchResults.bucket === selectedBucket.name && state.s3.searchResults.query === query;

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
  ]);

  const handleSelectFile = useCallback(
    (key: string, event?: MouseEvent<HTMLDivElement>) => {
      const snapshot = stateRef.current;
      const file = renderedFileByKey[key];
      const { bucket } = getSelectedBucket(snapshot);
      const withRange = Boolean(event?.shiftKey);
      const withToggle = Boolean(event?.metaKey || event?.ctrlKey);
      if (withRange && event) {
        event.preventDefault();
      }
      const files = objectViewModel.files;

      if (!file || !bucket) {
        return;
      }

      setSelectedObjectKeys((prev) => {
        const next = new Set(prev);
        const index = files.findIndex((candidate) => candidate.key === key);
        if (index < 0) return next;

        if (withRange && lastObjectAnchorRef.current !== null) {
          const start = Math.min(lastObjectAnchorRef.current, index);
          const end = Math.max(lastObjectAnchorRef.current, index);
          for (let i = start; i <= end; i += 1) {
            const candidate = files[i];
            if (!candidate) continue;
            next.add(candidate.key);
          }
        } else if (withToggle) {
          if (next.has(key)) {
            next.delete(key);
          } else {
            next.add(key);
          }
          lastObjectAnchorRef.current = index;
        } else {
          next.clear();
          next.add(key);
          lastObjectAnchorRef.current = index;
        }
        return next;
      });

      commitState((draft) => {
        draft.s3.selectedObject = {
          bucket: bucket.name,
          ...file,
        };
      });
    },
    [commitState, getSelectedBucket, objectViewModel.files, renderedFileByKey]
  );

  useEffect(() => {
    setSelectedObjectKeys(new Set());
    lastObjectAnchorRef.current = null;
  }, [selectedBucket?.name, selectedPrefix, state.search]);

  return (
    <ServiceShell
      activeSlug={VIEWS.s3}
      title='S3'
      description='Bucket navigation, object actions, and path-aware search.'
      search={state.search}
      onSearchChange={(value) => {
        void handleSearchChange(value);
      }}
      searchPlaceholder='Search objects or path...'
      pollingIntervalMs={state.polling.intervalMs}
      pollingDefaultEnabled={false}
      onRefresh={(options) => void handleRefresh(options)}
      refreshDisabled={state.loading}
      status={banner}
      contentClassName='overflow-hidden p-4 md:p-6'
    >
      <Card className='min-h-0 rounded-md shadow-none xl:flex xl:h-full xl:flex-col xl:overflow-hidden'>
        <CardHeader>
          <div className='flex items-center justify-between gap-2'>
            <CardTitle className='text-base'>Buckets ({state.s3.buckets.length})</CardTitle>
            <Button
              size='icon'
              className='size-9'
              aria-label='Create bucket'
              title='Create bucket'
              onClick={() => {
                setCreateError('');
                setS3AdvancedOpen(false);
                setCreateBucketOpen(true);
              }}
            >
              <Plus className='size-4' />
            </Button>
          </div>
        </CardHeader>
        <CardContent className='xl:min-h-0 xl:flex-1'>
          {!state.s3.buckets.length ? (
            <p className='text-sm text-muted-foreground'>No buckets found.</p>
          ) : (
            <div className='flex max-h-[560px] flex-col gap-2 overflow-auto pr-1 xl:h-full xl:max-h-none xl:min-h-0'>
              {state.s3.buckets.map((bucket, index) => {
                const active = index === clampIndex(state.selectedBucket, state.s3.buckets.length);
                return (
                  <div
                    key={bucket.name}
                    className={cn(
                      'w-full rounded-md border px-3 py-2 text-sm transition',
                      active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-accent'
                    )}
                  >
                    <div className='flex items-start gap-2'>
                      <button type='button' onClick={() => void handleSelectBucket(index)} className='min-w-0 flex-1 text-left'>
                        <div>{bucket.name}</div>
                        <p className={cn('mt-1 text-xs', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{bucket.region}</p>
                      </button>
                      <Button
                        type='button'
                        variant={active ? 'secondary' : 'destructive'}
                        size='sm'
                        aria-label={`Delete bucket ${bucket.name}`}
                        onClick={() => void handleDeleteBucket(bucket.name)}
                      >
                        <Trash2 className='size-4' />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ServicePanelColumn rowsClassName='lg:grid-rows-[minmax(0,2fr)_minmax(0,1fr)]'>
        <Card className='min-h-0 rounded-md shadow-none lg:flex lg:h-full lg:flex-col lg:overflow-hidden'>
          <CardHeader>
            <CardTitle className='text-base'>Objects</CardTitle>
            <div className='flex items-center gap-2'>
              <Button variant='outline' size='sm' disabled={!selectedPrefix} onClick={() => void navigateToPrefix(parentPrefix(selectedPrefix))}>
                Up
              </Button>
              <div className='flex min-w-0 items-center gap-1 overflow-auto text-sm text-muted-foreground'>
                {objectPathParts.map((item, index) => (
                  <div key={item.prefix} className='flex items-center gap-1'>
                    {index > 0 && <span>/</span>}
                    <button type='button' className='text-primary hover:underline' onClick={() => void navigateToPrefix(item.prefix)}>
                      {item.label}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className='min-h-0 lg:flex-1 lg:overflow-hidden'>
            {objectViewModel.loading ? (
              <p className='text-sm text-muted-foreground'>Searching...</p>
            ) : !objectViewModel.folders.length && !objectViewModel.files.length ? (
              <p className='text-sm text-muted-foreground'>{objectViewModel.emptyMessage}</p>
            ) : (
              <div className='flex h-full min-h-0 flex-col gap-2 overflow-auto pr-1'>
                {objectViewModel.folders.map((folder) => (
                  <div
                    key={folder.prefix}
                    role='button'
                    tabIndex={0}
                    className='flex cursor-pointer items-center gap-2 rounded-md border bg-muted p-2 transition hover:bg-accent'
                    onClick={() => void navigateToPrefix(folder.prefix, { clearSearch: true })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        void navigateToPrefix(folder.prefix, { clearSearch: true });
                      }
                    }}
                  >
                    <div className='flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium'>
                      <Folder className='size-4 shrink-0' />
                      <span className='truncate'>{folder.name}</span>
                    </div>
                    <Button
                      variant='destructive'
                      size='sm'
                      aria-label={`Delete folder ${folder.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDeleteFolder(folder.prefix);
                      }}
                    >
                      <Trash2 className='size-4' />
                    </Button>
                  </div>
                ))}

                {objectViewModel.files.map((file) => {
                  const active =
                    selectedObjectKeys.has(file.key) ||
                    (!selectedObjectKeys.size && state.s3.selectedObject?.bucket === selectedBucket?.name && state.s3.selectedObject?.key === file.key);

                  return (
                    <div
                      key={file.key}
                      role='button'
                      tabIndex={0}
                      className={cn(
                        'cursor-pointer select-none rounded-md border p-2 text-sm transition focus:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary',
                        active ? 'border-primary bg-accent text-accent-foreground' : 'border-border bg-background hover:bg-accent'
                      )}
                      onClick={(event) => handleSelectFile(file.key, event)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleSelectFile(file.key);
                        }
                      }}
                    >
                      <div className='flex items-center gap-2'>
                        <div className='min-w-0 flex-1 truncate text-left font-medium'>{file.name}</div>
                        <div className='ml-auto flex shrink-0 items-center gap-2'>
                          <Button
                            variant='outline'
                            size='sm'
                            className='gap-1'
                            aria-label={`Open object ${file.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (!selectedBucket) return;
                              window.open(api.objectUrl(selectedBucket.name, file.key), '_blank', 'noopener');
                            }}
                          >
                            <ExternalLink className='size-3.5' />
                          </Button>
                          <Button
                            variant='destructive'
                            size='sm'
                            aria-label={`Delete object ${file.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleDeleteFile(file.key);
                            }}
                          >
                            <Trash2 className='size-4' />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className='min-h-[220px] rounded-md shadow-none lg:flex lg:flex-col lg:overflow-hidden'>
          <CardHeader>
            <div className='flex items-center justify-between gap-2'>
              <CardTitle className='text-base'>Object Preview</CardTitle>
              {objectMultiSelectActive ? (
                <Badge variant='secondary'>Multi-select</Badge>
              ) : state.s3.selectedObject ? (
                <Badge variant='secondary'>{state.s3.selectedObject.name}</Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className='min-h-0 lg:flex-1 lg:overflow-hidden'>
            <ScrollableCodeBlock
              content={
                !objectMultiSelectActive && selectedBucket && state.s3.selectedObject
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
                  : objectMultiSelectActive
                    ? 'Preview disabled while multi-select is active.'
                    : 'Select an object.'
              }
              fillContainer
            />
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
        open={createBucketOpen}
        onOpenChange={(open) => {
          setCreateBucketOpen(open);
          if (!open) {
            setCreateError('');
          }
        }}
        title='Create S3 Bucket'
        description='Create a new bucket in local Floci.'
        label='Bucket Name'
        placeholder='my-bucket'
        confirmLabel='Create Bucket'
        submitting={createSubmitting}
        errorMessage={createError}
        onSubmit={handleCreateBucket}
      >
        <div className='grid gap-2'>
          <button type='button' className='w-fit text-xs text-primary hover:underline' onClick={() => setS3AdvancedOpen((current) => !current)}>
            {s3AdvancedOpen ? 'Hide advanced settings' : 'Show advanced settings'}
          </button>
          {s3AdvancedOpen ? (
            <div className='grid gap-2 rounded-md border p-3 sm:grid-cols-2'>
              <div className='grid gap-1 sm:col-span-2'>
                <p className='text-xs text-muted-foreground'>Region</p>
                <Input value={s3Settings.region} onChange={(event) => setS3Settings((current) => ({ ...current, region: event.target.value }))} placeholder='ca-central-1' />
              </div>
              <div className='grid gap-1'>
                <p className='text-xs text-muted-foreground'>Canned ACL</p>
                <Input value={s3Settings.acl} onChange={(event) => setS3Settings((current) => ({ ...current, acl: event.target.value }))} placeholder='private' />
              </div>
              <div className='flex items-end'>
                <Button
                  type='button'
                  variant={s3Settings.objectLockEnabled ? 'default' : 'outline'}
                  size='sm'
                  onClick={() =>
                    setS3Settings((current) => ({
                      ...current,
                      objectLockEnabled: !current.objectLockEnabled,
                    }))
                  }
                >
                  Object Lock
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </CreateResourceDialog>
    </ServiceShell>
  );
}
