import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type ListSkeletonProps = {
  items?: number;
  className?: string;
  inline?: boolean;
};

function ListRows({ items }: { items: number }) {
  return (
    <div className='space-y-2'>
      {Array.from({ length: items }).map((_, index) => (
        <div key={index} className='rounded-md border p-3'>
          <Skeleton className='h-4 w-3/5' />
          <Skeleton className='mt-2 h-3 w-4/5' />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ items = 8, className, inline = false }: ListSkeletonProps) {
  if (inline) {
    return (
      <div className={cn('space-y-2', className)}>
        <ListRows items={items} />
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className='h-5 w-32' />
      </CardHeader>
      <CardContent>
        <ListRows items={items} />
      </CardContent>
    </Card>
  );
}
