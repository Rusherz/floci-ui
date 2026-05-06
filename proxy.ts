import { NextResponse, type NextRequest } from 'next/server';

import { ALL_SERVICE_SLUGS, parseEnabledServicesFromEnv } from '@/lib/floci/elements';

const SERVICE_ROUTE_PREFIX = '/';

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const slug = pathname.startsWith(SERVICE_ROUTE_PREFIX) ? pathname.slice(1).split('/')[0] : '';

  if (!slug || !ALL_SERVICE_SLUGS.has(slug)) {
    return NextResponse.next();
  }

  const enabled = parseEnabledServicesFromEnv(process.env.FLOCI_ENABLED_SERVICES ?? process.env.NEXT_PUBLIC_FLOCI_ENABLED_SERVICES);
  if (enabled.has(slug)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = '/not-found';
  return NextResponse.rewrite(url, { status: 404 });
}

export const config = {
  matcher: '/:path*',
};
