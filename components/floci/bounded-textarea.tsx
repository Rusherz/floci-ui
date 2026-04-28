'use client';

import type { TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

type BoundedTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  minHeightClassName?: string;
  maxHeightClassName?: string;
};

export function BoundedTextarea({ className, minHeightClassName = 'min-h-[120px]', maxHeightClassName = 'max-h-[42vh]', ...props }: BoundedTextareaProps) {
  return (
    <textarea
      {...props}
      className={cn(
        'w-full resize-y rounded-md border bg-background p-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        minHeightClassName,
        maxHeightClassName,
        className
      )}
    />
  );
}
