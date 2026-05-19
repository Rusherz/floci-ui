'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  Bell,
  Braces,
  Database,
  FolderOpen,
  Home,
  KeyRound,
  ListTree,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCcw,
  ScrollText,
  Settings,
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
    <aside
      className={cn(
        'border-b bg-card transition-[width,padding] duration-200 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r',
        collapsed ? 'p-2 lg:w-[76px]' : 'p-4 lg:w-[250px]'
      )}
    >
      <div className='flex h-full flex-col gap-5'>
        <div className={cn('space-y-1', collapsed && 'space-y-0')}>
          <div className={cn('flex items-center', collapsed ? 'justify-center' : 'min-h-9 justify-start')}>
            <div className='flex min-w-0 items-center gap-2'>
              <Image src='/floci-brand-icon.png' alt='Floci' width={collapsed ? 32 : 24} height={collapsed ? 32 : 24} className='rounded-sm' />
              {!collapsed ? <h1 className='text-base font-semibold tracking-tight'>Floci</h1> : null}
            </div>
          </div>
          {!collapsed ? <p className='text-xs text-muted-foreground'>{subtitle}</p> : null}
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
            {collapsed ? <Home className='size-4' /> : 'Overview'}
          </Link>
          <Link href='/settings' className={cn(buttonVariants({ variant: 'outline' }), collapsed ? 'w-full justify-center px-0' : 'w-full justify-start gap-2')}>
            {collapsed ? <Settings className='size-4' /> : 'Settings'}
          </Link>
          <ThemeToggleButton className={cn(collapsed ? 'w-full justify-center px-0' : 'w-full justify-start gap-2')} iconOnly={collapsed} />
          {onToggleCollapse ? (
            <Button
              type='button'
              size='icon'
              variant='outline'
              className='size-9 w-full shrink-0'
              onClick={onToggleCollapse}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeftOpen className='size-4' /> : <PanelLeftClose className='size-4' />}
            </Button>
          ) : null}
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
