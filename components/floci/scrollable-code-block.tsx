import { cn } from '@/lib/utils';

type ScrollableCodeBlockProps = {
  content: string;
  className?: string;
  minHeightClassName?: string;
  maxHeightClassName?: string;
  fillContainer?: boolean;
};

export function ScrollableCodeBlock({
  content,
  className,
  minHeightClassName = 'min-h-[140px]',
  maxHeightClassName = 'max-h-[50vh]',
  fillContainer = false,
}: ScrollableCodeBlockProps) {
  return (
    <pre
      className={cn(
        'w-full overflow-auto rounded-md border bg-muted p-3 text-xs leading-5 text-muted-foreground',
        fillContainer ? 'h-full min-h-0 max-h-none' : [minHeightClassName, maxHeightClassName],
        className
      )}
    >
      {content}
    </pre>
  );
}
