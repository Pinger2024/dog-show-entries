/**
 * Admin-only download for the A3 generic Award Board master.
 *
 * The PDF is deliberately un-personalised (no club / show type /
 * date pre-filled) so a single print run can be bulk-ordered and
 * posted out with prize-card orders across any show.
 */
import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { auth } from '@/lib/auth';
import { AwardBoard } from '@/components/award-board/award-board';
import { makePdfResponse } from '@/lib/pdf-utils';

export async function GET() {
  const session = await auth();
  if ((session?.user as { role?: string } | undefined)?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const buffer = await renderToBuffer(
      React.createElement(AwardBoard, { size: 'a3' }),
    );
    return makePdfResponse(buffer, 'Award-Board-A3-Generic-Master.pdf', false);
  } catch (err) {
    console.error('Award board A3 generic PDF failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'PDF generation failed', detail: message },
      { status: 500 },
    );
  }
}
