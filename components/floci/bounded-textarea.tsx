'use client';

import type { TextareaHTMLAttributes } from 'react';

import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type BoundedTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  minHeightClassName?: string;
  maxHeightClassName?: string;
};

export function BoundedTextarea({ className, minHeightClassName = 'min-h-[120px]', maxHeightClassName = 'max-h-[42vh]', ...props }: BoundedTextareaProps) {
  return (
    <Textarea
      {...props}
      className={cn(
        'resize-y',
        minHeightClassName,
        maxHeightClassName,
        className
      )}
    />
  );
}
