import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type PanelSkeletonProps = {
  rows?: number;
  className?: string;
};

export function PanelSkeleton({ rows = 4, className }: PanelSkeletonProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className='h-5 w-40' />
      </CardHeader>
      <CardContent className='space-y-3'>
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} className='h-4 w-full' />
        ))}
      </CardContent>
    </Card>
  );
}
