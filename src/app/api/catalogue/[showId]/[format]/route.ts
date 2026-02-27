import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/server/db';
import { and, eq, isNull, asc } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { formatDogName } from '@/lib/utils';
import { renderToBuffer } from '@react-pdf/renderer';
import { CatalogueStandard } from '@/components/catalogue/catalogue-standard';
import { CatalogueAbsentees } from '@/components/catalogue/catalogue-absentees';
import type { CatalogueEntry, CatalogueShowInfo } from '@/components/catalogue/catalogue-standard';
import React from 'react';

export async function GET(
  request: NextRequest,
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

  if (!['standard', 'absentees'].includes(format)) {
    return NextResponse.json({ error: 'Invalid format. Use "standard" or "absentees".' }, { status: 400 });
  }

  const show = await db.query.shows.findFirst({
    where: eq(schema.shows.id, showId),
    with: { organisation: true, venue: true },
  });

  if (!show) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }

  // Verify user belongs to this show's organisation
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

  const catalogueEntries: CatalogueEntry[] = entries.map((entry) => ({
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

  const showInfo: CatalogueShowInfo = {
    name: show.name,
    date: show.startDate,
    venue: show.venue?.name,
    organisation: show.organisation?.name,
    kcLicenceNo: show.kcLicenceNo,
    logoUrl: show.organisation?.logoUrl ?? undefined,
  };

  // Check if JSON format was explicitly requested (for data export)
  const wantsJson = request.nextUrl.searchParams.get('output') === 'json';
  if (wantsJson) {
    return NextResponse.json({
      show: showInfo,
      entries: catalogueEntries,
      format,
      generatedAt: new Date().toISOString(),
    });
  }

  // Render PDF
  try {
    const pdfDocument =
      format === 'absentees'
        ? React.createElement(CatalogueAbsentees, { show: showInfo, entries: catalogueEntries })
        : React.createElement(CatalogueStandard, { show: showInfo, entries: catalogueEntries });

    const buffer = await renderToBuffer(pdfDocument);

    const filename =
      format === 'absentees'
        ? `${show.name.replace(/[^a-zA-Z0-9]/g, '-')}-Absentees.pdf`
        : `${show.name.replace(/[^a-zA-Z0-9]/g, '-')}-Catalogue.pdf`;

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    console.error('PDF generation failed:', err);
    return NextResponse.json(
      { error: 'PDF generation failed. Try ?output=json for raw data.' },
      { status: 500 }
    );
  }
}
