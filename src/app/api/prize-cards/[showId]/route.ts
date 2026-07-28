import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { eq } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { renderToBuffer } from '@react-pdf/renderer';
import { PrizeCardComposite } from '@/components/prize-cards/prize-card-composite';
import type { CompositeShowInfo } from '@/components/prize-cards/prize-card-composite';
import React from 'react';
import { sanitizeFilename } from '@/lib/slugify';
import { authenticatePdfRequest, makePdfResponse } from '@/lib/pdf-utils';

/**
 * Prize Cards PDF endpoint — the official template design. Renders the
 * Mixam-designed artwork (public/prize-cards/*.jpg) as a full-bleed A5
 * background with the club/show/judge text overprinted, one page per
 * placement (1st/2nd/3rd/Reserve). See prize-card-composite.tsx for the
 * rendering details.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ showId: string }> }
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

  // Pick the "main" breed judges — same convention as
  // prize-card-overprint.tsx (breed=null AND sex=null is the Junior
  // Handling judge and is excluded; the Special Award Classes judge
  // shares that same null/null shape so it's excluded too):
  //   - breed=X                  → main judge for that breed
  //   - breed=null AND sex!=null → sex-specific main judge
  //     (single-breed shows leave breed implicit)
  const mainAssignments = show.judgeAssignments.filter((a) => {
    if (!a.judge) return false;
    if (a.breedId === show.breedId && show.breedId !== null) return true;
    if (a.breedId === null && a.sex !== null) return true;
    return false;
  });

  // Dedupe by judge id — a judge assigned to both dog and bitch classes
  // only needs one card variant.
  const seen = new Set<string>();
  const breedJudges: { name: string; affix: string | null }[] = [];
  for (const a of mainAssignments) {
    if (seen.has(a.judge!.id)) continue;
    seen.add(a.judge!.id);
    breedJudges.push({
      name: a.judge!.name,
      affix: a.judge!.kennelClubAffix,
    });
  }

  const showInfo: CompositeShowInfo = {
    clubName: show.organisation?.name ?? 'Unknown Club',
    showName: show.name,
    showType: show.showType,
    date: show.startDate,
    judges: breedJudges,
  };

  try {
    const pdfDocument = React.createElement(PrizeCardComposite, { show: showInfo });
    const buffer = await renderToBuffer(pdfDocument);
    const filename = `${sanitizeFilename(show.name)}-Prize-Cards.pdf`;
    const isPreview = request.nextUrl.searchParams.has('preview');
    return makePdfResponse(buffer, filename, isPreview);
  } catch (err) {
    console.error('Prize card PDF generation failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'PDF generation failed', detail: message },
      { status: 500 }
    );
  }
}
