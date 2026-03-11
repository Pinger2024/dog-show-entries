import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { db } from '@/server/db';
import { and, eq, asc, isNull } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { renderToBuffer } from '@react-pdf/renderer';
import { RingBoard } from '@/components/ring-board/ring-board';
import type { RingBoardShowInfo, RingBoardRing } from '@/components/ring-board/ring-board';
import React from 'react';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ showId: string }> }
) {
  const { showId } = await params;
  const user = await getCurrentUser();

  if (!user?.id) {
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
      eq(schema.memberships.userId, user.id),
      eq(schema.memberships.organisationId, show.organisationId),
      eq(schema.memberships.status, 'active')
    ),
  });

  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch rings for this show
  const showRings = await db.query.rings.findMany({
    where: eq(schema.rings.showId, showId),
    orderBy: [asc(schema.rings.number)],
  });

  // Fetch judge assignments with breed and judge details
  const judgeAssignments = await db.query.judgeAssignments.findMany({
    where: eq(schema.judgeAssignments.showId, showId),
    with: { judge: true, breed: true, ring: true },
  });

  // Fetch show classes with entry counts
  const showClasses = await db.query.showClasses.findMany({
    where: eq(schema.showClasses.showId, showId),
    with: {
      classDefinition: true,
      breed: true,
      entryClasses: {
        with: {
          entry: true,
        },
      },
    },
    orderBy: [asc(schema.showClasses.sortOrder), asc(schema.showClasses.classNumber)],
  });

  // Build breed→ring and breed→judge maps
  const ringByBreed = new Map<string | null, number>();
  const judgeByRing = new Map<number, string>();

  for (const ja of judgeAssignments) {
    if (ja.ring?.number != null) {
      ringByBreed.set(ja.breedId, ja.ring.number);
      if (ja.judge?.name) {
        judgeByRing.set(ja.ring.number, ja.judge.name);
      }
    }
  }

  // Group classes by ring number
  const ringGroups = new Map<number, Map<string, {
    breedName: string | null;
    classes: { classNumber: number | null; className: string; sex: string | null; entryCount: number }[];
    totalEntries: number;
  }>>();

  // Initialize rings
  for (const ring of showRings) {
    ringGroups.set(ring.number, new Map());
  }

  for (const sc of showClasses) {
    const ringNumber = ringByBreed.get(sc.breedId) ?? ringByBreed.get(null);
    if (ringNumber == null) continue;

    if (!ringGroups.has(ringNumber)) {
      ringGroups.set(ringNumber, new Map());
    }

    const breedKey = sc.breed?.name ?? '__unspecified__';
    const breedGroup = ringGroups.get(ringNumber)!;

    if (!breedGroup.has(breedKey)) {
      breedGroup.set(breedKey, {
        breedName: sc.breed?.name ?? null,
        classes: [],
        totalEntries: 0,
      });
    }

    const confirmedEntries = sc.entryClasses.filter(
      (ec) => ec.entry && ec.entry.status === 'confirmed' && !ec.entry.deletedAt
    ).length;

    breedGroup.get(breedKey)!.classes.push({
      classNumber: sc.classNumber,
      className: sc.classDefinition?.name ?? 'Unknown',
      sex: sc.sex,
      entryCount: confirmedEntries,
    });
    breedGroup.get(breedKey)!.totalEntries += confirmedEntries;
  }

  const rings: RingBoardRing[] = Array.from(ringGroups.entries())
    .sort(([a], [b]) => a - b)
    .map(([ringNumber, breedMap]) => ({
      ringNumber,
      judgeName: judgeByRing.get(ringNumber) ?? null,
      breeds: Array.from(breedMap.values()),
    }));

  const showInfo: RingBoardShowInfo = {
    name: show.name,
    showType: show.showType,
    date: show.startDate,
    organisation: show.organisation?.name ?? null,
    venue: show.venue?.name ?? null,
  };

  try {
    const pdfDocument = React.createElement(RingBoard, { show: showInfo, rings });
    const buffer = await renderToBuffer(pdfDocument);
    const filename = `${show.name.replace(/[^a-zA-Z0-9]/g, '-')}-Ring-Plan.pdf`;

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    console.error('Ring board PDF generation failed:', err);
    return NextResponse.json(
      { error: 'PDF generation failed' },
      { status: 500 }
    );
  }
}
