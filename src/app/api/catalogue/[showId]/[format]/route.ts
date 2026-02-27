import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/server/db';
import { and, eq, isNull, asc } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { formatDogName } from '@/lib/utils';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ showId: string; format: string }> }
) {
  const { showId, format } = await params;
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

  const entries = await db.query.entries.findMany({
    where: and(
      eq(schema.entries.showId, showId),
      format === 'absentees'
        ? eq(schema.entries.status, 'withdrawn')
        : eq(schema.entries.status, 'confirmed'),
      isNull(schema.entries.deletedAt)
    ),
    with: {
      dog: {
        with: {
          breed: { with: { group: true } },
          owners: { orderBy: [asc(schema.dogOwners.sortOrder)] },
          titles: true,
        },
      },
      exhibitor: true,
      entryClasses: {
        with: {
          showClass: { with: { classDefinition: true } },
        },
      },
    },
    orderBy: [asc(schema.entries.catalogueNumber)],
  });

  // For now, return JSON data (PDF generation with @react-pdf/renderer
  // requires client-side rendering or a separate worker for server-side).
  // The UI will render this data into a formatted view.

  const catalogueData = entries.map((entry) => ({
    catalogueNumber: entry.catalogueNumber,
    dogName: entry.dog ? formatDogName(entry.dog) : null,
    breed: entry.dog?.breed?.name,
    group: entry.dog?.breed?.group?.name,
    sex: entry.dog?.sex,
    dateOfBirth: entry.dog?.dateOfBirth,
    sire: entry.dog?.sireName,
    dam: entry.dog?.damName,
    breeder: entry.dog?.breederName,
    owners: entry.dog?.owners?.map((o) => ({
      name: o.ownerName,
      address: o.ownerAddress,
    })) ?? [],
    exhibitor: entry.exhibitor?.name,
    classes: entry.entryClasses.map((ec) => ({
      name: ec.showClass?.classDefinition?.name,
      sex: ec.showClass?.sex,
    })),
    status: entry.status,
    entryType: entry.entryType,
  }));

  return NextResponse.json({
    show: {
      name: show.name,
      date: show.startDate,
      venue: show.venue?.name,
      organisation: show.organisation?.name,
      kcLicenceNo: show.kcLicenceNo,
    },
    entries: catalogueData,
    format,
    generatedAt: new Date().toISOString(),
  });
}
