import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const flociOrigin = process.env.FLOCI_ORIGIN || 'http://localhost:4566';
  return NextResponse.json({ ok: true, flociOrigin });
}
