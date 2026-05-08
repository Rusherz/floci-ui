'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

type VersionManifest = {
  version?: string;
};

const CHECK_INTERVAL_MS = 60_000;
const DISMISSED_STORAGE_PREFIX = 'version-update-dismissed:';

export function VersionUpdateBanner() {
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [activeDiffKey, setActiveDiffKey] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const currentVersion = useMemo(() => (process.env.NEXT_PUBLIC_APP_VERSION || 'dev').trim(), []);
  const checkUrl = '/api/version-manifest';

  const checkVersion = useCallback(async () => {
    try {
      const separator = checkUrl.includes('?') ? '&' : '?';
      const response = await fetch(`${checkUrl}${separator}t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (!response.ok) return;
      const data = (await response.json()) as VersionManifest;
      const remoteVersion = (data.version || '').trim();
      if (!remoteVersion) return;
      if (remoteVersion !== currentVersion) {
        const diffKey = `${currentVersion}->${remoteVersion}`;
        const dismissedKey = `${DISMISSED_STORAGE_PREFIX}${diffKey}`;
        if (window.localStorage.getItem(dismissedKey) === '1') {
          setLatestVersion(null);
          setActiveDiffKey(null);
          setDismissed(true);
          return;
        }
        setActiveDiffKey(diffKey);
        setLatestVersion(remoteVersion);
        setDismissed(false);
        return;
      }
      setLatestVersion(null);
      setActiveDiffKey(null);
      setDismissed(false);
    } catch {
      // Intentionally ignore network and parse errors.
    }
  }, [currentVersion]);

  useEffect(() => {
    void checkVersion();
    const intervalId = window.setInterval(() => {
      void checkVersion();
    }, CHECK_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (!document.hidden) {
        void checkVersion();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [checkVersion]);

  if (!latestVersion || dismissed) return null;

  return (
    <Alert variant='destructive' className='fixed right-4 top-4 z-50 max-w-sm bg-background shadow-lg'>
      <AlertTitle>New version available</AlertTitle>
      <AlertDescription className='mt-1 text-xs text-muted-foreground'>
        Current: {currentVersion} | Latest: {latestVersion}
      </AlertDescription>
      <AlertDescription className='mt-1 text-xs text-muted-foreground'>
        Pull the latest Docker image and restart this container to upgrade.
      </AlertDescription>
      <div className='mt-3 flex gap-2'>
        <Button
          size='sm'
          variant='outline'
          onClick={() => {
            if (activeDiffKey) {
              window.localStorage.setItem(`${DISMISSED_STORAGE_PREFIX}${activeDiffKey}`, '1');
            }
            setDismissed(true);
          }}
        >
          Dismiss
        </Button>
      </div>
    </Alert>
  );
}
