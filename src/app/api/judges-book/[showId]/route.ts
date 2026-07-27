import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { eq, asc } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { renderToBuffer } from '@react-pdf/renderer';
import { JudgesBook } from '@/components/judges-book/judges-book';
import React from 'react';
import { sanitizeFilename } from '@/lib/slugify';
import { authenticatePdfRequest, makePdfResponse } from '@/lib/pdf-utils';
import { syncCatalogueNumbers } from '@/server/services/catalogue-numbering';
import { buildClassLabelMap } from '@/lib/class-labels';
import { buildBestAwards } from '@/lib/best-awards';
import { stripUnembeddedBase14Fonts } from '@/lib/pdf-pad';

export type JudgesBookClass = {
  classLabel: string;
  className: string;
  sex: string | null;
  breedName: string | null;
  judgeId: string | null;
  judgeName: string | null;
  ringNumber: number | null;
  isJh: boolean;
  exhibits: {
    catalogueNumber: string | null;
    dogName: string;
    absent: boolean;
  }[];
};

export type JudgesBookShowInfo = {
  name: string;
  showType: string;
  date: string;
  organisation: string | null;
  /** Club/show logo for the front cover (club branding). */
  logoUrl?: string | null;
  /** When this is a per-judge book, the judge it's for (shown on the cover). */
  judgeName?: string | null;
  /** Show-level best awards (BOB, CCs, Best Puppy in Show, etc.) that get
   *  their own sign-off page at the back of the book. Combination of
   *  defaults for the show type + whatever secretary added to schedule. */
  bestAwards: string[];
};

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
    with: { organisation: true },
  });

  if (!show) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }

  const authResult = await authenticatePdfRequest(show.organisationId);
  if (authResult instanceof NextResponse) return authResult;

  await syncCatalogueNumbers(db, showId, { allowResort: false });

  // Run independent DB queries in parallel
  const [showClasses, judgeAssignments] = await Promise.all([
    db.query.showClasses.findMany({
      where: eq(schema.showClasses.showId, showId),
      with: {
        classDefinition: true,
        breed: true,
        entryClasses: {
          with: {
            entry: {
              with: { dog: true },
            },
          },
        },
      },
      orderBy: [asc(schema.showClasses.sortOrder), asc(schema.showClasses.classNumber)],
    }),
    db.query.judgeAssignments.findMany({
      where: eq(schema.judgeAssignments.showId, showId),
      with: { judge: true, breed: true, ring: true },
    }),
  ]);

  // Map judges to classes by WHAT THEY JUDGE, not just breed. A single-breed
  // show has breed_id = null on its classes, so a flat breed→judge map collided
  // the Junior Handling judge (no breed, no sex) with the breed judge — Andrew
  // (JH) was showing on the breed/dog classes instead of Helen (Mandy
  // 2026-06-19). Resolution order per class: JH → breed → sex → fallback.
  type JudgeRef = { id: string; name: string; ring: number | null };
  let jhJudge: JudgeRef | null = null;
  const judgeBySex = new Map<string, JudgeRef>();
  const judgeByBreed = new Map<string, JudgeRef>();
  let breedFallback: JudgeRef | null = null;
  for (const ja of judgeAssignments) {
    if (!ja.judge?.id || !ja.judge?.name) continue;
    if (ja.isSpecialAwardsClassesJudge) continue; // SAC judges sign the SAC block only
    const ref: JudgeRef = { id: ja.judge.id, name: ja.judge.name, ring: ja.ring?.number ?? null };
    if (!ja.breedId && !ja.sex) {
      jhJudge = ref; // no breed AND no sex = the Junior Handling judge
      continue;
    }
    if (ja.breedId) judgeByBreed.set(ja.breedId, ref);
    if (ja.sex) judgeBySex.set(ja.sex, ref);
    breedFallback ??= ref;
  }
  const judgeForClass = (sc: (typeof showClasses)[number]): JudgeRef | null => {
    if (sc.classDefinition?.type === 'junior_handler') return jhJudge;
    if (sc.breedId && judgeByBreed.has(sc.breedId)) return judgeByBreed.get(sc.breedId)!;
    if (sc.sex && judgeBySex.has(sc.sex)) return judgeBySex.get(sc.sex)!;
    return (sc.breedId ? judgeByBreed.get(sc.breedId) ?? null : null) ?? breedFallback;
  };

  const classLabelMap = buildClassLabelMap(showClasses, show.showRuleset);

  // Build the classes data for the judge's book
  const classes: JudgesBookClass[] = showClasses.map((sc) => {
    // Get confirmed entries for this class
    const exhibits = sc.entryClasses
      .filter((ec) => ec.entry && ec.entry.status === 'confirmed' && !ec.entry.deletedAt)
      .map((ec) => ({
        catalogueNumber: ec.entry!.catalogueNumber,
        dogName: ec.entry!.dog?.registeredName ?? 'Unknown',
        absent: ec.entry!.absent ?? false,
      }))
      .sort((a, b) => {
        const numA = parseInt(a.catalogueNumber ?? '0');
        const numB = parseInt(b.catalogueNumber ?? '0');
        return numA - numB;
      });

    const judge = judgeForClass(sc);

    return {
      classLabel: classLabelMap.get(sc.id) ?? '',
      className: sc.classDefinition?.name ?? 'Unknown Class',
      sex: sc.sex,
      breedName: sc.breed?.name ?? null,
      judgeId: judge?.id ?? null,
      judgeName: judge?.name ?? null,
      ringNumber: judge?.ring ?? null,
      isJh: sc.classDefinition?.type === 'junior_handler',
      exhibits,
    };
  });

  // Default Best Awards per show type (championship → CCs + Best Puppies,
  // etc.), unioned with whatever the secretary added to scheduleData.bestAwards.
  // Shared with the catalogue's back-of-book write-in page via lib/best-awards.
  const scheduleData = (show.scheduleData ?? {}) as { bestAwards?: string[] };
  const customAwards = Array.isArray(scheduleData.bestAwards) ? scheduleData.bestAwards : [];
  const bestAwards = buildBestAwards(show.showType, customAwards);

  // Optional per-judge book: ?judge=<judgeId> filters to just that judge's
  // classes so each judge gets their own book (Mandy 2026-06-19 — Helen's GSD
  // book and Andrew's Junior Handling book, printed separately).
  const filterJudgeId = request.nextUrl.searchParams.get('judge');
  const bookClasses = filterJudgeId
    ? classes.filter((c) => c.judgeId === filterJudgeId)
    : classes;
  const filterJudgeName = filterJudgeId
    ? bookClasses.find((c) => c.judgeName)?.judgeName ??
      judgeAssignments.find((ja) => ja.judge?.id === filterJudgeId)?.judge?.name ??
      null
    : null;
  // Best Awards (BIS / CCs / Best Puppy in Show) are decided by the breed
  // judge, so only carry that sign-off page when the book has breed classes —
  // a Junior-Handling-only book doesn't need it.
  const hasBreedClasses = bookClasses.some((c) => !c.isJh);

  const showInfo: JudgesBookShowInfo = {
    name: show.name,
    showType: show.showType,
    date: show.startDate,
    organisation: show.organisation?.name ?? null,
    logoUrl: show.organisation?.logoUrl ?? null,
    bestAwards: hasBreedClasses ? bestAwards : [],
    judgeName: filterJudgeName,
  };

  try {
    const pdfDocument = React.createElement(JudgesBook, { show: showInfo, classes: bookClasses });
    const rawBuffer = await renderToBuffer(pdfDocument);
    // Strip react-pdf's unembedded base-14 phantom font refs (Helvetica etc.)
    // so the branded cover + working pages pass print preflight.
    const buffer = Buffer.from(await stripUnembeddedBase14Fonts(rawBuffer));
    const judgeSuffix = filterJudgeName ? `-${sanitizeFilename(filterJudgeName)}` : '';
    const filename = `${sanitizeFilename(show.name)}-Judges-Book${judgeSuffix}.pdf`;
    const isPreview = request.nextUrl.searchParams.has('preview');
    return makePdfResponse(buffer, filename, isPreview);
  } catch (err) {
    console.error('Judge\'s book PDF generation failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'PDF generation failed', detail: message },
      { status: 500 }
    );
  }
}
