import { cn } from '@/lib/utils';

export function selectableRowButtonClass(active: boolean, className?: string): string {
  return cn(
    'w-full rounded-md border px-3 py-2 text-left text-sm transition focus:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary',
    active ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-background hover:bg-accent',
    className
  );
}

export function selectableRowMetaTextClass(active: boolean, className?: string): string {
  return cn('mt-1 truncate text-xs', active ? 'text-primary/80' : 'text-muted-foreground', className);
}
