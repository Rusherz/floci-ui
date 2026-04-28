import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { FLOCI_ELEMENTS } from '@/lib/floci/elements';

type ElementsNavProps = {
  activeSlug?: string;
};

export function ElementsNav({ activeSlug }: ElementsNavProps) {
  return (
    <nav className='grid gap-2'>
      {FLOCI_ELEMENTS.map((element) => {
        const active = activeSlug === element.slug;

        return (
          <Link
            key={element.slug}
            href={`/${element.slug}`}
            className={cn(
              'inline-flex items-center justify-between rounded-md border px-3 py-2 text-sm font-medium transition',
              active ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-border bg-background hover:bg-accent'
            )}
          >
            <span>{element.label}</span>
            <Badge variant={element.status === 'implemented' ? 'secondary' : 'outline'}>
              {element.status === 'implemented' ? 'Live' : 'Planned'}
            </Badge>
          </Link>
        );
      })}
    </nav>
  );
}
