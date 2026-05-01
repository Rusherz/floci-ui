'use client';

import type { ReactNode } from 'react';
import { Pause, Play } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';

type ServiceHeaderProps = {
  title: string;
  description: string;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  showSearch?: boolean;
  topActions?: ReactNode;
  bottomContent?: ReactNode;
  pollingEnabled?: boolean;
  pollProgress?: number;
  onTogglePolling?: () => void;
  pollingDisabled?: boolean;
  pollingIntervalMs?: number;
  onPollingIntervalMsChange?: (value: number) => void;
};

export function ServiceHeader({
  title,
  description,
  search,
  onSearchChange,
  searchPlaceholder,
  showSearch = true,
  topActions,
  bottomContent,
  pollingEnabled,
  pollProgress = 0,
  onTogglePolling,
  pollingDisabled = false,
  pollingIntervalMs = 5000,
  onPollingIntervalMsChange,
}: ServiceHeaderProps) {
  const showPollingControl = typeof pollingEnabled === 'boolean' && Boolean(onTogglePolling);

  return (
    <header className='border-b bg-card'>
      <div className='flex flex-col gap-4 p-4 md:p-6'>
        <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
          <div className='min-w-0 flex flex-col gap-1'>
            <p className='text-xs font-semibold uppercase tracking-[0.22em] text-primary'>Control Deck</p>
            <h2 className='text-2xl font-bold tracking-tight md:text-3xl'>{title}</h2>
            <p className='max-w-3xl text-sm text-muted-foreground'>{description}</p>
          </div>
          <div className='flex flex-wrap gap-2'>
            {showPollingControl ? (
              <div className='flex items-center gap-2 rounded-md border px-2 py-1'>
                <span className='text-xs font-medium text-muted-foreground'>Polling</span>
                {Boolean(onPollingIntervalMsChange) ? (
                  <div className='flex items-center gap-1'>
                    <Input
                      type='number'
                      min={250}
                      step={250}
                      value={pollingIntervalMs}
                      onChange={(event) => onPollingIntervalMsChange?.(Number(event.target.value))}
                      className='h-8 w-24'
                      disabled={pollingDisabled}
                    />
                    <span className='text-xs text-muted-foreground'>ms</span>
                  </div>
                ) : null}
                <Button variant='outline' size='sm' onClick={onTogglePolling} disabled={pollingDisabled}>
                  {pollingEnabled ? <Pause className='size-4' aria-hidden='true' /> : <Play className='size-4' aria-hidden='true' />}
                  <span className='sr-only'>{pollingEnabled ? 'Pause polling' : 'Start polling'}</span>
                </Button>
              </div>
            ) : null}
            {topActions}
          </div>
        </div>

        {showSearch ? (
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className='h-12 rounded-md text-sm shadow-none'
          />
        ) : null}

        {bottomContent ? <div>{bottomContent}</div> : null}
      </div>
      {showPollingControl ? <Progress value={pollProgress} className='h-2 rounded-none' /> : null}
    </header>
  );
}
