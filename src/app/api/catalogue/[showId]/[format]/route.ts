import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { and, eq, isNull, asc, or, inArray, sql } from 'drizzle-orm';
import { getPaidOrderIdsForShow } from '@/server/services/show-metrics';
import * as schema from '@/server/db/schema';
import { formatDogName, formatDogNameForCatalogue } from '@/lib/utils';
import { renderToBuffer } from '@react-pdf/renderer';
import { CatalogueAbsentees } from '@/components/catalogue/catalogue-absentees';
import { CatalogueByClass } from '@/components/catalogue/catalogue-by-class';
import { CatalogueByBreed } from '@/components/catalogue/catalogue-by-breed';
import { CatalogueMarked } from '@/components/catalogue/catalogue-marked';
import { CatalogueJudging } from '@/components/catalogue/catalogue-judging';
import { CatalogueRingside } from '@/components/catalogue/catalogue-ringside';
import type { CatalogueEntry, CatalogueShowInfo, ShowSponsorInfo, ShowClassInfo } from '@/components/catalogue/catalogue-types';
import type { MarkedResult, MarkedAchievement } from '@/components/catalogue/catalogue-marked';
import React from 'react';
import { sanitizeFilename } from '@/lib/slugify';
import { authenticatePdfRequest, validateRasterLogoUrl, makePdfResponse } from '@/lib/pdf-utils';
import { padPdfToMultiple } from '@/lib/pdf-pad';
import { ensureCatalogueNumbers } from '@/server/services/catalogue-numbering';
import { getDockingStatementFromScheduleData } from '@/lib/rkc-compliance';
import { buildClassLabelMap } from '@/lib/class-labels';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ showId: string; format: string }> }
) {
  const { showId, format } = await params;

  if (!db) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 });
  }

  if (!['standard', 'absentees', 'by-class', 'judging', 'marked'].includes(format)) {
    return NextResponse.json({ error: 'Invalid format. Use "standard", "by-class", "judging", "absentees", or "marked".' }, { status: 400 });
  }

  const show = await db.query.shows.findFirst({
    where: eq(schema.shows.id, showId),
    with: { organisation: true, venue: true },
  });

  if (!show) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }

  const authResult = await authenticatePdfRequest(show.organisationId, { showId, format });
  if (authResult instanceof NextResponse) return authResult;

  // Auto-assign catalogue numbers in class order if the show doesn't
  // have any yet. Amanda's UX ask 2026-04-17: she shouldn't have to
  // find a button — opening a catalogue should just give you numbered
  // entries. No-op when numbers already exist.
  await ensureCatalogueNumbers(db, showId);

  // For the absentees format, materialise the paid-order IDs first so the
  // entries query can filter on a plain array — embedding a Drizzle select
  // subquery inside the relational findMany builder generates a type graph
  // that makes Turbopack's dev-mode type resolver grind on every request.
  const paidOrderIds =
    format === 'absentees' ? await getPaidOrderIdsForShow(db, showId) : null;

  // Run independent DB queries and logo validation in parallel.
  // The marked-catalogue achievements query only runs when it's needed; for
  // every other format it short-circuits to an empty array so the Promise.all
  // still resolves cleanly.
  const [judgeAssignmentRows, showClassRows, entries, safeLogoUrl, showSponsorRows, achievementRows] = await Promise.all([
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
          orderBy: [asc(schema.classSponsorships.createdAt)],
        },
      },
      orderBy: [asc(schema.showClasses.sortOrder), asc(schema.showClasses.classNumber)],
    }),
    db.query.entries.findMany({
      where: and(
        eq(schema.entries.showId, showId),
        format === 'absentees'
          ? paidOrderIds && paidOrderIds.length > 0
            ? and(
                // Absentees only exist on paid orders. Withdrawn entries from
                // abandoned checkouts never made the catalogue.
                inArray(schema.entries.orderId, paidOrderIds),
                or(
                  eq(schema.entries.status, 'withdrawn'),
                  and(eq(schema.entries.status, 'confirmed'), eq(schema.entries.absent, true))
                )
              )
            : sql`false`
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
        juniorHandlerDetails: true,
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
    format === 'marked'
      ? db.query.achievements.findMany({
          where: eq(schema.achievements.showId, showId),
          with: { dog: { with: { breed: true } } },
        })
      : Promise.resolve([] as never[]),
  ]);

  const judgesByBreedName: Record<string, string> = {};
  const judgeBios: Record<string, string> = {};
  const judgePhotos: Record<string, string> = {};
  const judgeRingNumbers: Record<string, string> = {};
  // For single-breed shows the judge assignments don't have a breed_id
  // (no need — there's only one breed), so the breed-keyed loop below
  // would skip them entirely and the catalogue wouldn't show any judges
  // page at all. Collect bios/photos/labels for ALL named judges so the
  // single-breed branch of JudgesListPage can render them.
  const seenJudgeKeys = new Set<string>();
  const judgeDisplayList: string[] = [];
  for (const ja of judgeAssignmentRows) {
    if (!ja.judge?.name) continue;
    // Bios and photos always — keyed by judge name so the same judge
    // assigned to both dogs and bitches doesn't double-render.
    if (ja.judge.bio && !judgeBios[ja.judge.name]) {
      judgeBios[ja.judge.name] = ja.judge.bio;
    }
    if (ja.judge.photoUrl && !judgePhotos[ja.judge.name]) {
      judgePhotos[ja.judge.name] = ja.judge.photoUrl;
    }
    // Build the sex-annotated display label, deduped by name+sex.
    const sexKey = `${ja.judge.name}::${ja.sex ?? 'all'}`;
    if (!seenJudgeKeys.has(sexKey)) {
      seenJudgeKeys.add(sexKey);
      const isJH = !ja.breed && ja.sex === null;
      const prefix = isJH
        ? 'Junior Handling'
        : ja.sex === 'dog'
        ? 'Dogs'
        : ja.sex === 'bitch'
        ? 'Bitches'
        : null;
      judgeDisplayList.push(prefix ? `${prefix} — ${ja.judge.name}` : ja.judge.name);
    }
    // Breed-keyed entries (multi-breed shows) and ring numbers.
    if (ja.breed?.name) {
      judgesByBreedName[ja.breed.name] = ja.judge.name;
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

  const classLabelMap = buildClassLabelMap(showClassRows);

  // Collect class sponsorship data for trophies page + inline display
  const classSponsorships: { className: string; classNumber: number | null; classLabel: string; trophyName: string | null; trophyDonor: string | null; sponsorName: string | null; sponsorAffix: string | null; prizeDescription: string | null }[] = [];
  for (const sc of showClassRows) {
    for (const cs of sc.classSponsorships ?? []) {
      // Sponsor name comes from either the free-text field or the linked sponsor
      const sponsorName = cs.sponsorName ?? cs.showSponsor?.sponsor?.name ?? null;
      if (cs.trophyName || sponsorName || cs.prizeDescription) {
        classSponsorships.push({
          className: sc.classDefinition?.name ?? 'Unknown Class',
          classNumber: sc.classNumber,
          classLabel: classLabelMap.get(sc.id) ?? '',
          trophyName: cs.trophyName,
          trophyDonor: cs.trophyDonor,
          sponsorName,
          sponsorAffix: cs.sponsorAffix ?? null,
          prizeDescription: cs.prizeDescription,
        });
      }
    }
  }

  // Use RKC catalogue formatting for the marked catalogue and the Crufts-
  // style by-breed layout (used for all-breed shows under the "by-class"
  // format). The "standard" format is rendered by the ringside component,
  // which uses its own simpler formatting.
  const useKCFormat = format === 'marked' || (format === 'by-class' && show.showScope !== 'single_breed');

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
      classLabel: ec.showClass?.id ? classLabelMap.get(ec.showClass.id) : undefined,
      sortOrder: ec.showClass?.sortOrder,
      showClassId: ec.showClassId,
    })),
    status: entry.status,
    entryType: entry.entryType,
    jhHandlerName: entry.juniorHandlerDetails?.handlerName ?? undefined,
    withholdFromPublication: entry.withholdFromPublication,
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
    classLabel: classLabelMap.get(sc.id) ?? '',
    sortOrder: sc.sortOrder,
    sex: sc.sex,
  }));

  // `show.scheduleData` is typed as `ScheduleData | null` by Drizzle via the
  // jsonb $type<ScheduleData>() annotation in the schema. Use it directly
  // instead of casting to a generic record so we get field-level safety.
  const scheduleData = show.scheduleData;

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
    judgeDisplayList: judgeDisplayList.length > 0 ? judgeDisplayList : undefined,
    judgeBios: Object.keys(judgeBios).length > 0 ? judgeBios : undefined,
    judgePhotos: Object.keys(judgePhotos).length > 0 ? judgePhotos : undefined,
    judgeRingNumbers: Object.keys(judgeRingNumbers).length > 0 ? judgeRingNumbers : undefined,
    classDefinitions,
    showScope: show.showScope ?? undefined,
    classSponsorships: classSponsorships.length > 0 ? classSponsorships : undefined,
    // When sponsorships are shown inline with classes, skip the separate trophies page
    skipTrophiesPage: classSponsorships.length > 0,
    customStatements: scheduleData?.customStatements,
    showSponsors: showSponsorInfos.length > 0 ? showSponsorInfos : undefined,
    allShowClasses: allShowClasses.length > 0 ? allShowClasses : undefined,
    welcomeNote: scheduleData?.welcomeNote,
    outsideAttraction: scheduleData?.outsideAttraction === true ? true : undefined,
    showManager: scheduleData?.showManager,
    dockingStatement: getDockingStatementFromScheduleData(scheduleData),

    // Settings audit (backlog #85): the fields below were filled in via the
    // schedule settings form but never reached the catalogue render pipeline.
    officers: scheduleData?.officers,
    guarantors: scheduleData?.guarantors,
    awardSponsors: scheduleData?.awardSponsors,
    bestAwards: scheduleData?.bestAwards,
    awardsDescription: scheduleData?.awardsDescription,
    additionalNotes: scheduleData?.additionalNotes,
    futureShowDates: scheduleData?.futureShowDates,
    catering: scheduleData?.catering,
    latestArrivalTime: scheduleData?.latestArrivalTime,
    acceptsNfc: scheduleData?.acceptsNfc,
    prizeMoney: scheduleData?.prizeMoney,
    country: scheduleData?.country,
    publicAdmission: scheduleData?.publicAdmission,
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
    // `ReactElement<any>` here because the format components have slightly
    // different prop signatures (marked takes extra `results`/`absentees`
    // props) — the union can't collapse cleanly, and `renderToBuffer`'s
    // signature uses the internal `DocumentProps` type which we don't
    // import. `any` matches the existing lax typing elsewhere in the PDF
    // pipeline (see pdf-generation.ts).
    let pdfDocument: React.ReactElement<any>;

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
          const result = (ec as {
            result?: {
              placement: number | null;
              placementStatus: string | null;
              specialAward: string | null;
            } | null;
          }).result;
          if (result && entry.catalogueNumber) {
            const key = `${entry.catalogueNumber}-${ec.showClassId}`;
            resultsMap.set(key, {
              catalogueNumber: entry.catalogueNumber,
              showClassId: ec.showClassId,
              placement: result.placement,
              placementStatus:
                result.placementStatus === 'withheld' || result.placementStatus === 'unplaced'
                  ? result.placementStatus
                  : null,
              specialAward: result.specialAward,
            });
          }
        }
      }

      // Achievements were fetched in the Promise.all above
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
      // The "standard" format is now rendered by the ringside component
      // (the old standalone "standard" was a near-duplicate of "by-class"
      // and has been removed — see backlog #83).
      const formatComponents = {
        standard: CatalogueRingside,
        'by-class': isAllBreed ? CatalogueByBreed : CatalogueByClass,
        judging: CatalogueJudging,
        absentees: CatalogueAbsentees,
      } as const;

      const Component = formatComponents[format as keyof typeof formatComponents];
      pdfDocument = React.createElement(Component, { show: showInfo, entries: catalogueEntries });
    }

    const buffer = await renderToBuffer(pdfDocument);

    // Mixam saddle-stitched booklets require a page count that's a
    // multiple of 4 (each folded A4 sheet = 4 pages). Pad the two
    // public-facing catalogue formats with blank pages at the end
    // so they can be sent straight to Mixam. Internal working docs
    // (steward/marked/absentees) are home-printed and don't need it.
    const needsBookletPadding = format === 'standard' || format === 'by-class';
    const finalBuffer = needsBookletPadding
      ? Buffer.from(await padPdfToMultiple(buffer, 4))
      : buffer;

    const formatLabels: Record<string, string> = {
      standard: 'Catalogue',
      'by-class': isAllBreed ? 'Catalogue-By-Breed' : 'Catalogue-By-Class',
      judging: 'Steward-Catalogue',
      absentees: 'Absentees',
      marked: 'Marked-Catalogue',
    };
    const filename = `${sanitizeFilename(show.name)}-${formatLabels[format] ?? 'Catalogue'}.pdf`;
    const isPreview = request.nextUrl.searchParams.has('preview');
    return makePdfResponse(finalBuffer, filename, isPreview);
  } catch (err) {
    console.error('PDF generation failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'PDF generation failed', detail: message },
      { status: 500 }
    );
  }
}
