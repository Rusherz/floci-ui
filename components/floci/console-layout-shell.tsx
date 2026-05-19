'use client';

import { useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';

import { FirstLaunchEndpointPrompt } from '@/components/floci/endpoint-settings';
import { FlociSidebar } from '@/components/floci/floci-sidebar';
import type { FlociElement } from '@/lib/floci/elements';
import { cn } from '@/lib/utils';

type ConsoleLayoutShellProps = {
  enabledElements: FlociElement[];
  initialSidebarCollapsed: boolean;
  children: React.ReactNode;
};

const SIDEBAR_COLLAPSED_COOKIE = 'floci_sidebar_collapsed';

export function ConsoleLayoutShell({ enabledElements, initialSidebarCollapsed, children }: ConsoleLayoutShellProps) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialSidebarCollapsed);

  const activeSlug = useMemo(() => {
    const first = pathname.split('/').filter(Boolean)[0];
    if (!first) return undefined;
    return enabledElements.some((element) => element.slug === first) ? first : undefined;
  }, [enabledElements, pathname]);

  const handleToggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=${next ? '1' : '0'}; Path=/; Max-Age=31536000; SameSite=Lax`;
      return next;
    });
  };

  return (
    <main className='min-h-screen'>
      <section className={cn('grid min-h-screen w-full grid-cols-1', sidebarCollapsed ? 'lg:grid-cols-[76px_minmax(0,1fr)]' : 'lg:grid-cols-[250px_minmax(0,1fr)]')}>
        <div className='relative z-40'>
          <FlociSidebar enabledElements={enabledElements} activeSlug={activeSlug} collapsed={sidebarCollapsed} onToggleCollapse={handleToggleSidebar} />
        </div>
        <section className='relative min-w-0 overflow-x-hidden'>
          <FirstLaunchEndpointPrompt />
          {children}
        </section>
      </section>
    </main>
  );
}
