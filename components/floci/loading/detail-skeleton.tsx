import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type DetailSkeletonProps = {
  lines?: number;
  className?: string;
};

export function DetailSkeleton({ lines = 10, className }: DetailSkeletonProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className='h-5 w-36' />
      </CardHeader>
      <CardContent className='space-y-2'>
        {Array.from({ length: lines }).map((_, index) => (
          <Skeleton key={index} className='h-3 w-full' />
        ))}
      </CardContent>
    </Card>
  );
}
