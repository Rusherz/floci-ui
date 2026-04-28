'use client';

import type { ReactNode } from 'react';

import { FlociSidebar } from '@/components/floci/floci-sidebar';
import { ServiceHeader } from '@/components/floci/service-header';
import { ServiceStatusBanner } from '@/components/floci/service-status-banner';
import { cn } from '@/lib/utils';

type Status = {
  type: 'info' | 'error' | null;
  message: string;
};

type ServiceShellProps = {
  activeSlug: string;
  title: string;
  description: string;
  summaryCountLabel: string;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  onRefresh: () => void;
  refreshDisabled?: boolean;
  status: Status;
  children: ReactNode;
  contentClassName?: string;
};

export function ServiceShell({
  activeSlug,
  title,
  description,
  summaryCountLabel,
  search,
  onSearchChange,
  searchPlaceholder,
  onRefresh,
  refreshDisabled = false,
  status,
  children,
  contentClassName,
}: ServiceShellProps) {
  return (
    <main className='h-screen'>
      <section className='grid h-full w-full grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)]'>
        <FlociSidebar activeSlug={activeSlug} onRefresh={onRefresh} refreshDisabled={refreshDisabled} />

        <section className='flex min-h-0 min-w-0 flex-col overflow-hidden'>
          <ServiceHeader
            title={title}
            description={description}
            summaryCountLabel={summaryCountLabel}
            search={search}
            onSearchChange={onSearchChange}
            searchPlaceholder={searchPlaceholder}
          />

          <ServiceStatusBanner type={status.type} message={status.message} />

          <section
            className={cn(
              'grid min-h-0 min-w-0 flex-1 gap-4 overflow-x-hidden overflow-y-auto p-4 md:p-6 xl:grid-cols-[320px_minmax(0,1fr)]',
              contentClassName
            )}
          >
            {children}
          </section>
        </section>
      </section>
    </main>
  );
}
