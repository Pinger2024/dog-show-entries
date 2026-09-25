import { NextRequest, NextResponse } from 'next/server';
import { publicOrgColumns } from '@/server/trpc/public-org-columns';
import { db } from '@/server/db';
import { eq } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { sanitizeFilename } from '@/lib/slugify';
import { authenticatePdfRequest } from '@/lib/pdf-utils';
import { loadAbsenteeLikeEntries, confirmedAbsentNonJhWhere } from '@/server/services/report-queries';
import { buildAbsenteeRow } from '@/lib/report-rows';

/**
 * Absentee Report API — generates a CSV of dogs that were entered but absent
 * on the day (confirmed entries with absent=true). Withdrawn entries are NOT
 * absentees (they pulled out before the show) and Junior Handling entries are
 * excluded — this report is dogs only (Mandy 2026-07-06).
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
    with: { organisation: { columns: publicOrgColumns } },
  });

  if (!show) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }

  const authResult = await authenticatePdfRequest(show.organisationId);
  if (authResult instanceof NextResponse) return authResult;

  // Dogs that were entered but absent on the day: confirmed + absent, excluding
  // Junior Handling entries (they carry no dog and aren't a dog absence for the
  // report). Withdrawn entries are deliberately NOT included — a withdrawal
  // isn't an absence (Mandy 2026-07-06). Shared with this report's .xlsx twin
  // via report-queries.ts / report-rows.ts so the two can't disagree.
  const allAbsentees = await loadAbsenteeLikeEntries(db, confirmedAbsentNonJhWhere(showId));

  const outputFormat = request.nextUrl.searchParams.get('format') ?? 'csv';

  const rows = allAbsentees.map(buildAbsenteeRow);

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
