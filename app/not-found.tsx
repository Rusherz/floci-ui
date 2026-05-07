export const dynamic = 'force-dynamic';

import Link from 'next/link';

import { FlociSidebar } from '@/components/floci/floci-sidebar';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getEnabledElements } from '@/lib/floci/elements';
import { cn } from '@/lib/utils';

export default function NotFound() {
  const enabledElements = getEnabledElements();

  return (
    <main className='h-screen'>
      <section className='grid h-full w-full grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)]'>
        <FlociSidebar enabledElements={enabledElements} />

        <section className='flex min-h-0 flex-col overflow-hidden'>
          <section className='grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:p-6'>
            <Card className='rounded-md shadow-none'>
              <CardHeader>
                <div className='flex items-center justify-between gap-2'>
                  <CardTitle className='text-base'>Page Not Found</CardTitle>
                  <Badge variant='outline'>404</Badge>
                </div>
                <p className='text-sm text-muted-foreground'>That route is unavailable or has been disabled by configuration.</p>
              </CardHeader>
              <CardContent className='space-y-4'>
                <Link href='/' className={cn(buttonVariants({ variant: 'default' }), 'w-full sm:w-auto')}>
                  Go To Overview
                </Link>

                {enabledElements.length ? (
                  <div className='grid gap-2 sm:grid-cols-2 xl:grid-cols-3'>
                    {enabledElements.map((element) => (
                      <Link key={element.slug} href={`/${element.slug}`} className={cn(buttonVariants({ variant: 'outline' }), 'justify-start')}>
                        {element.label}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className='text-sm text-muted-foreground'>No services are currently enabled.</p>
                )}
              </CardContent>
            </Card>
          </section>
        </section>
      </section>
    </main>
  );
}
