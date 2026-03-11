import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { db } from '@/server/db';
import { and, eq, isNull, asc } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { formatDogName, formatDogNameForCatalogue } from '@/lib/utils';
import { renderToBuffer } from '@react-pdf/renderer';
import { CatalogueStandard } from '@/components/catalogue/catalogue-standard';
import { CatalogueAbsentees } from '@/components/catalogue/catalogue-absentees';
import { CatalogueByClass } from '@/components/catalogue/catalogue-by-class';
import { CatalogueByBreed } from '@/components/catalogue/catalogue-by-breed';
import { CatalogueAlphabetical } from '@/components/catalogue/catalogue-alphabetical';
import type { CatalogueEntry, CatalogueShowInfo } from '@/components/catalogue/catalogue-standard';
import React from 'react';
import { sanitizeFilename } from '@/lib/slugify';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ showId: string; format: string }> }
) {
  const { showId, format } = await params;
  const user = await getCurrentUser();

  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!db) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 });
  }

  if (!['standard', 'absentees', 'by-class', 'alphabetical'].includes(format)) {
    return NextResponse.json({ error: 'Invalid format. Use "standard", "by-class", "alphabetical", or "absentees".' }, { status: 400 });
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
      eq(schema.memberships.userId, user.id),
      eq(schema.memberships.organisationId, show.organisationId),
      eq(schema.memberships.status, 'active')
    ),
  });

  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Query judge assignments for this show (breed → judge name lookup)
  const judgeAssignmentRows = await db.query.judgeAssignments.findMany({
    where: eq(schema.judgeAssignments.showId, showId),
    with: {
      judge: true,
      breed: true,
    },
  });

  const judgesByBreedName: Record<string, string> = {};
  for (const ja of judgeAssignmentRows) {
    if (ja.breed?.name && ja.judge?.name) {
      judgesByBreedName[ja.breed.name] = ja.judge.name;
    }
  }

  // Query show classes with class definitions for front matter
  const showClassRows = await db.query.showClasses.findMany({
    where: eq(schema.showClasses.showId, showId),
    with: { classDefinition: true },
    orderBy: [asc(schema.showClasses.sortOrder), asc(schema.showClasses.classNumber)],
  });

  // Deduplicate class definitions for front matter
  const seenDefIds = new Set<string>();
  const classDefinitions: { name: string; description: string | null }[] = [];
  for (const sc of showClassRows) {
    if (sc.classDefinition && !seenDefIds.has(sc.classDefinition.id)) {
      seenDefIds.add(sc.classDefinition.id);
      classDefinitions.push({
        name: sc.classDefinition.name,
        description: sc.classDefinition.description,
      });
    }
  }

  // Build show class lookup for catalogue (classNumber → name, sex, etc.)
  const showClassLookup: Record<string, {
    classNumber: number | null;
    className: string | undefined;
    sex: string | null;
    sortOrder: number;
    breedId: string | null;
  }> = {};
  for (const sc of showClassRows) {
    showClassLookup[sc.id] = {
      classNumber: sc.classNumber,
      className: sc.classDefinition?.name,
      sex: sc.sex,
      sortOrder: sc.sortOrder,
      breedId: sc.breedId,
    };
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
      handler: true,
      entryClasses: {
        with: {
          showClass: { with: { classDefinition: true } },
        },
      },
    },
    orderBy: [asc(schema.entries.catalogueNumber)],
  });

  // Use RKC catalogue formatting for standard and by-breed formats
  const useKCFormat = format === 'standard' || (format === 'by-class' && show.showScope !== 'single_breed');

  const catalogueEntries: CatalogueEntry[] = entries.map((entry) => ({
    catalogueNumber: entry.catalogueNumber,
    dogName: entry.dog
      ? (useKCFormat ? formatDogNameForCatalogue(entry.dog) : formatDogName(entry.dog))
      : null,
    breed: entry.dog?.breed?.name,
    breedId: entry.dog?.breed?.id,
    group: entry.dog?.breed?.group?.name,
    groupSortOrder: entry.dog?.breed?.group?.sortOrder,
    sex: entry.dog?.sex,
    dateOfBirth: entry.dog?.dateOfBirth,
    kcRegNumber: entry.dog?.kcRegNumber,
    colour: entry.dog?.colour,
    sire: entry.dog?.sireName,
    dam: entry.dog?.damName,
    breeder: entry.dog?.breederName,
    owners: entry.dog?.owners?.map((o) => ({
      name: o.ownerName,
      address: o.ownerAddress,
    })) ?? [],
    handler: entry.handler?.name,
    exhibitor: entry.exhibitor?.name,
    classes: entry.entryClasses.map((ec) => ({
      name: ec.showClass?.classDefinition?.name,
      sex: ec.showClass?.sex,
      classNumber: ec.showClass?.classNumber,
      sortOrder: ec.showClass?.sortOrder,
    })),
    status: entry.status,
    entryType: entry.entryType,
  }));

  const showInfo: CatalogueShowInfo = {
    name: show.name,
    showType: show.showType,
    date: show.startDate,
    venue: show.venue?.name,
    venueAddress: show.venue?.address ?? undefined,
    organisation: show.organisation?.name,
    kcLicenceNo: show.kcLicenceNo,
    logoUrl: show.organisation?.logoUrl ?? undefined,
    secretaryEmail: show.secretaryEmail ?? undefined,
    judgesByBreedName,
    classDefinitions,
    showScope: show.showScope ?? undefined,
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
    // For all-breed shows, the "by-class" format uses the Crufts-style breed-grouped layout
    const isAllBreed = show.showScope !== 'single_breed';
    const formatComponents = {
      standard: CatalogueStandard,
      'by-class': isAllBreed ? CatalogueByBreed : CatalogueByClass,
      alphabetical: CatalogueAlphabetical,
      absentees: CatalogueAbsentees,
    } as const;

    const Component = formatComponents[format as keyof typeof formatComponents];
    const pdfDocument = React.createElement(Component, { show: showInfo, entries: catalogueEntries });

    const buffer = await renderToBuffer(pdfDocument);

    const formatLabels: Record<string, string> = {
      standard: 'Catalogue',
      'by-class': isAllBreed ? 'Catalogue-By-Breed' : 'Catalogue-By-Class',
      alphabetical: 'Catalogue-Alphabetical',
      absentees: 'Absentees',
    };
    const filename = `${sanitizeFilename(show.name)}-${formatLabels[format] ?? 'Catalogue'}.pdf`;

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
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
