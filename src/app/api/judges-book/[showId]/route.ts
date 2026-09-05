import { NextRequest, NextResponse } from 'next/server';
import { publicOrgColumns } from '@/server/trpc/public-org-columns';
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
import { resolveJudgeForClass } from '@/lib/judge-resolution';
import type { JudgeAssignmentInput, JudgeForClassInput, JudgeRef } from '@/lib/judge-resolution';

// Moved to src/lib/judge-resolution.ts 2026-07-30 so the Prize Cards PDF
// could reuse it without importing a route file. Re-exported here so
// existing imports (this route's own use below, and the SAC regression test
// at src/__tests__/integration/judges-book-sac-judge.test.ts) keep working
// unchanged.
export { resolveJudgeForClass };
export type { JudgeAssignmentInput, JudgeForClassInput, JudgeRef };

export type JudgesBookClass = {
  classLabel: string;
  className: string;
  sex: string | null;
  breedName: string | null;
  judgeId: string | null;
  judgeName: string | null;
  ringNumber: number | null;
  isJh: boolean;
  /** Raw show_classes.classDefinition.type ('age' | 'special' |
   *  'junior_handler' | 'sv_age' | …) — carried through so the renderer can
   *  bucket classes Dog → Bitch → Special Awards → Junior Handling via the
   *  shared `sectionClasses` helper (class-labels.ts), the SAME bucketing
   *  every other document uses. Previously this route trusted raw
   *  show_classes.sortOrder, which let Special Award / Junior Handling
   *  classes sit between the dog and bitch blocks on some shows — see
   *  buildJudgesBookPages (lib/judges-book-pages.ts). */
  classType: string | null;
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
    with: { organisation: { columns: publicOrgColumns } },
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

  // Map judges to classes by WHAT THEY JUDGE, not just breed — see
  // resolveJudgeForClass above for the resolution order and why the SAC
  // judge needs a dedicated carve-out.
  const judgeForClass = resolveJudgeForClass(judgeAssignments);

  const classLabelMap = buildClassLabelMap(showClasses, show.showRuleset);

  // Build the classes data for the judge's book
  const classes: JudgesBookClass[] = showClasses.map((sc) => {
    // Get confirmed entries for this class
    const exhibits = sc.entryClasses
      .filter((ec) => ec.entry && ec.entry.status === 'confirmed' && !ec.entry.deletedAt)
      .map((ec) => ({
        catalogueNumber: ec.entry!.catalogueNumber,
        dogName: ec.entry!.dog?.registeredName ?? 'Unknown',
        // Per-class attendance (Mandy 2026-08-12) — the judge's book is
        // read class-by-class in the ring, so this must be THIS class's own
        // flag, not the whole-show roll-up: a dog absent from her breed
        // class but shown in a Special Award must not print "absent" there.
        absent: ec.absent ?? false,
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
      classType: sc.classDefinition?.type ?? null,
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
  // Best Awards (BIS / CCs / Best Puppy in Show) are decided by the DOG or
  // BITCH breed judge, so only carry them when the book actually has a dog
  // or bitch class — a Junior-Handling-only book doesn't need them, and
  // neither does a Special-Award-Classes-only book (the SAC judge decides
  // the Special Award classes, not Best of Breed/CCs/etc — see
  // judge-resolution.ts). Checking `sex` directly rather than `!isJh` closes
  // that SAC gap: a SAC class is also not JH, so the old `!isJh` check
  // wrongly counted it as a "breed class" and would have handed a
  // SAC-only per-judge book three stray awards pages once the sign-off
  // split by section (buildJudgesBookPages) below.
  const hasBreedClasses = bookClasses.some((c) => c.sex === 'dog' || c.sex === 'bitch');

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
