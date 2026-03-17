import { NextRequest, NextResponse } from 'next/server';
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
import { CatalogueMarked } from '@/components/catalogue/catalogue-marked';
import type { CatalogueEntry, CatalogueShowInfo } from '@/components/catalogue/catalogue-standard';
import type { MarkedResult, MarkedAchievement } from '@/components/catalogue/catalogue-marked';
import React from 'react';
import { sanitizeFilename } from '@/lib/slugify';
import { authenticatePdfRequest, validateRasterLogoUrl, makePdfResponse } from '@/lib/pdf-utils';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ showId: string; format: string }> }
) {
  const { showId, format } = await params;

  if (!db) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 });
  }

  if (!['standard', 'absentees', 'by-class', 'alphabetical', 'marked'].includes(format)) {
    return NextResponse.json({ error: 'Invalid format. Use "standard", "by-class", "alphabetical", "absentees", or "marked".' }, { status: 400 });
  }

  const show = await db.query.shows.findFirst({
    where: eq(schema.shows.id, showId),
    with: { organisation: true, venue: true },
  });

  if (!show) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }

  const authResult = await authenticatePdfRequest(show.organisationId);
  if (authResult instanceof NextResponse) return authResult;

  // Run independent DB queries and logo validation in parallel
  const [judgeAssignmentRows, showClassRows, entries, safeLogoUrl] = await Promise.all([
    db.query.judgeAssignments.findMany({
      where: eq(schema.judgeAssignments.showId, showId),
      with: { judge: true, breed: true },
    }),
    db.query.showClasses.findMany({
      where: eq(schema.showClasses.showId, showId),
      with: {
        classDefinition: true,
        classSponsorships: {
          with: { showSponsor: { with: { sponsor: true } } },
        },
      },
      orderBy: [asc(schema.showClasses.sortOrder), asc(schema.showClasses.classNumber)],
    }),
    db.query.entries.findMany({
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
            ...(format === 'marked' ? { result: true } : {}),
          },
        },
      },
      orderBy: [asc(schema.entries.catalogueNumber)],
    }),
    validateRasterLogoUrl(show.organisation?.logoUrl),
  ]);

  const judgesByBreedName: Record<string, string> = {};
  const judgeBios: Record<string, string> = {};
  for (const ja of judgeAssignmentRows) {
    if (ja.breed?.name && ja.judge?.name) {
      judgesByBreedName[ja.breed.name] = ja.judge.name;
      // Collect judge bios (keyed by judge name for dedup)
      if (ja.judge.bio && !judgeBios[ja.judge.name]) {
        judgeBios[ja.judge.name] = ja.judge.bio;
      }
    }
  }

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

  // Collect class sponsorship data for trophies page + inline display
  const classSponsorships: { className: string; classNumber: number | null; trophyName: string | null; trophyDonor: string | null; sponsorName: string | null; sponsorAffix: string | null; prizeDescription: string | null }[] = [];
  for (const sc of showClassRows) {
    for (const cs of sc.classSponsorships ?? []) {
      // Sponsor name comes from either the free-text field or the linked sponsor
      const sponsorName = cs.sponsorName ?? cs.showSponsor?.sponsor?.name ?? null;
      if (cs.trophyName || sponsorName || cs.prizeDescription) {
        classSponsorships.push({
          className: sc.classDefinition?.name ?? 'Unknown Class',
          classNumber: sc.classNumber,
          trophyName: cs.trophyName,
          trophyDonor: cs.trophyDonor,
          sponsorName,
          sponsorAffix: cs.sponsorAffix ?? null,
          prizeDescription: cs.prizeDescription,
        });
      }
    }
  }

  // Use RKC catalogue formatting for standard and by-breed formats
  const useKCFormat = format === 'standard' || format === 'marked' || (format === 'by-class' && show.showScope !== 'single_breed');

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
      userId: o.userId,
    })) ?? [],
    exhibitorId: entry.exhibitorId,
    handler: entry.handler?.name,
    exhibitor: entry.exhibitor?.name,
    classes: entry.entryClasses.map((ec) => ({
      name: ec.showClass?.classDefinition?.name,
      sex: ec.showClass?.sex,
      classNumber: ec.showClass?.classNumber,
      sortOrder: ec.showClass?.sortOrder,
      showClassId: ec.showClassId,
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
    logoUrl: safeLogoUrl ?? undefined,
    secretaryEmail: show.secretaryEmail ?? undefined,
    judgesByBreedName,
    judgeBios: Object.keys(judgeBios).length > 0 ? judgeBios : undefined,
    classDefinitions,
    showScope: show.showScope ?? undefined,
    classSponsorships: classSponsorships.length > 0 ? classSponsorships : undefined,
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
    let pdfDocument: React.ReactElement;

    if (format === 'marked') {
      // Build results map and absentees set for the marked catalogue
      const resultsMap = new Map<string, MarkedResult>();
      const absenteesSet = new Set<string>();

      for (const entry of entries) {
        // Mark absent entries
        if (entry.absent && entry.catalogueNumber) {
          absenteesSet.add(entry.catalogueNumber);
        }

        // Collect results from entry classes
        for (const ec of entry.entryClasses) {
          const result = (ec as { result?: { placement: number | null; specialAward: string | null } | null }).result;
          if (result && entry.catalogueNumber) {
            const key = `${entry.catalogueNumber}-${ec.showClassId}`;
            resultsMap.set(key, {
              catalogueNumber: entry.catalogueNumber,
              showClassId: ec.showClassId,
              placement: result.placement,
              specialAward: result.specialAward,
            });
          }
        }
      }

      // Fetch achievements for the awards summary
      const achievementRows = await db.query.achievements.findMany({
        where: eq(schema.achievements.showId, showId),
        with: {
          dog: {
            with: { breed: true },
          },
        },
      });

      const markedAchievements: MarkedAchievement[] = achievementRows.map((a) => ({
        type: a.type,
        dogName: a.dog?.registeredName ?? 'Unknown',
        breedName: a.dog?.breed?.name ?? null,
      }));

      pdfDocument = React.createElement(CatalogueMarked, {
        show: showInfo,
        entries: catalogueEntries,
        results: resultsMap,
        absentees: absenteesSet,
        achievements: markedAchievements,
      });
    } else {
      const formatComponents = {
        standard: CatalogueStandard,
        'by-class': isAllBreed ? CatalogueByBreed : CatalogueByClass,
        alphabetical: CatalogueAlphabetical,
        absentees: CatalogueAbsentees,
      } as const;

      const Component = formatComponents[format as keyof typeof formatComponents];
      pdfDocument = React.createElement(Component, { show: showInfo, entries: catalogueEntries });
    }

    const buffer = await renderToBuffer(pdfDocument);

    const formatLabels: Record<string, string> = {
      standard: 'Catalogue',
      'by-class': isAllBreed ? 'Catalogue-By-Breed' : 'Catalogue-By-Class',
      alphabetical: 'Catalogue-Alphabetical',
      absentees: 'Absentees',
      marked: 'Marked-Catalogue',
    };
    const filename = `${sanitizeFilename(show.name)}-${formatLabels[format] ?? 'Catalogue'}.pdf`;
    const isPreview = request.nextUrl.searchParams.has('preview');
    return makePdfResponse(buffer, filename, isPreview);
  } catch (err) {
    console.error('PDF generation failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'PDF generation failed', detail: message },
      { status: 500 }
    );
  }
}
