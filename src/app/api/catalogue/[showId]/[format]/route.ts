import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { and, eq, isNull, asc, or } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { formatDogName, formatDogNameForCatalogue } from '@/lib/utils';
import { renderToBuffer } from '@react-pdf/renderer';
import { CatalogueStandard } from '@/components/catalogue/catalogue-standard';
import { CatalogueAbsentees } from '@/components/catalogue/catalogue-absentees';
import { CatalogueByClass } from '@/components/catalogue/catalogue-by-class';
import { CatalogueByBreed } from '@/components/catalogue/catalogue-by-breed';
import { CatalogueAlphabetical } from '@/components/catalogue/catalogue-alphabetical';
import { CatalogueMarked } from '@/components/catalogue/catalogue-marked';
import { CatalogueJudging } from '@/components/catalogue/catalogue-judging';
import type { CatalogueEntry, CatalogueShowInfo, ShowSponsorInfo, ShowClassInfo } from '@/components/catalogue/catalogue-standard';
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

  if (!['standard', 'absentees', 'by-class', 'alphabetical', 'judging', 'marked'].includes(format)) {
    return NextResponse.json({ error: 'Invalid format. Use "standard", "by-class", "alphabetical", "judging", "absentees", or "marked".' }, { status: 400 });
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
  const [judgeAssignmentRows, showClassRows, entries, safeLogoUrl, showSponsorRows] = await Promise.all([
    db.query.judgeAssignments.findMany({
      where: eq(schema.judgeAssignments.showId, showId),
      with: { judge: true, breed: true, ring: true },
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
          ? or(
              eq(schema.entries.status, 'withdrawn'),
              and(eq(schema.entries.status, 'confirmed'), eq(schema.entries.absent, true))
            )
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
    db.query.showSponsors.findMany({
      where: eq(schema.showSponsors.showId, showId),
      with: { sponsor: true },
      orderBy: [asc(schema.showSponsors.displayOrder)],
    }),
  ]);

  const judgesByBreedName: Record<string, string> = {};
  const judgeBios: Record<string, string> = {};
  const judgePhotos: Record<string, string> = {};
  const judgeRingNumbers: Record<string, string> = {};
  for (const ja of judgeAssignmentRows) {
    if (ja.breed?.name && ja.judge?.name) {
      judgesByBreedName[ja.breed.name] = ja.judge.name;
      // Collect judge bios and photos (keyed by judge name for dedup)
      if (ja.judge.bio && !judgeBios[ja.judge.name]) {
        judgeBios[ja.judge.name] = ja.judge.bio;
      }
      if (ja.judge.photoUrl && !judgePhotos[ja.judge.name]) {
        judgePhotos[ja.judge.name] = ja.judge.photoUrl;
      }
      // Ring number per breed
      if (ja.ring?.number) {
        judgeRingNumbers[ja.breed.name] = String(ja.ring.number);
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

  // Build show-level sponsor info for cover/front matter
  const showSponsorInfos: ShowSponsorInfo[] = showSponsorRows.map((ss) => ({
    name: ss.sponsor.name,
    tier: ss.tier,
    logoUrl: ss.sponsor.logoUrl,
    website: ss.sponsor.website,
    customTitle: ss.customTitle,
  }));

  // Build all show classes list for rendering empty classes
  const allShowClasses: ShowClassInfo[] = showClassRows.map((sc) => ({
    className: sc.classDefinition?.name ?? 'Unknown Class',
    classNumber: sc.classNumber,
    sortOrder: sc.sortOrder,
    sex: sc.sex,
  }));

  const scheduleData = show.scheduleData as Record<string, unknown> | null;

  const showInfo: CatalogueShowInfo = {
    name: show.name,
    showType: show.showType,
    date: show.startDate,
    endDate: show.endDate !== show.startDate ? show.endDate : undefined,
    venue: show.venue?.name,
    venueAddress: show.venue?.address ?? undefined,
    organisation: show.organisation?.name,
    kcLicenceNo: show.kcLicenceNo,
    startTime: show.startTime,
    logoUrl: safeLogoUrl ?? undefined,
    secretaryName: show.secretaryName ?? undefined,
    secretaryEmail: show.secretaryEmail ?? undefined,
    secretaryPhone: show.secretaryPhone ?? undefined,
    onCallVet: show.onCallVet ?? undefined,
    wetWeatherAccommodation: scheduleData?.wetWeatherAccommodation === true ? true : scheduleData?.wetWeatherAccommodation === false ? false : undefined,
    judgedOnGroupSystem: scheduleData?.judgedOnGroupSystem === true ? true : undefined,
    judgesByBreedName,
    judgeBios: Object.keys(judgeBios).length > 0 ? judgeBios : undefined,
    judgePhotos: Object.keys(judgePhotos).length > 0 ? judgePhotos : undefined,
    judgeRingNumbers: Object.keys(judgeRingNumbers).length > 0 ? judgeRingNumbers : undefined,
    classDefinitions,
    showScope: show.showScope ?? undefined,
    classSponsorships: classSponsorships.length > 0 ? classSponsorships : undefined,
    // When sponsorships are shown inline with classes, skip the separate trophies page
    skipTrophiesPage: classSponsorships.length > 0,
    customStatements: (scheduleData?.customStatements as string[] | undefined),
    showSponsors: showSponsorInfos.length > 0 ? showSponsorInfos : undefined,
    allShowClasses: allShowClasses.length > 0 ? allShowClasses : undefined,
    welcomeNote: scheduleData?.welcomeNote as string | undefined,
    outsideAttraction: scheduleData?.outsideAttraction === true ? true : undefined,
    showManager: scheduleData?.showManager as string | undefined,
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
        judging: CatalogueJudging,
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
      judging: 'Judging-Catalogue',
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
