import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { eq, asc } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { renderToBuffer } from '@react-pdf/renderer';
import { JudgesBook } from '@/components/judges-book/judges-book';
import React from 'react';
import { sanitizeFilename } from '@/lib/slugify';
import { authenticatePdfRequest, makePdfResponse } from '@/lib/pdf-utils';
import { ensureCatalogueNumbers } from '@/server/services/catalogue-numbering';
import { buildClassLabelMap } from '@/lib/class-labels';

export type JudgesBookClass = {
  classLabel: string;
  className: string;
  sex: string | null;
  breedName: string | null;
  judgeName: string | null;
  ringNumber: number | null;
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

  await ensureCatalogueNumbers(db, showId);

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

  // Build breed→judge and breed→ring lookups
  const judgeByBreed = new Map<string | null, string>();
  const ringByBreed = new Map<string | null, number>();
  for (const ja of judgeAssignments) {
    const breedKey = ja.breedId;
    if (ja.judge?.name) judgeByBreed.set(breedKey, ja.judge.name);
    if (ja.ring?.number != null) ringByBreed.set(breedKey, ja.ring.number);
  }

  const classLabelMap = buildClassLabelMap(showClasses);

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

    // Look up judge: try breed-specific first, then show-wide (null breed)
    const judgeName = judgeByBreed.get(sc.breedId) ?? judgeByBreed.get(null) ?? null;
    const ringNumber = ringByBreed.get(sc.breedId) ?? ringByBreed.get(null) ?? null;

    return {
      classLabel: classLabelMap.get(sc.id) ?? '',
      className: sc.classDefinition?.name ?? 'Unknown Class',
      sex: sc.sex,
      breedName: sc.breed?.name ?? null,
      judgeName,
      ringNumber,
      exhibits,
    };
  });

  // Default Best Awards set per show type. Championship shows get CCs +
  // Reserve CCs + Best Puppies. Smaller show types get a tighter list.
  // Whatever the secretary has added to scheduleData.bestAwards is
  // unioned on top (order: defaults first, then custom additions).
  const DEFAULT_BEST_AWARDS: Record<string, string[]> = {
    championship: [
      'Best of Breed',
      'Dog Challenge Certificate',
      'Reserve Dog Challenge Certificate',
      'Bitch Challenge Certificate',
      'Reserve Bitch Challenge Certificate',
      'Best Puppy Dog',
      'Best Puppy Bitch',
      'Best Puppy in Show',
    ],
    premier_open: [
      'Best of Breed',
      'Best Dog',
      'Best Bitch',
      'Best Puppy Dog',
      'Best Puppy Bitch',
      'Best Puppy in Show',
    ],
    open: [
      'Best of Breed',
      'Best Dog',
      'Best Bitch',
      'Best Puppy in Show',
      'Best Veteran in Show',
    ],
    limited: ['Best of Breed', 'Best Dog', 'Best Bitch', 'Best Puppy in Show'],
    primary: ['Best in Show'],
    companion: ['Best in Show'],
  };

  const scheduleData = (show.scheduleData ?? {}) as { bestAwards?: string[] };
  const customAwards = Array.isArray(scheduleData.bestAwards) ? scheduleData.bestAwards : [];
  const defaults = DEFAULT_BEST_AWARDS[show.showType] ?? ['Best in Show'];
  // Union with order preserved: defaults first, then any custom awards that
  // aren't already in the default list (case-insensitive dedupe).
  const defaultsLower = new Set(defaults.map((a) => a.toLowerCase().trim()));
  const bestAwards = [
    ...defaults,
    ...customAwards.filter((a) => !defaultsLower.has(a.toLowerCase().trim())),
  ];

  const showInfo: JudgesBookShowInfo = {
    name: show.name,
    showType: show.showType,
    date: show.startDate,
    organisation: show.organisation?.name ?? null,
    bestAwards,
  };

  try {
    const pdfDocument = React.createElement(JudgesBook, { show: showInfo, classes });
    const buffer = await renderToBuffer(pdfDocument);
    const filename = `${sanitizeFilename(show.name)}-Judges-Book.pdf`;
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
