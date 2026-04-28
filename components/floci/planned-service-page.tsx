import Link from 'next/link';

import { FlociSidebar } from '@/components/floci/floci-sidebar';
import { ServiceHeader } from '@/components/floci/service-header';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type PlannedServicePageProps = {
  slug: string;
  title: string;
  description: string;
  checklist: string[];
};

export function PlannedServicePage({ slug, title, description, checklist }: PlannedServicePageProps) {
  return (
    <main className='h-screen'>
      <section className='grid h-full w-full grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)]'>
        <FlociSidebar activeSlug={slug} />

        <section className='flex min-h-0 flex-col overflow-hidden'>
          <ServiceHeader
            title={title}
            description={description}
            search=''
            onSearchChange={() => {}}
            searchPlaceholder=''
            showSearch={false}
          />

          <section className='grid min-h-0 flex-1 gap-4 overflow-hidden p-4 md:p-6 lg:grid-cols-[320px_minmax(0,1fr)]'>
            <Card className='min-h-0 rounded-md shadow-none'>
              <CardHeader>
                <CardTitle className='text-base'>Implementation Status</CardTitle>
              </CardHeader>
              <CardContent>
                <p className='text-sm text-muted-foreground'>
                  This page is scaffolded. Use the checklist to implement service-specific API and UI behavior.
                </p>
              </CardContent>
            </Card>

            <Card className='min-h-0 rounded-md shadow-none'>
              <CardHeader>
                <div className='flex items-center justify-between gap-3'>
                  <CardTitle className='text-base'>Initial Implementation Checklist</CardTitle>
                  <Badge variant='outline'>Planned</Badge>
                </div>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='rounded-md border bg-muted/30 p-4'>
                  <ul className='space-y-2 text-sm text-muted-foreground'>
                    {checklist.map((item) => (
                      <li key={item}>- [ ] {item}</li>
                    ))}
                  </ul>
                </div>

                <div className='flex flex-wrap gap-2'>
                  <Link href='/' className={buttonVariants()}>
                    Back to Overview
                  </Link>
                  <Link href='/sqs' className={cn(buttonVariants({ variant: 'outline' }))}>
                    Open SQS
                  </Link>
                  <Link href='/s3' className={cn(buttonVariants({ variant: 'outline' }))}>
                    Open S3
                  </Link>
                </div>
              </CardContent>
            </Card>
          </section>
        </section>
      </section>
    </main>
  );
}
