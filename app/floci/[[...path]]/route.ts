import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const FLOCI_ORIGIN = process.env.FLOCI_ORIGIN || 'http://localhost:4566';
type RouteContext = { params: Promise<{ path?: string[] }> };

async function proxyRequest(request: NextRequest, params?: { path?: string[] }) {
  const path = params?.path?.length ? `/${params.path.join('/')}` : '/';
  const upstream = new URL(path, FLOCI_ORIGIN);
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
