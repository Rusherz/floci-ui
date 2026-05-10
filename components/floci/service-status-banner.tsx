'use client';

import { useEffect, useMemo, useState } from 'react';

import type { ServiceStatusType } from '@/lib/floci/service-ui';
import { cn } from '@/lib/utils';

type ServiceStatusBannerProps = {
  type: ServiceStatusType;
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
        'w-full border-b px-4 py-2 text-sm',
        type === 'error' ? 'border-destructive/60 bg-destructive text-destructive-foreground' : 'border-primary/60 bg-primary text-primary-foreground'
      )}
    >
      {message}
    </div>
  );
}
