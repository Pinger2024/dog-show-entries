import { NextResponse } from 'next/server';

/** Lightweight endpoint for client-side error reporting.
 *  Error boundaries POST here so we can see the actual errors
 *  in the Render server logs instead of guessing. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.error(
      `[client-error] ${body.boundary ?? 'unknown'}: ${body.message ?? 'no message'}`,
      body.stack ? `\n${body.stack}` : '',
      body.url ? `| url: ${body.url}` : '',
      body.digest ? `| digest: ${body.digest}` : ''
    );
  } catch {
    // Don't crash on malformed reports
  }
  return NextResponse.json({ ok: true });
}
