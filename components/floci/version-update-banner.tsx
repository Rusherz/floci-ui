'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';

type VersionManifest = {
  version?: string;
};

const CHECK_INTERVAL_MS = 60_000;

export function VersionUpdateBanner() {
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
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
        setLatestVersion(remoteVersion);
        return;
      }
      setLatestVersion(null);
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
    <div className='fixed bottom-4 right-4 z-50 max-w-sm rounded-md border bg-card p-3 text-card-foreground shadow-lg'>
      <p className='text-sm font-medium'>New version available</p>
      <p className='mt-1 text-xs text-muted-foreground'>
        Current: {currentVersion} | Latest: {latestVersion}
      </p>
      <p className='mt-1 text-xs text-muted-foreground'>Pull the latest Docker image and restart this container to upgrade.</p>
      <div className='mt-3 flex gap-2'>
        <Button size='sm' variant='outline' onClick={() => setDismissed(true)}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
