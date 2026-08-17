import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { publicOrgColumns } from '@/server/trpc/public-org-columns';
import { db } from '@/server/db';
import { asc, eq } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { renderToBuffer } from '@react-pdf/renderer';
import { PrizeCardComposite } from '@/components/prize-cards/prize-card-composite';
import type { CompositeShowInfo } from '@/components/prize-cards/prize-card-composite';
import React from 'react';
import { sanitizeFilename } from '@/lib/slugify';
import { authenticatePdfRequest, makePdfResponse } from '@/lib/pdf-utils';
import { resolveJudgeForClass } from '@/lib/judge-resolution';
import { buildPrizeCardPages, type PrizeCardClassInput } from '@/lib/prize-card-pages';
import { sectionClasses, buildClassLabelMap } from '@/lib/class-labels';
import { fetchClubImage } from '@/lib/safe-image-fetch';

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
 * page, N copies"), in CLASS-MAJOR running order (Mandy's correction, same
 * day: "MPD 1st, 2nd followed by puppy dog 1st 2nd, 3rd, junior dog, 1st
 * etc" — each class's own placements in sequence, before the next class).
 * Per show_class: count CONFIRMED (non-deleted) entries — same filter as
 * secretary.getPrizeCardCounts — and resolve that class's OWN judge via
 * resolveJudgeForClass (Special Award Classes and Junior Handling must NOT
 * inherit the breed judge — see judge-resolution.ts). Classes are queried
 * in sortOrder/classNumber order (same as the Judge's Book) and rebucketed
 * Dog → Bitch → Special Awards → Junior Handling via the shared
 * `sectionClasses` helper (class-labels.ts) — the SAME running order every
 * other document uses, not invented here. buildPrizeCardPages
 * (src/lib/prize-card-pages.ts) turns those ordered per-class records into
 * the final page list. See prize-card-composite.tsx for the rendering
 * details.
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

  const [showClassesRaw, judgeAssignments] = await Promise.all([
    db.query.showClasses.findMany({
      where: eq(schema.showClasses.showId, showId),
      with: {
        classDefinition: true,
        entryClasses: {
          with: { entry: true },
        },
      },
      // Same running order as the Judge's Book (judges-book/[showId]/route.ts)
      // — sectionClasses below only buckets, it never re-sorts, so this is
      // the order every class keeps within its Dog/Bitch/Special/JH section.
      orderBy: [asc(schema.showClasses.sortOrder), asc(schema.showClasses.classNumber)],
    }),
    db.query.judgeAssignments.findMany({
      where: eq(schema.judgeAssignments.showId, showId),
      with: { judge: true, ring: true },
    }),
  ]);

  // Class running order — Dog → Bitch → Special Awards → Junior Handling,
  // the SAME shared bucketing every other document (Judge's Book, catalogue,
  // schedule) uses. Do not invent a different order here.
  const showClasses = sectionClasses(showClassesRaw, (sc) => sc).flatMap((section) => section.classes);

  // Class label — Mandy, South Western: "the name of the class is on them"
  // (2026-07-30). buildClassLabelMap is the SAME canonical helper the
  // Judge's Book uses for its "Class {label}" heading (JH → JHA/JHB…, SAC →
  // A/B/C…, SV age → 1a/1b…, everything else → its stored classNumber) — do
  // not hand-format the numbering. The class's own descriptive name is
  // appended verbatim (classDefinition.name, unmodified) since that's what
  // Mandy actually asked to see on the card.
  const classLabelMap = buildClassLabelMap(showClassesRaw, show.showRuleset);

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
    const number = classLabelMap.get(sc.id);
    const name = sc.classDefinition?.name ?? 'Unknown Class';
    return {
      confirmedCount,
      judgeId: judge?.id ?? null,
      judgeName: judge?.name ?? null,
      judgeAffix: judge ? affixByJudgeId.get(judge.id) ?? null : null,
      classLabel: number ? `Class ${number} — ${name}` : name,
      // Class definitions are sex-neutral ("Minor Puppy"); sex lives on
      // the show_class row. Mandy, South Western: "you need the sex on
      // them ie minor puppy dog, minor puppy bitch" (2026-07-30).
      // buildPrizeCardPages appends the Dog/Bitch suffix (see
      // prize-card-pages.ts) — sexless classes (SAC/JH) pass sex=null.
      sex: sc.sex ?? null,
    };
  });

  const pages = buildPrizeCardPages(classInputs);

  // Club logo — fetched, downscaled and inlined as a data URI HERE rather
  // than handed to react-pdf as a remote URL. Two reasons: react-pdf would
  // re-fetch it during render, and any failure (404, R2 hiccup, an image it
  // rejects for "invalid dimensions") would throw and 500 the whole
  // document. A club logo is decoration — losing it must never cost the
  // secretary her prize cards, so every failure path degrades to no logo,
  // exactly what a club without one already gets. Downscaled to 300px so a
  // 1.6MB club PNG doesn't ride along in a 75-page PDF; the data URI is one
  // stable string, so pdfkit still embeds it once and reuses it per page.
  let logoDataUri: string | null = null;
  const clubLogoUrl = show.organisation?.logoUrl;
  if (clubLogoUrl) {
    // fetchClubImage guards the SSRF sink — organisations.logo_url is
    // secretary-supplied (`z.string().url()`), so it must never be handed
    // to a bare fetch(). See lib/safe-image-fetch.ts.
    const raw = await fetchClubImage(clubLogoUrl);
    if (raw) {
      try {
        const png = await sharp(raw)
          .resize({ width: 300, withoutEnlargement: true })
          .png()
          .toBuffer();
        logoDataUri = `data:image/png;base64,${png.toString('base64')}`;
      } catch (err) {
        console.warn(`Prize cards: club logo could not be processed for show ${showId}`, err);
      }
    } else {
      console.warn(`Prize cards: club logo unavailable or rejected for show ${showId}`);
    }
  }

  const showInfo: CompositeShowInfo = {
    clubName: show.organisation?.name ?? 'Unknown Club',
    showName: show.name,
    showType: show.showType,
    date: show.startDate,
    logoUrl: logoDataUri,
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
