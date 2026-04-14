import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { eq } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { renderToBuffer } from '@react-pdf/renderer';
import {
  PrizeCardOverprint,
  type OverprintShowInfo,
} from '@/components/prize-cards/prize-card-overprint';
import React from 'react';
import { sanitizeFilename } from '@/lib/slugify';
import {
  authenticatePdfRequest,
  validateRasterLogoUrl,
  makePdfResponse,
} from '@/lib/pdf-utils';

/**
 * Prize Card Overprint PDF endpoint.
 *
 * Generates a 5-page PDF where each page carries ONLY the show-specific
 * text/logo, positioned to land on the cream middle zone of the Mixam
 * bulk-printed blank prize cards. The user feeds a stack of coloured
 * blanks into their laser printer and prints N copies of the matching
 * page (red blanks → page 1, blue → page 2, etc).
 *
 * Admin-only for now — Amanda + Michael are the only users fulfilling
 * Print Shop orders. When the customer-facing Print Shop flow lands,
 * this same endpoint will be called server-side to produce the overprint
 * that accompanies each order.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ showId: string }> },
) {
  const { showId } = await params;

  if (!db) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 });
  }

  const show = await db.query.shows.findFirst({
    where: eq(schema.shows.id, showId),
    with: {
      organisation: true,
      judgeAssignments: {
        with: { judge: true },
      },
    },
  });

  if (!show) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }

  const authResult = await authenticatePdfRequest(show.organisationId);
  if (authResult instanceof NextResponse) return authResult;

  const safeLogoUrl = await validateRasterLogoUrl(show.organisation?.logoUrl);

  // Pick the "main" judges for the overprint. Per the codebase
  // convention (see pdf-generation.ts judge-label builder):
  //   - breed=null AND sex=null  → Junior Handling judge  (SKIP)
  //   - breed=X                  → main judge for that breed
  //   - breed=null AND sex!=null → sex-specific main judge
  //     (single-breed shows leave breed implicit)
  //
  // For the overprint we want the breed's main judges only, so
  // include any assignment for the show's breed, plus any with
  // an explicit sex (since those are definitively not JH).
  const mainAssignments = show.judgeAssignments.filter((a) => {
    if (!a.judge) return false;
    if (a.breedId === show.breedId && show.breedId !== null) return true;
    if (a.breedId === null && a.sex !== null) return true;
    return false;
  });

  // Each unique judge becomes one variant. The PDF then renders
  // 5 placements × N variants pages, grouped by placement, so the
  // operator can print every judge's 1st card on red blanks before
  // swapping to blue. Dedupe by judgeId (a single judge assigned to
  // both dog and bitch only needs one variant).
  const seen = new Set<string>();
  const breedJudges: { name: string; sex: 'dog' | 'bitch' | null; affix: string | null }[] = [];
  for (const a of mainAssignments) {
    if (seen.has(a.judge!.id)) continue;
    seen.add(a.judge!.id);
    breedJudges.push({
      name: a.judge!.name,
      sex: null,
      affix: a.judge!.kennelClubAffix,
    });
  }

  const showInfo: OverprintShowInfo = {
    clubName: show.organisation?.name ?? 'Unknown Club',
    showName: show.name,
    showType: show.showType,
    date: show.startDate,
    logoUrl: safeLogoUrl,
    judges: breedJudges,
  };

  try {
    const pdfDocument = React.createElement(PrizeCardOverprint, { show: showInfo });
    const buffer = await renderToBuffer(pdfDocument);
    const filename = `${sanitizeFilename(show.name)}-Prize-Card-Overprint.pdf`;
    const isPreview = request.nextUrl.searchParams.has('preview');
    return makePdfResponse(buffer, filename, isPreview);
  } catch (err) {
    console.error('Prize card overprint PDF generation failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'PDF generation failed', detail: message },
      { status: 500 },
    );
  }
}
