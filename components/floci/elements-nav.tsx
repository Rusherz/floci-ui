'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Info } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getElementBySlug } from '@/lib/floci/elements';
import { cn } from '@/lib/utils';
import { getEnabledElements } from '@/lib/floci/elements';

type ElementsNavProps = {
  activeSlug?: string;
};

const SERVICE_HELP: Record<string, string[]> = {
  sqs: [
    'Select a queue on the left to load its messages.',
    'Select messages with click; use Shift+Click for range select and Ctrl/Cmd+Click to toggle multi-select.',
    'Use Message Detail to inspect payloads, then delete selected messages when needed.',
  ],
  s3: [
    'Select a bucket, then browse prefixes in Objects.',
    'Use search for object names or path prefixes (for example: folder/sub/).',
    'Select files with click; use Shift+Click for range select and Ctrl/Cmd+Click to toggle multi-select before delete actions.',
  ],
  cloudwatch: [
    'Select one or more log groups from the list.',
    'Use Shift+Click for range select and Ctrl/Cmd+Click to toggle additional groups.',
    'Set severity, message, and time filters, then run filter to load recent events.',
    'Message filter examples from our log shape:',
    'severity_text: "ERROR"',
    'body: "request failed"',
    'attributes.service: "api-gateway"',
    'attributes.request contains method:"POST" path:"/v1/workflows"',
  ],
};

function getServiceHelp(slug: string): string[] {
  return (
    SERVICE_HELP[slug] ?? [
      'Open the service to view resources and details.',
      'Use the search bar to narrow down resource lists quickly.',
      'Use create and delete actions in the service panels to manage resources.',
    ]
  );
}

export function ElementsNav({ activeSlug }: ElementsNavProps) {
  const elements = getEnabledElements();
  const [helpSlug, setHelpSlug] = useState<string | null>(null);
  const helpElement = useMemo(() => (helpSlug ? getElementBySlug(helpSlug) : undefined), [helpSlug]);
  const helpItems = useMemo(() => (helpSlug ? getServiceHelp(helpSlug) : []), [helpSlug]);

  return (
    <>
      <nav className='grid gap-2'>
        {elements.map((element) => {
          const active = activeSlug === element.slug;

          return (
            <div
              key={element.slug}
              className={cn(
                'inline-flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm font-medium transition',
                active ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-border bg-background hover:bg-accent'
              )}
            >
              <Link href={`/${element.slug}`} className='min-w-0 flex-1 px-1 py-0.5'>
                <span className='truncate'>{element.label}</span>
              </Link>
              <Button
                type='button'
                size='icon'
                variant={active ? 'secondary' : 'ghost'}
                className='size-7 shrink-0'
                title={`How to use ${element.label}`}
                aria-label={`How to use ${element.label}`}
                onClick={() => setHelpSlug(element.slug)}
              >
                <Info className='size-4' />
              </Button>
            </div>
          );
        })}
      </nav>

      <Dialog open={Boolean(helpSlug)} onOpenChange={(open) => !open && setHelpSlug(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{helpElement ? `How to use ${helpElement.label}` : 'Service help'}</DialogTitle>
            <DialogDescription>{helpElement?.description}</DialogDescription>
          </DialogHeader>
          <ul className='list-disc space-y-2 pl-5 text-sm text-muted-foreground'>
            {helpItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
