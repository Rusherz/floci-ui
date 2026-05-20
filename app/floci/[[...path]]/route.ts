import { NextRequest } from 'next/server';
import { FLOCI_ENDPOINT_COOKIE, FLOCI_ENDPOINT_FALLBACK, isValidEndpointUrl } from '@/lib/floci/endpoint';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ path?: string[] }> };

async function proxyRequest(request: NextRequest, params?: { path?: string[] }) {
  const path = params?.path?.length ? `/${params.path.join('/')}` : '/';
  const configuredEndpoint = request.cookies.get(FLOCI_ENDPOINT_COOKIE)?.value?.trim();
  const envEndpoint = process.env.FLOCI_ORIGIN?.trim();
  const defaultEndpoint = envEndpoint && isValidEndpointUrl(envEndpoint) ? envEndpoint : FLOCI_ENDPOINT_FALLBACK;
  const origin = configuredEndpoint && isValidEndpointUrl(configuredEndpoint) ? configuredEndpoint : defaultEndpoint;
  const upstream = new URL(path, origin);
  upstream.search = request.nextUrl.search;

  const headers = new Headers(request.headers);
  headers.set('host', upstream.host);
  headers.set('origin', upstream.origin);
  headers.set('referer', upstream.origin);
  headers.delete('content-length');

  const method = request.method.toUpperCase();
  const body = method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer();

  const response = await fetch(upstream, {
    method,
    headers,
    body,
    redirect: 'manual',
    cache: 'no-store',
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, await context.params);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, await context.params);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, await context.params);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, await context.params);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, await context.params);
}

export async function OPTIONS(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, await context.params);
}

export async function HEAD(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, await context.params);
}
