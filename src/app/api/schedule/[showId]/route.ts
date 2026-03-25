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
  ScheduleFormat,
} from '@/components/schedule/show-schedule';
import React from 'react';
import { sanitizeFilename } from '@/lib/slugify';
import { authenticatePdfRequest, makePdfResponse } from '@/lib/pdf-utils';

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
    const authResult = await authenticatePdfRequest(show.organisationId);
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

  // Build classes data
  const classes: ScheduleClass[] = showClasses.map((sc) => ({
    classNumber: sc.classNumber,
    className: sc.classDefinition?.name ?? 'Unknown Class',
    classDescription: sc.classDefinition?.description ?? null,
    sex: sc.sex,
    breedName: sc.breed?.name ?? null,
    classType: sc.classDefinition?.type ?? null,
  }));

  // Build judges data (deduplicated by judge name)
  const judgeMap = new Map<string, Set<string>>();
  for (const ja of judgeAssignments) {
    if (!ja.judge?.name) continue;
    if (!judgeMap.has(ja.judge.name)) {
      judgeMap.set(ja.judge.name, new Set());
    }
    if (ja.breed?.name) {
      judgeMap.get(ja.judge.name)!.add(ja.breed.name);
    }
  }

  const judges: ScheduleJudge[] = Array.from(judgeMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, breeds]) => ({
      name,
      breeds: Array.from(breeds).sort(),
    }));

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
    const formatParam = request.nextUrl.searchParams.get('format');
    const format: ScheduleFormat = (formatParam === 'compact' || formatParam === 'booklet') ? formatParam : 'standard';

    const pdfDocument = React.createElement(ShowSchedule, {
      show: showInfo,
      classes,
      judges,
      sponsors,
      format,
    });
    const buffer = await renderToBuffer(pdfDocument);
    const formatSuffix = format === 'compact' ? '-Compact' : format === 'booklet' ? '-Booklet' : '';
    const filename = `${sanitizeFilename(show.name)}-Schedule${formatSuffix}.pdf`;
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
