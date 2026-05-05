import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { eq, asc } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { renderToBuffer } from '@react-pdf/renderer';
import { ShowSchedule } from '@/components/schedule/show-schedule';
import type {
  ScheduleShowInfo,
  ScheduleClass,
  ScheduleJudge,
  ScheduleSponsor,
} from '@/components/schedule/show-schedule';
import React from 'react';
import { sanitizeFilename } from '@/lib/slugify';
import { authenticatePdfRequest, makePdfResponse } from '@/lib/pdf-utils';
import { buildClassLabelMap } from '@/lib/class-labels';

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
    with: { organisation: true, venue: true },
  });

  if (!show) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }

  // Draft shows require org membership (with admin bypass); published shows are public
  if (show.status === 'draft') {
    const authResult = await authenticatePdfRequest(show.organisationId, { showId });
    if (authResult instanceof NextResponse) return authResult;
  }

  // Fetch show classes, judge assignments, and sponsors concurrently
  const [showClasses, judgeAssignments, showSponsorData] = await Promise.all([
    db.query.showClasses.findMany({
      where: eq(schema.showClasses.showId, showId),
      with: {
        classDefinition: true,
        breed: true,
      },
      orderBy: [asc(schema.showClasses.sortOrder), asc(schema.showClasses.classNumber)],
    }),
    db.query.judgeAssignments.findMany({
      where: eq(schema.judgeAssignments.showId, showId),
      with: { judge: true, breed: true },
    }),
    db.query.showSponsors.findMany({
      where: eq(schema.showSponsors.showId, showId),
      with: {
        sponsor: true,
        classSponsorships: {
          with: { showClass: { with: { classDefinition: true } } },
        },
      },
      orderBy: [asc(schema.showSponsors.displayOrder)],
    }),
  ]);

  // Build classes data — classLabel is what the PDF actually renders
  // (non-JH classes show their classNumber, JH classes show JHA/JHB…).
  const classLabelMap = buildClassLabelMap(showClasses);
  const classes: ScheduleClass[] = showClasses.map((sc) => ({
    classNumber: sc.classNumber,
    classLabel: classLabelMap.get(sc.id) ?? '',
    className: sc.classDefinition?.name ?? 'Unknown Class',
    classDescription: sc.classDefinition?.description ?? null,
    sex: sc.sex,
    breedName: sc.breed?.name ?? null,
    classType: sc.classDefinition?.type ?? null,
  }));

  // Build judges data (deduplicated by judge id). For each judge we track
  // their breeds, affix, and which sexes they're assigned to.
  //
  // Role detection for single-breed shows (where breedId is usually null on
  // the assignment): JH classes are the only classes with sex=null in the
  // schedule, so a judge assignment with sex=null in a show that has JH
  // classes is implicitly the JH judge. A judge with sex='dog' and/or 'bitch'
  // judges breed classes.
  const hasJuniorHandlerClasses = showClasses.some(
    (sc) => sc.classDefinition?.type === 'junior_handler',
  );
  // For multi-breed shows, build the set of breed names that only appear in
  // JH classes vs breed classes — used when a judge is assigned to a specific
  // breed rather than by sex.
  const juniorBreedSet = new Set<string>();
  const breedBreedSet = new Set<string>();
  for (const sc of showClasses) {
    const breedName = sc.breed?.name;
    if (!breedName) continue;
    if (sc.classDefinition?.type === 'junior_handler') {
      juniorBreedSet.add(breedName);
    } else {
      breedBreedSet.add(breedName);
    }
  }

  type JudgeAggregate = {
    name: string;
    affix: string | null;
    breeds: Set<string>;
    sexes: Set<string>; // 'dog' | 'bitch'
    hasNullSexAssignment: boolean; // any assignment with sex=null
  };
  const judgeMap = new Map<string, JudgeAggregate>();
  for (const ja of judgeAssignments) {
    if (!ja.judge?.id || !ja.judge?.name) continue;
    const key = ja.judge.id;
    if (!judgeMap.has(key)) {
      judgeMap.set(key, {
        name: ja.judge.name,
        affix: ja.judge.kennelClubAffix ?? null,
        breeds: new Set(),
        sexes: new Set(),
        hasNullSexAssignment: false,
      });
    }
    const agg = judgeMap.get(key)!;
    if (ja.breed?.name) agg.breeds.add(ja.breed.name);
    if (ja.sex) {
      agg.sexes.add(ja.sex);
    } else {
      agg.hasNullSexAssignment = true;
    }
  }

  // Build each judge's row, resolving the JH-vs-breed role up front so we
  // can use it as a sort key below.
  const judgeRows = Array.from(judgeMap.values()).map((agg) => {
    const breedArr = Array.from(agg.breeds).sort();
    const onlyJhBreeds =
      breedArr.length > 0 && breedArr.every((b) => juniorBreedSet.has(b) && !breedBreedSet.has(b));
    const nullSexInJhShow =
      hasJuniorHandlerClasses && agg.hasNullSexAssignment && agg.sexes.size === 0;
    const isJuniorOnly = onlyJhBreeds || nullSexInJhShow;

    let role: string;
    if (isJuniorOnly) {
      role = 'Junior Handling';
    } else if (agg.sexes.has('dog') && agg.sexes.has('bitch')) {
      role = 'Dogs & Bitches';
    } else if (agg.sexes.has('dog')) {
      role = 'Dogs';
    } else if (agg.sexes.has('bitch')) {
      role = 'Bitches';
    } else if (breedArr.length > 0) {
      role = breedArr.join(', ');
    } else {
      role = show.showScope === 'single_breed' ? 'Breed Classes' : 'All Breeds';
    }

    const namePart = agg.affix ? `${agg.name} (${agg.affix})` : agg.name;
    const displayLabel = `${namePart} — ${role}`;
    return {
      name: agg.name,
      affix: agg.affix,
      breeds: breedArr,
      sex: (agg.sexes.size === 1 ? Array.from(agg.sexes)[0] : null) as string | null,
      role,
      displayLabel,
      isJuniorOnly,
    };
  });

  // Breed judges first, JH judges after — RKC convention puts the main
  // judging assignment ahead of the Junior Handling role on the schedule.
  // Alphabetical within each tier for stable ordering.
  const judges: ScheduleJudge[] = judgeRows
    .sort((a, b) => {
      if (a.isJuniorOnly !== b.isJuniorOnly) return a.isJuniorOnly ? 1 : -1;
      return a.name.localeCompare(b.name);
    })
    // Strip the helper field — not part of the ScheduleJudge contract.
    .map(({ isJuniorOnly: _isJuniorOnly, ...rest }) => rest);

  // Build sponsors data (defensive: skip sponsors with missing sponsor record)
  const sponsors: ScheduleSponsor[] = showSponsorData
    .filter((ss) => ss.sponsor != null)
    .map((ss) => ({
      name: ss.sponsor.name,
      tier: ss.tier,
      customTitle: ss.customTitle,
      logoUrl: ss.sponsor.logoUrl,
      website: ss.sponsor.website,
      specialPrizes: ss.specialPrizes,
      classSponsorships: (ss.classSponsorships ?? []).map((cs) => ({
        className: cs.showClass?.classDefinition?.name ?? 'Unknown Class',
        trophyName: cs.trophyName,
        trophyDonor: cs.trophyDonor,
        prizeDescription: cs.prizeDescription,
      })),
    }));

  const showInfo: ScheduleShowInfo = {
    slug: show.slug,
    name: show.name,
    showType: show.showType,
    showScope: show.showScope,
    date: show.startDate,
    endDate: show.endDate,
    startTime: show.startTime ?? null,
    entriesOpenDate: show.entriesOpenDate?.toISOString() ?? null,
    entryCloseDate: show.entryCloseDate?.toISOString() ?? null,
    postalCloseDate: show.postalCloseDate?.toISOString() ?? null,
    kcLicenceNo: show.kcLicenceNo ?? null,
    secretaryEmail: show.secretaryEmail ?? null,
    secretaryName: show.secretaryName ?? null,
    secretaryAddress: show.secretaryAddress ?? null,
    secretaryPhone: show.secretaryPhone ?? null,
    showOpenTime: show.showOpenTime ?? null,
    onCallVet: show.onCallVet ?? null,
    description: show.description ?? null,
    firstEntryFee: show.firstEntryFee ?? null,
    subsequentEntryFee: show.subsequentEntryFee ?? null,
    nfcEntryFee: show.nfcEntryFee ?? null,
    juniorHandlerFee: show.juniorHandlerFee ?? null,
    acceptsPostalEntries: show.acceptsPostalEntries ?? false,
    scheduleData: show.scheduleData ?? null,
    organisation: show.organisation
      ? {
          name: show.organisation.name,
          contactEmail: show.organisation.contactEmail ?? null,
          contactPhone: show.organisation.contactPhone ?? null,
          website: show.organisation.website ?? null,
          logoUrl: show.organisation.logoUrl ?? null,
        }
      : null,
    venue: show.venue
      ? {
          name: show.venue.name,
          address: show.venue.address ?? null,
          postcode: show.venue.postcode ?? null,
        }
      : null,
  };

  // Guard against extremely large shows that crash the PDF renderer
  if (classes.length > 2000) {
    return NextResponse.json(
      { error: 'This show has too many classes for PDF generation. Please contact support.' },
      { status: 400 }
    );
  }

  try {
    const pdfDocument = React.createElement(ShowSchedule, {
      show: showInfo,
      classes,
      judges,
      sponsors,
    });
    const buffer = await renderToBuffer(pdfDocument);
    const filename = `${sanitizeFilename(show.name)}-Schedule.pdf`;
    const isPreview = request.nextUrl.searchParams.has('preview');
    return makePdfResponse(buffer, filename, isPreview);
  } catch (err) {
    console.error('Schedule PDF generation failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'PDF generation failed. The show may have too many classes or invalid data. Please try again or contact support.', detail: message },
      { status: 500 }
    );
  }
}
