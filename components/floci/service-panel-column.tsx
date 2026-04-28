import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type ServicePanelColumnProps = {
  children: ReactNode;
  className?: string;
  rowsClassName?: string;
};

export function ServicePanelColumn({
  children,
  className,
  rowsClassName = 'lg:grid-rows-[minmax(0,1fr)_auto]',
}: ServicePanelColumnProps) {
  return (
    <div
      className={cn(
        'grid min-h-[420px] min-w-0 grid-cols-1 gap-4 lg:min-h-0 lg:h-full lg:overflow-hidden',
        rowsClassName,
        className
      )}
    >
      {children}
    </div>
  );
}
