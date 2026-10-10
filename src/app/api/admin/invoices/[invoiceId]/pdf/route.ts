import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import React from 'react';
import { auth } from '@/lib/auth';
import { db } from '@/server/db';
import { invoices } from '@/server/db/schema';
import { makePdfResponse } from '@/lib/pdf-utils';
import { stripUnembeddedBase14Fonts } from '@/lib/pdf-pad';
import { sanitizeFilename } from '@/lib/slugify';
import { InvoicePdf, type InvoicePdfInfo } from '@/components/reports/invoice-pdf';
import { formatLondonShortDate, formatLondonLongDateNoComma } from '@/lib/date-utils';

/**
 * Club invoices carry Remi's real Stripe-fee economics — they must never be
 * reachable by a club's own secretary/exhibitor session. Deliberately does
 * NOT use `authenticatePdfRequest` (it admits org members); this route
 * checks the REAL session role inline instead, same pattern as the Award
 * Board A3 admin download.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const session = await auth();
  if ((session?.user as { role?: string } | undefined)?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  if (!db) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 });
  }

  const { invoiceId } = await params;
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, invoiceId),
    with: {
      organisation: { columns: { id: true, name: true } },
      show: { columns: { id: true, name: true, startDate: true } },
    },
  });
  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  const isPreview = request.nextUrl.searchParams.has('preview');

  const info: InvoicePdfInfo = {
    invoiceNumber: invoice.invoiceNumber,
    clubName: invoice.organisation.name,
    showName: invoice.show.name,
    showDate: safeDate(invoice.show.startDate),
    // issuedAt is a timestamptz instant — Europe/London, never the process's
    // own timezone (Michael 2026-09-03).
    issuedAt: formatLondonShortDate(invoice.issuedAt),
  };

  try {
    // Render from the snapshot only — never recompute.
    const element = React.createElement(InvoicePdf, {
      info,
      lineItems: invoice.lineItems,
      netToClubPence: invoice.netToClubPence,
      captureGapCount: invoice.captureGapCount,
    });
    const rawBuffer = await renderToBuffer(element as React.ReactElement<DocumentProps>);
    const buffer = Buffer.from(await stripUnembeddedBase14Fonts(rawBuffer));
    const filename = `${sanitizeFilename(invoice.organisation.name)}-${invoice.invoiceNumber}.pdf`;
    return makePdfResponse(buffer, filename, isPreview);
  } catch (err) {
    console.error('Invoice PDF generation failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'PDF generation failed', detail: message }, { status: 500 });
  }
}

function safeDate(iso: string): string {
  try {
    return formatLondonLongDateNoComma(iso);
  } catch {
    return iso;
  }
}
