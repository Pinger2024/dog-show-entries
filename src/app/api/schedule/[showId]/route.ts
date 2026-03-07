import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/server/db';
import { and, eq, asc } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { renderToBuffer } from '@react-pdf/renderer';
import { ShowSchedule } from '@/components/schedule/show-schedule';
import type {
  ScheduleShowInfo,
  ScheduleClass,
  ScheduleJudge,
} from '@/components/schedule/show-schedule';
import React from 'react';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ showId: string }> }
) {
  const { showId } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

  const membership = await db.query.memberships.findFirst({
    where: and(
      eq(schema.memberships.userId, session.user.id),
      eq(schema.memberships.organisationId, show.organisationId),
      eq(schema.memberships.status, 'active')
    ),
  });

  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch show classes
  const showClasses = await db.query.showClasses.findMany({
    where: eq(schema.showClasses.showId, showId),
    with: {
      classDefinition: true,
      breed: true,
    },
    orderBy: [asc(schema.showClasses.sortOrder), asc(schema.showClasses.classNumber)],
  });

  // Fetch judge assignments
  const judgeAssignments = await db.query.judgeAssignments.findMany({
    where: eq(schema.judgeAssignments.showId, showId),
    with: { judge: true, breed: true },
  });

  // Build classes data
  const classes: ScheduleClass[] = showClasses.map((sc) => ({
    classNumber: sc.classNumber,
    className: sc.classDefinition?.name ?? 'Unknown Class',
    classDescription: sc.classDefinition?.description ?? null,
    sex: sc.sex,
    breedName: sc.breed?.name ?? null,
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

  const showInfo: ScheduleShowInfo = {
    name: show.name,
    showType: show.showType,
    showScope: show.showScope,
    date: show.startDate,
    endDate: show.endDate,
    startTime: show.startTime,
    entriesOpenDate: show.entriesOpenDate?.toISOString() ?? null,
    entryCloseDate: show.entryCloseDate?.toISOString() ?? null,
    postalCloseDate: show.postalCloseDate?.toISOString() ?? null,
    kcLicenceNo: show.kcLicenceNo,
    secretaryEmail: show.secretaryEmail,
    description: show.description,
    firstEntryFee: show.firstEntryFee,
    subsequentEntryFee: show.subsequentEntryFee,
    nfcEntryFee: show.nfcEntryFee,
    organisation: show.organisation
      ? {
          name: show.organisation.name,
          contactEmail: show.organisation.contactEmail,
          contactPhone: show.organisation.contactPhone,
          website: show.organisation.website,
          logoUrl: show.organisation.logoUrl,
        }
      : null,
    venue: show.venue
      ? {
          name: show.venue.name,
          address: show.venue.address,
          postcode: show.venue.postcode,
        }
      : null,
  };

  try {
    const pdfDocument = React.createElement(ShowSchedule, {
      show: showInfo,
      classes,
      judges,
    });
    const buffer = await renderToBuffer(pdfDocument);
    const filename = `${show.name.replace(/[^a-zA-Z0-9]/g, '-')}-Schedule.pdf`;

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    console.error('Schedule PDF generation failed:', err);
    return NextResponse.json(
      { error: 'PDF generation failed' },
      { status: 500 }
    );
  }
}
