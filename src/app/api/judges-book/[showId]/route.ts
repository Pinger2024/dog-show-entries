import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { auth } from '@/lib/auth';
import { db } from '@/server/db';
import { and, eq, isNull, asc } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { renderToBuffer } from '@react-pdf/renderer';
import { JudgesBook } from '@/components/judges-book/judges-book';
import React from 'react';
import { sanitizeFilename } from '@/lib/slugify';

export type JudgesBookClass = {
  classNumber: number | null;
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
};

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
    with: { organisation: true },
  });

  if (!show) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }

  // Verify user belongs to this show's organisation
  // Admins bypass membership check (needed for impersonation)
  const session = await auth();
  const isAdmin = session?.user?.role === 'admin';

  if (!isAdmin) {
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
  }

  // Fetch show classes ordered by sort order
  const showClasses = await db.query.showClasses.findMany({
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
  });

  // Fetch judge assignments
  const judgeAssignments = await db.query.judgeAssignments.findMany({
    where: eq(schema.judgeAssignments.showId, showId),
    with: { judge: true, breed: true, ring: true },
  });

  // Build breed→judge and breed→ring lookups
  const judgeByBreed = new Map<string | null, string>();
  const ringByBreed = new Map<string | null, number>();
  for (const ja of judgeAssignments) {
    const breedKey = ja.breedId;
    if (ja.judge?.name) judgeByBreed.set(breedKey, ja.judge.name);
    if (ja.ring?.number != null) ringByBreed.set(breedKey, ja.ring.number);
  }

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
      classNumber: sc.classNumber,
      className: sc.classDefinition?.name ?? 'Unknown Class',
      sex: sc.sex,
      breedName: sc.breed?.name ?? null,
      judgeName,
      ringNumber,
      exhibits,
    };
  });

  const showInfo: JudgesBookShowInfo = {
    name: show.name,
    showType: show.showType,
    date: show.startDate,
    organisation: show.organisation?.name ?? null,
  };

  try {
    const pdfDocument = React.createElement(JudgesBook, { show: showInfo, classes });
    const buffer = await renderToBuffer(pdfDocument);
    const filename = `${sanitizeFilename(show.name)}-Judges-Book.pdf`;

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    console.error('Judge\'s book PDF generation failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'PDF generation failed', detail: message },
      { status: 500 }
    );
  }
}
