'use client';

import Link from 'next/link';
import {
  Bell,
  Braces,
  Database,
  FolderOpen,
  KeyRound,
  ListTree,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCcw,
  ScrollText,
  SquareFunction,
  Workflow,
} from 'lucide-react';

import { ElementsNav } from '@/components/floci/elements-nav';
import { ThemeToggleButton } from '@/components/floci/theme-toggle-button';
import { Button, buttonVariants } from '@/components/ui/button';
import type { FlociElement } from '@/lib/floci/elements';
import { cn } from '@/lib/utils';

type FlociSidebarProps = {
  enabledElements: FlociElement[];
  activeSlug?: string;
  subtitle?: string;
  onRefresh?: () => void;
  refreshDisabled?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

function getServiceIcon(slug: string) {
  switch (slug) {
    case 'sqs':
      return ListTree;
    case 's3':
      return FolderOpen;
    case 'sns':
      return Bell;
    case 'dynamodb':
      return Database;
    case 'lambda':
      return SquareFunction;
    case 'eventbridge':
      return Workflow;
    case 'step-functions':
      return Braces;
    case 'ssm':
      return ScrollText;
    case 'secrets-manager':
      return KeyRound;
    case 'cloudwatch':
      return Database;
    default:
      return Database;
  }
}

export function FlociSidebar({
  enabledElements,
  activeSlug,
  subtitle = 'AWS-style local service console',
  onRefresh,
  refreshDisabled = false,
  collapsed = false,
  onToggleCollapse,
}: FlociSidebarProps) {
  return (
    <aside className={cn('border-b bg-card p-4 transition-[width] duration-200 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r', collapsed ? 'lg:w-[76px]' : 'lg:w-[250px]')}>
      <div className='flex h-full flex-col gap-5'>
        <div className='space-y-1'>
          <div className='flex items-center justify-between gap-2'>
            <div className={cn('min-w-0', collapsed && 'hidden')}>
              <p className='text-xs font-semibold uppercase tracking-[0.22em] text-primary'>Floci</p>
              <h1 className='text-2xl font-bold tracking-tight'>Ops Console</h1>
            </div>
            {onToggleCollapse ? (
              <Button
                type='button'
                size='icon'
                variant='outline'
                className='size-9 shrink-0'
                onClick={onToggleCollapse}
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {collapsed ? <PanelLeftOpen className='size-4' /> : <PanelLeftClose className='size-4' />}
              </Button>
            ) : null}
          </div>
          {!collapsed ? <p className='text-sm text-muted-foreground'>{subtitle}</p> : null}
        </div>

        {!collapsed ? (
          <ElementsNav activeSlug={activeSlug} elements={enabledElements} />
        ) : (
          <nav className='grid gap-2'>
            {enabledElements.map((element) => {
              const active = activeSlug === element.slug;
              const Icon = getServiceIcon(element.slug);
              return (
                <Link
                  key={element.slug}
                  href={`/${element.slug}`}
                  title={element.label}
                  aria-label={element.label}
                  className={cn(
                    buttonVariants({ variant: 'outline' }),
                    'h-9 w-full justify-center px-0 text-xs font-semibold',
                    active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background'
                  )}
                >
                  <Icon className='size-4' />
                </Link>
              );
            })}
          </nav>
        )}

        <div className='mt-auto space-y-2'>
          <Link href='/' className={cn(buttonVariants({ variant: 'outline' }), collapsed ? 'w-full justify-center px-0' : 'w-full justify-start gap-2')}>
            {collapsed ? 'O' : 'Overview'}
          </Link>
          <ThemeToggleButton className={cn(collapsed ? 'w-full justify-center px-0' : 'w-full justify-start gap-2')} iconOnly={collapsed} />
          {onRefresh ? (
            <Button
              variant='outline'
              className={cn(collapsed ? 'w-full justify-center px-0' : 'w-full justify-start gap-2')}
              onClick={onRefresh}
              disabled={refreshDisabled}
              aria-label='Refresh Data'
              title='Refresh Data'
            >
              <RefreshCcw className='size-4' />
              {!collapsed ? 'Refresh Data' : null}
            </Button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
