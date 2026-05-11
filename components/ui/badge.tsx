import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border-rose-500/40 bg-rose-100 text-rose-900 hover:bg-rose-200 dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-200 dark:hover:bg-rose-500/30',
        warning:
          'border-amber-500/40 bg-amber-100 text-amber-900 hover:bg-amber-200 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-200 dark:hover:bg-amber-500/30',
        outline: 'text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
