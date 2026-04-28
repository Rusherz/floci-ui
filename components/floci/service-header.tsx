'use client';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

type ServiceHeaderProps = {
  title: string;
  description: string;
  summaryCountLabel: string;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
};

export function ServiceHeader({ title, description, summaryCountLabel, search, onSearchChange, searchPlaceholder }: ServiceHeaderProps) {
  return (
    <header className='border-b bg-card p-4 md:p-6'>
      <div className='flex flex-col gap-4'>
        <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
          <div className='min-w-0 flex flex-col gap-1'>
            <p className='text-xs font-semibold uppercase tracking-[0.22em] text-primary'>Control Deck</p>
            <h2 className='text-2xl font-bold tracking-tight md:text-3xl'>{title}</h2>
            <p className='max-w-3xl text-sm text-muted-foreground'>{description}</p>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Badge variant='secondary'>{title}</Badge>
            <Badge variant='outline'>{summaryCountLabel}</Badge>
          </div>
        </div>

        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          className='h-12 rounded-md text-sm shadow-none'
        />
      </div>
    </header>
  );
}
