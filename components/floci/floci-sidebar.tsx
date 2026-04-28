'use client';

import Link from 'next/link';
import { RefreshCcw } from 'lucide-react';

import { ElementsNav } from '@/components/floci/elements-nav';
import { ThemeToggleButton } from '@/components/floci/theme-toggle-button';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type FlociSidebarProps = {
  activeSlug?: string;
  subtitle?: string;
  onRefresh?: () => void;
  refreshDisabled?: boolean;
};

export function FlociSidebar({ activeSlug, subtitle = 'AWS-style local service console', onRefresh, refreshDisabled = false }: FlociSidebarProps) {
  return (
    <aside className='border-b bg-card p-4 lg:h-screen lg:border-b-0 lg:border-r'>
      <div className='flex h-full flex-col gap-5'>
        <div className='space-y-1'>
          <p className='text-xs font-semibold uppercase tracking-[0.22em] text-primary'>Floci</p>
          <h1 className='text-2xl font-bold tracking-tight'>Ops Console</h1>
          <p className='text-sm text-muted-foreground'>{subtitle}</p>
        </div>

        <ElementsNav activeSlug={activeSlug} />

        <div className='mt-auto space-y-2'>
          <Link href='/' className={cn(buttonVariants({ variant: 'outline' }), 'w-full justify-start gap-2')}>
            Overview
          </Link>
          <ThemeToggleButton />
          {onRefresh ? (
            <Button variant='outline' className='w-full justify-start gap-2' onClick={onRefresh} disabled={refreshDisabled}>
              <RefreshCcw className='size-4' />
              Refresh Data
            </Button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
