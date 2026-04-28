import Link from 'next/link';

import { FlociSidebar } from '@/components/floci/floci-sidebar';
import { ServiceHeader } from '@/components/floci/service-header';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FLOCI_ELEMENTS } from '@/lib/floci/elements';
import { cn } from '@/lib/utils';

export default function HomePage() {
  return (
    <main className='h-screen'>
      <section className='grid h-full w-full grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)]'>
        <FlociSidebar />

        <section className='flex min-h-0 flex-col overflow-hidden'>
          <ServiceHeader
            title='Service Overview'
            description='Unified control surface for local AWS-style services in Floci.'
            search=''
            onSearchChange={() => {}}
            searchPlaceholder=''
            showSearch={false}
            topActions={<Badge variant='outline'>0 Planned</Badge>}
          />

          <section className='grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:p-6'>
            <Card className='rounded-md shadow-none'>
              <CardHeader>
                <CardTitle className='text-base'>Service Catalog</CardTitle>
                <p className='text-sm text-muted-foreground'>All available Floci service pages.</p>
              </CardHeader>
              <CardContent className='grid gap-2 sm:grid-cols-2 xl:grid-cols-3'>
                {FLOCI_ELEMENTS.map((element) => (
                  <div key={element.slug} className='rounded-md border p-3'>
                    <div className='mb-2 flex items-center justify-between gap-2'>
                      <p className='text-sm font-medium'>{element.label}</p>
                      <Badge variant='secondary'>Live</Badge>
                    </div>
                    <p className='mb-3 text-xs text-muted-foreground'>{element.description}</p>
                    <Link href={`/${element.slug}`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full')}>
                      Open
                    </Link>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        </section>
      </section>
    </main>
  );
}
