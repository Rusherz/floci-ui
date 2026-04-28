'use client';

import { useEffect, useMemo, useState } from 'react';

import { cn } from '@/lib/utils';

type ServiceStatusBannerProps = {
  type: 'info' | 'error' | null;
  message: string;
  infoDismissMs?: number;
};

export function ServiceStatusBanner({ type, message, infoDismissMs = 2800 }: ServiceStatusBannerProps) {
  const key = useMemo(() => `${type ?? 'none'}:${message}`, [message, type]);
  const [visibleKey, setVisibleKey] = useState<string>('none:');

  useEffect(() => {
    setVisibleKey(key);
  }, [key]);

  useEffect(() => {
    if (type !== 'info' || !message) return;

    const timeoutId = window.setTimeout(() => {
      setVisibleKey((current) => (current === key ? 'none:' : current));
    }, infoDismissMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [infoDismissMs, key, message, type]);

  if (!type || !message || visibleKey !== key) return null;

  return (
    <div
      className={cn(
        'border-b px-4 py-2 text-sm',
        type === 'error' ? 'border-destructive/50 bg-destructive/10 text-destructive' : 'border-primary/45 bg-primary/10 text-primary'
      )}
    >
      {message}
    </div>
  );
}
