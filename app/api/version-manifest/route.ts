import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const configuredUrl = process.env.VERSION_MANIFEST_URL?.trim() || '/version.json';
  const targetUrl = /^https?:\/\//i.test(configuredUrl) ? configuredUrl : new URL(configuredUrl, request.nextUrl.origin).toString();

  try {
    const upstream = await fetch(targetUrl, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { version: null, unavailable: true, status: upstream.status },
        {
          headers: {
            'Cache-Control': 'no-store, max-age=0',
          },
        }
      );
    }

    const payload = await upstream.json();

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch {
    return NextResponse.json(
      { version: null, unavailable: true },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  }
}
