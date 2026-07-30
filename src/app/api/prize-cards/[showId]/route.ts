import { NextRequest, NextResponse } from 'next/server';
import { publicOrgColumns } from '@/server/trpc/public-org-columns';
import { db } from '@/server/db';
import { eq } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { renderToBuffer } from '@react-pdf/renderer';
import { PrizeCardComposite } from '@/components/prize-cards/prize-card-composite';
import type { CompositeShowInfo } from '@/components/prize-cards/prize-card-composite';
import React from 'react';
import { sanitizeFilename } from '@/lib/slugify';
import { authenticatePdfRequest, makePdfResponse } from '@/lib/pdf-utils';
import { resolveJudgeForClass } from '@/lib/judge-resolution';
import { buildPrizeCardPages, type PrizeCardClassInput } from '@/lib/prize-card-pages';

// Above this, log loudly — a runaway page count (e.g. a bug that stops the
// image-embed cache from matching, or a genuinely enormous show) should be
// visible in logs rather than silently shipping a huge file. See
// prize-card-composite.tsx for why a normal full suite stays small (~1-2MB
// even at 75+ pages) — repeated pages reuse one embedded image per template.
const LARGE_PDF_BYTES = 10 * 1024 * 1024;

/**
 * Prize Cards PDF endpoint — the official template design. Renders the
 * Mixam-designed artwork (public/prize-cards/*.jpg) as a full-bleed A5
 * background with the club/show/judge text overprinted.
 *
 * ONE PAGE PER CARD NEEDED, not one page per placement (Mandy 2026-07-30 —
 * Doxzoo prices a single upload of N literal pages differently from "one
 * page, N copies"). Per show_class: count CONFIRMED (non-deleted) entries
 * — same filter as secretary.getPrizeCardCounts — and resolve that class's
 * OWN judge via resolveJudgeForClass (Special Award Classes and Junior
 * Handling must NOT inherit the breed judge — see judge-resolution.ts).
 * buildPrizeCardPages (src/lib/prize-card-pages.ts) turns those per-class
 * records into the final ordered page list. See prize-card-composite.tsx
 * for the rendering details.
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
      organisation: { columns: publicOrgColumns },
    },
  });

  if (!show) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }

  // Org-member access, NOT admin-only. The Prize Cards row on the secretary
  // Documents page is gated by documentRowVisible('prize-cards') — ruleset
  // only, no role check — so every secretary of an RKC show sees and uses it.
  // (requireAdmin was briefly shipped here on 2026-07-30 based on a stale
  // branch's UI and 403'd secretaries out of their own prize cards.)
  const authResult = await authenticatePdfRequest(show.organisationId);
  if (authResult instanceof NextResponse) return authResult;

  const [showClasses, judgeAssignments] = await Promise.all([
    db.query.showClasses.findMany({
      where: eq(schema.showClasses.showId, showId),
      with: {
        classDefinition: true,
        entryClasses: {
          with: { entry: true },
        },
      },
    }),
    db.query.judgeAssignments.findMany({
      where: eq(schema.judgeAssignments.showId, showId),
      with: { judge: true, ring: true },
    }),
  ]);

  // Per-class judge — Special Award Classes and Junior Handling classes get
  // their OWN judge here, never the breed judge (the documented trap in
  // judge-resolution.ts). Affix isn't part of resolveJudgeForClass's
  // JudgeRef (the Judge's Book doesn't print it), so it's looked up
  // separately by judge id from the same assignments query.
  const judgeForClass = resolveJudgeForClass(judgeAssignments);
  const affixByJudgeId = new Map<string, string | null>();
  for (const ja of judgeAssignments) {
    if (ja.judge?.id) affixByJudgeId.set(ja.judge.id, ja.judge.kennelClubAffix ?? null);
  }

  const classInputs: PrizeCardClassInput[] = showClasses.map((sc) => {
    // Same "true catalogue entry" filter as secretary.getPrizeCardCounts:
    // status='confirmed' AND not soft-deleted.
    const confirmedCount = sc.entryClasses.filter(
      (ec) => ec.entry && ec.entry.status === 'confirmed' && !ec.entry.deletedAt
    ).length;
    const judge = judgeForClass(sc);
    return {
      confirmedCount,
      judgeId: judge?.id ?? null,
      judgeName: judge?.name ?? null,
      judgeAffix: judge ? affixByJudgeId.get(judge.id) ?? null : null,
    };
  });

  const pages = buildPrizeCardPages(classInputs);

  const showInfo: CompositeShowInfo = {
    clubName: show.organisation?.name ?? 'Unknown Club',
    showName: show.name,
    showType: show.showType,
    date: show.startDate,
  };

  try {
    const pdfDocument = React.createElement(PrizeCardComposite, { show: showInfo, pages });
    const buffer = await renderToBuffer(pdfDocument);
    // pages.length is the true card count; the composite substitutes a
    // single explanatory page when it's 0 (no confirmed entries yet), so
    // the log says so rather than claiming a 0-page PDF was produced.
    const pageDescription = pages.length > 0 ? `${pages.length} pages` : 'no entries yet (1-page placeholder)';
    if (buffer.length > LARGE_PDF_BYTES) {
      console.warn(
        `Prize cards PDF for show ${showId} is ${(buffer.length / 1024 / 1024).toFixed(1)}MB ` +
          `across ${pageDescription} — larger than expected, investigate before it ships.`
      );
    } else {
      console.log(`Prize cards PDF for show ${showId}: ${pageDescription}, ${(buffer.length / 1024).toFixed(0)}KB`);
    }
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
