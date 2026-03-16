import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { and, eq, isNull, asc } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { sanitizeFilename } from '@/lib/slugify';
import { authenticatePdfRequest } from '@/lib/pdf-utils';

/**
 * Absentee Report API — generates a CSV of all entries marked absent.
 * Columns: Catalogue Number, Dog Name, Breed, Sex, Classes, Owner, Exhibitor
 * Sorted by catalogue number.
 *
 * GET /api/absentee-report/[showId]
 * Query params:
 *   ?format=csv (default) — CSV download
 *   ?format=json — JSON response
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
    with: { organisation: true },
  });

  if (!show) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }

  const authResult = await authenticatePdfRequest(show.organisationId);
  if (authResult instanceof NextResponse) return authResult;

  // Fetch all confirmed entries that are marked absent
  const entries = await db.query.entries.findMany({
    where: and(
      eq(schema.entries.showId, showId),
      eq(schema.entries.status, 'confirmed'),
      eq(schema.entries.absent, true),
      isNull(schema.entries.deletedAt)
    ),
    with: {
      dog: {
        with: {
          breed: true,
          owners: { orderBy: [asc(schema.dogOwners.sortOrder)] },
        },
      },
      exhibitor: true,
      entryClasses: {
        with: { showClass: { with: { classDefinition: true } } },
      },
    },
    orderBy: [asc(schema.entries.catalogueNumber)],
  });

  // Also include withdrawn entries (status = 'withdrawn') as absentees
  const withdrawnEntries = await db.query.entries.findMany({
    where: and(
      eq(schema.entries.showId, showId),
      eq(schema.entries.status, 'withdrawn'),
      isNull(schema.entries.deletedAt)
    ),
    with: {
      dog: {
        with: {
          breed: true,
          owners: { orderBy: [asc(schema.dogOwners.sortOrder)] },
        },
      },
      exhibitor: true,
      entryClasses: {
        with: { showClass: { with: { classDefinition: true } } },
      },
    },
    orderBy: [asc(schema.entries.catalogueNumber)],
  });

  const allAbsentees = [...entries, ...withdrawnEntries].sort((a, b) =>
    (a.catalogueNumber ?? '').localeCompare(b.catalogueNumber ?? '', undefined, { numeric: true })
  );

  const outputFormat = request.nextUrl.searchParams.get('format') ?? 'csv';

  const rows = allAbsentees.map((entry) => ({
    catalogueNumber: entry.catalogueNumber ?? '',
    dogName: entry.dog?.registeredName ?? 'Junior Handler',
    breed: entry.dog?.breed?.name ?? '',
    sex: entry.dog?.sex === 'dog' ? 'Dog' : entry.dog?.sex === 'bitch' ? 'Bitch' : '',
    classes: entry.entryClasses
      .map((ec) => {
        const num = ec.showClass?.classNumber;
        const name = ec.showClass?.classDefinition?.name ?? '';
        return num != null ? `${num}. ${name}` : name;
      })
      .filter(Boolean)
      .join('; '),
    owner: entry.dog?.owners?.map((o) => o.ownerName).join(' & ') ?? '',
    exhibitor: entry.exhibitor?.name ?? '',
    status: entry.status === 'withdrawn' ? 'Withdrawn' : 'Absent',
  }));

  if (outputFormat === 'json') {
    return NextResponse.json({
      show: { id: show.id, name: show.name },
      totalAbsentees: rows.length,
      absentees: rows,
      generatedAt: new Date().toISOString(),
    });
  }

  // Generate CSV
  const headers = [
    'Catalogue No',
    'Dog Name',
    'Breed',
    'Sex',
    'Classes',
    'Owner',
    'Exhibitor',
    'Status',
  ];

  const csvRows = rows.map((row) =>
    [
      row.catalogueNumber,
      csvEscape(row.dogName),
      csvEscape(row.breed),
      row.sex,
      csvEscape(row.classes),
      csvEscape(row.owner),
      csvEscape(row.exhibitor),
      row.status,
    ].join(',')
  );

  const csv = [headers.join(','), ...csvRows].join('\r\n');

  const filename = `${sanitizeFilename(show.name)}-Absentee-Report.csv`;
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-cache',
    },
  });
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
