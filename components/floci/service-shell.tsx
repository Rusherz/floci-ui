'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { ServiceHeader } from '@/components/floci/service-header';
import { ServiceStatusBanner } from '@/components/floci/service-status-banner';
import type { FlociElement } from '@/lib/floci/elements';
import type { ServiceStatus } from '@/lib/floci/service-ui';
import { cn } from '@/lib/utils';

type RefreshOptions = {
  silent?: boolean;
  source?: 'manual' | 'poll';
};

type ServiceShellProps = {
  enabledElements: FlociElement[];
  activeSlug: string;
  title: string;
  description: string;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  showSearch?: boolean;
  headerTopActions?: ReactNode;
  headerBottomContent?: ReactNode;
  onRefresh: (options?: RefreshOptions) => void | Promise<void>;
  refreshDisabled?: boolean;
  pollingIntervalMs?: number;
  pollingDefaultEnabled?: boolean;
  status: ServiceStatus;
  statusSlotContent?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
};

export function ServiceShell({
  enabledElements: _enabledElements,
  activeSlug: _activeSlug,
  title,
  description,
  search,
  onSearchChange,
  searchPlaceholder,
  showSearch = true,
  headerTopActions,
  headerBottomContent,
  onRefresh,
  refreshDisabled = false,
  pollingIntervalMs = 5000,
  pollingDefaultEnabled = false,
  status,
  statusSlotContent,
  children,
  contentClassName,
}: ServiceShellProps) {
  void _enabledElements;
  void _activeSlug;

  const stickyTopRef = useRef<HTMLDivElement | null>(null);
  const [stickyOffsetPx, setStickyOffsetPx] = useState(176);
  const [pollingEnabled, setPollingEnabled] = useState(pollingDefaultEnabled);
  const [currentPollingIntervalMs, setCurrentPollingIntervalMs] = useState(pollingIntervalMs);
  const [pollProgress, setPollProgress] = useState(0);
  const pollProgressRef = useRef(0);
  const nextPollAtRef = useRef(0);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    setPollingEnabled(pollingDefaultEnabled);
    setCurrentPollingIntervalMs(pollingIntervalMs);
    nextPollAtRef.current = Date.now() + pollingIntervalMs;
  }, [pollingDefaultEnabled, pollingIntervalMs, _activeSlug]);

  const togglePolling = useCallback(() => {
    setPollingEnabled((enabled) => {
      const next = !enabled;
      if (next) {
        nextPollAtRef.current = Date.now() + currentPollingIntervalMs;
      } else {
        pollProgressRef.current = 0;
        setPollProgress(0);
      }
      return next;
    });
  }, [currentPollingIntervalMs]);

  const updatePollingIntervalMs = useCallback((value: number) => {
    if (!Number.isFinite(value)) return;
    const clamped = Math.max(250, Math.round(value));
    setCurrentPollingIntervalMs(clamped);
    nextPollAtRef.current = Date.now() + clamped;
  }, []);

  useEffect(() => {
    let rafId = 0;
    let running = false;

    const tick = () => {
      if (!pollingEnabled) {
        if (pollProgressRef.current !== 0) {
          pollProgressRef.current = 0;
          setPollProgress(0);
        }
      } else {
        const remaining = Math.max(0, nextPollAtRef.current - Date.now());
        const pct = ((currentPollingIntervalMs - remaining) / currentPollingIntervalMs) * 100;
        const clamped = Math.max(0, Math.min(100, pct));

        if (Math.abs(clamped - pollProgressRef.current) >= 0.5) {
          pollProgressRef.current = clamped;
          setPollProgress(clamped);
        }
      }

      if (pollingEnabled && !running && !refreshDisabled && Date.now() >= nextPollAtRef.current) {
        running = true;
        nextPollAtRef.current = Date.now() + currentPollingIntervalMs;
        void Promise.resolve(onRefreshRef.current({ silent: true, source: 'poll' })).finally(() => {
          running = false;
        });
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [currentPollingIntervalMs, pollingEnabled, refreshDisabled]);

  useEffect(() => {
    const node = stickyTopRef.current;
    if (!node) return;

    const updateOffset = () => {
      setStickyOffsetPx(Math.ceil(node.getBoundingClientRect().height));
    };

    updateOffset();

    const observer = new ResizeObserver(updateOffset);
    observer.observe(node);
    window.addEventListener('resize', updateOffset);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateOffset);
    };
  }, [search, showSearch, title]);

  return (
    <section className='flex min-h-screen min-w-0 flex-col'>
      <div className='sticky top-0 z-30'>
        <div ref={stickyTopRef}>
          <ServiceHeader
            title={title}
            description={description}
            search={search}
            onSearchChange={onSearchChange}
            searchPlaceholder={searchPlaceholder}
            showSearch={showSearch}
            pollingEnabled={pollingEnabled}
            pollProgress={pollProgress}
            onTogglePolling={togglePolling}
            pollingDisabled={refreshDisabled}
            pollingIntervalMs={currentPollingIntervalMs}
            onPollingIntervalMsChange={updatePollingIntervalMs}
            topActions={headerTopActions}
            bottomContent={headerBottomContent}
          />
        </div>
        <div className='pointer-events-none absolute inset-x-0 top-full z-40'>
          <ServiceStatusBanner type={status.type} message={status.message} />
        </div>
      </div>

      {statusSlotContent}

      <section className='relative min-w-0 flex-1' style={{ ['--service-header-offset' as string]: `${stickyOffsetPx}px` }}>
        <section
          className={cn(
            'grid min-w-0 gap-4 overflow-x-hidden p-4 md:p-6 xl:grid-cols-[320px_minmax(0,1fr)]',
            contentClassName
          )}
        >
          {children}
        </section>
      </section>
    </section>
  );
}
