import { Skeleton } from '@/components/ui/skeleton';

type ToolbarSkeletonProps = {
  actionCount?: number;
  showSearch?: boolean;
};

export function ToolbarSkeleton({ actionCount = 2, showSearch = true }: ToolbarSkeletonProps) {
  return (
    <div className='border-b bg-card p-3 md:p-4'>
      <div className='flex flex-col gap-3'>
        <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
          <Skeleton className='h-8 w-44' />
          <div className='flex gap-2'>
            {Array.from({ length: actionCount }).map((_, index) => (
              <Skeleton key={index} className='h-9 w-24' />
            ))}
          </div>
        </div>
        {showSearch ? <Skeleton className='h-10 w-full' /> : null}
      </div>
    </div>
  );
}
