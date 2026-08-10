import { NextRequest, NextResponse } from 'next/server';
import { publicOrgColumns } from '@/server/trpc/public-org-columns';
import { db } from '@/server/db';
import { and, eq, isNull, asc, inArray } from 'drizzle-orm';
import { getPaidOrderIdsForShow } from '@/server/services/show-metrics';
import { paidConfirmedAbsentNonJhWhere } from '@/server/services/report-queries';
import * as schema from '@/server/db/schema';
import { formatDogName, formatDogNameForCatalogue } from '@/lib/utils';
import { appendRegistrationFlags } from '@/lib/registration-flags';
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
import { isShowDayReached } from '@/lib/date-utils';
import { padPdfToMultiple, stripUnembeddedBase14Fonts } from '@/lib/pdf-pad';
import { syncCatalogueNumbers } from '@/server/services/catalogue-numbering';
import { getDockingStatementFromScheduleData } from '@/lib/rkc-compliance';
import { buildClassLabelMap, buildCatalogueClassDefinitions } from '@/lib/class-labels';
import { buildScheduleJudges, aggregateJudgeAssignments } from '@/lib/schedule-judges';
import { redactWithheldOwnerAddresses } from '@/lib/catalogue-privacy';
import { prepareAdvertsForRender } from '@/lib/advert-orientation';

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
    with: { organisation: { columns: publicOrgColumns }, venue: true },
  });

  if (!show) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }

  const authResult = await authenticatePdfRequest(show.organisationId, { showId, format });
  if (authResult instanceof NextResponse) return authResult;

  // Catalogues for exhibitors are released on the morning of the show
  // (Amanda 2026-05-28). Host-club secretaries and admins still get
  // pre-show access for proofing and printing.
  if (authResult.isExhibitorAccess && !isShowDayReached(show.startDate)) {
    return NextResponse.json(
      {
        error: 'Catalogue not yet available',
        message: 'Your catalogue will be ready on the morning of the show. We\'ll email you a link as soon as it\'s live.',
        availableFrom: show.startDate,
      },
      { status: 403 },
    );
  }

  // Auto-assign catalogue numbers in class order if the show doesn't
  // have any yet. Amanda's UX ask 2026-04-17: she shouldn't have to
  // find a button — opening a catalogue should just give you numbered
  // entries. No-op when numbers already exist.
  await syncCatalogueNumbers(db, showId, { allowResort: false });

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
  const [judgeAssignmentRows, showClassRows, entries, safeLogoUrl, showSponsorRows, achievementRows, catalogueAdvertRows] = await Promise.all([
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
      // Absentees = dogs entered but absent on the day, paid orders only,
      // excluding Junior Handling (Mandy 2026-07-06). Shared with this
      // format's .xlsx twin via report-queries.ts so the two row sets can
      // never diverge.
      where:
        format === 'absentees'
          ? paidConfirmedAbsentNonJhWhere(showId, paidOrderIds ?? [])
          : and(eq(schema.entries.showId, showId), eq(schema.entries.status, 'confirmed'), isNull(schema.entries.deletedAt)),
      with: {
        dog: {
          with: {
            breed: { with: { group: true } },
            owners: { orderBy: [asc(schema.dogOwners.sortOrder)] },
            titles: true,
            svProfile: true,
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
    db.query.catalogueAdverts.findMany({
      where: and(
        eq(schema.catalogueAdverts.showId, showId),
        inArray(schema.catalogueAdverts.document, ['catalogue', 'both']),
      ),
      orderBy: [asc(schema.catalogueAdverts.sortOrder)],
    }),
  ]);

  // Plain donors thanked in the catalogue (name + optional affix, no amount).
  const showDonationRows = await db.query.showDonations.findMany({
    where: eq(schema.showDonations.showId, showId),
    orderBy: [asc(schema.showDonations.displayOrder), asc(schema.showDonations.createdAt)],
  });

  const judgesByBreedName: Record<string, string> = {};
  const judgeBios: Record<string, string> = {};
  const judgePhotos: Record<string, string> = {};
  const judgeRingNumbers: Record<string, string> = {};
  // For single-breed shows the judge assignments don't have a breed_id
  // (no need — there's only one breed), so the breed-keyed loop below
  // would skip them entirely and the catalogue wouldn't show any judges
  // page at all. Collect bios/photos/labels for ALL named judges so the
  // single-breed branch of JudgesListPage can render them.
  // Bios, photos and breed-keyed ring numbers for the judges page — keyed by
  // judge name so a judge doing both sexes doesn't double-render.
  for (const ja of judgeAssignmentRows) {
    if (!ja.judge?.name) continue;
    if (ja.judge.bio && !judgeBios[ja.judge.name]) judgeBios[ja.judge.name] = ja.judge.bio;
    if (ja.judge.photoUrl && !judgePhotos[ja.judge.name]) judgePhotos[ja.judge.name] = ja.judge.photoUrl;
    if (ja.breed?.name) {
      judgesByBreedName[ja.breed.name] = ja.judge.name;
      if (ja.ring?.number) judgeRingNumbers[ja.breed.name] = String(ja.ring.number);
    }
  }

  // Sex-annotated judge labels — the SAME aggregator + resolver the print
  // pipeline and the schedule use, so a judge doing dogs AND bitches reads
  // "Dogs & Bitches — Name" on one line everywhere (Michael 2026-06-19).
  const { entries: catJudgeEntries, specialAwardsJudges: catSpecialAwardsJudges } =
    aggregateJudgeAssignments(judgeAssignmentRows);
  const catHasJuniorHandlerClasses = showClassRows.some(
    (sc) => sc.classDefinition?.type === 'junior_handler',
  );
  const judgeDisplayList = buildScheduleJudges(
    catJudgeEntries.values(),
    catSpecialAwardsJudges,
    catHasJuniorHandlerClasses,
  )
    .map((j) => j.displayLabel)
    .filter((label): label is string => !!label);

  // Definitions of Classes — deduped, Junior Handling floated to the END (after
  // Veteran). Shared with the print pipeline so the page can't drift.
  const classDefinitions = buildCatalogueClassDefinitions(showClassRows);

  const classLabelMap = buildClassLabelMap(showClassRows, show.showRuleset);

  // Collect class sponsorship data for trophies page + inline display
  const classSponsorships: { className: string; classNumber: number | null; classLabel: string; trophyName: string | null; trophyDonor: string | null; sponsorName: string | null; sponsorAffix: string | null; prizeDescription: string | null; bannerImageUrl: string | null }[] = [];
  for (const sc of showClassRows) {
    for (const cs of sc.classSponsorships ?? []) {
      // Sponsor name comes from either the free-text field or the linked sponsor
      const sponsorName = cs.sponsorName ?? cs.showSponsor?.sponsor?.name ?? null;
      const bannerImageUrl = (cs as { bannerImageUrl?: string | null }).bannerImageUrl ?? null;
      if (cs.trophyName || sponsorName || cs.prizeDescription || bannerImageUrl) {
        classSponsorships.push({
          className: sc.classDefinition?.name ?? 'Unknown Class',
          classNumber: sc.classNumber,
          classLabel: classLabelMap.get(sc.id) ?? '',
          trophyName: cs.trophyName,
          trophyDonor: cs.trophyDonor,
          sponsorName,
          sponsorAffix: cs.sponsorAffix ?? null,
          prizeDescription: cs.prizeDescription,
          bannerImageUrl,
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
    // RKC registration flags (NAF/TAF/CNAF) print after the dog's name. Applied
    // here rather than inside the six format components, which all consume
    // `dogName` as an opaque string — and the twin of this expression in
    // pdf-generation.ts must stay identical (two render paths, one output).
    dogName: appendRegistrationFlags(
      entry.dog
        ? (useKCFormat ? formatDogNameForCatalogue(entry.dog) : formatDogName(entry.dog))
        : null,
      entry
    ),
    breed: entry.dog?.breed?.name,
    breedId: entry.dog?.breed?.id,
    group: entry.dog?.breed?.group?.name,
    groupSortOrder: entry.dog?.breed?.group?.sortOrder,
    sex: entry.dog?.sex,
    dateOfBirth: entry.dog?.dateOfBirth,
    kcRegNumber: entry.dog?.kcRegNumber,
    microchipNumber: entry.dog?.microchipNumber ?? null,
    svProfile: entry.dog?.svProfile
      ? {
          hipGrade: entry.dog.svProfile.hipGrade ?? null,
          hipScore: entry.dog.svProfile.hipScore ?? null,
          hipScoreOther: entry.dog.svProfile.hipScoreOther ?? null,
          elbowGrade: entry.dog.svProfile.elbowGrade ?? null,
          elbowScore: entry.dog.svProfile.elbowScore ?? null,
          elbowScoreOther: entry.dog.svProfile.elbowScoreOther ?? null,
          dna: entry.dog.svProfile.dna ?? null,
          koerung: entry.dog.svProfile.koerung ?? null,
        }
      : null,
    colour: entry.dog?.colour,
    sire: entry.dog?.sireName,
    dam: entry.dog?.damName,
    breeder: entry.dog?.breederName,
    breederCity: (entry.dog as { breederCity?: string | null })?.breederCity ?? null,
    breederPostcode: (entry.dog as { breederPostcode?: string | null })?.breederPostcode ?? null,
    titles: entry.dog?.titles?.map((t) => t.title).filter(Boolean) ?? [],
    owners: entry.dog?.owners?.map((o) => ({
      title: o.ownerTitle,
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
      svCoatType: (ec.showClass as { svCoatType?: 'stock' | 'long_stock' | null } | undefined)?.svCoatType ?? null,
      classDefinitionType: ec.showClass?.classDefinition?.type ?? null,
    })),
    status: entry.status,
    entryType: entry.entryType,
    isNfc: entry.isNfc,
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
    svCoatType: (sc as { svCoatType?: 'stock' | 'long_stock' | null }).svCoatType ?? null,
    classDefinitionType: sc.classDefinition?.type ?? null,
  }));

  // `show.scheduleData` is typed as `ScheduleData | null` by Drizzle via the
  // jsonb $type<ScheduleData>() annotation in the schema. Use it directly
  // instead of casting to a generic record so we get field-level safety.
  const scheduleData = show.scheduleData;

  // Measure each advert so landscape artwork gets a landscape page (fills it)
  // rather than a portrait page with white bands top and bottom.
  const advertsForCatalogue = await prepareAdvertsForRender(
    catalogueAdvertRows.map((ad) => ({
      id: ad.id,
      advertiserName: ad.advertiserName,
      position: ad.position,
      imageUrl: ad.imageUrl,
      sortOrder: ad.sortOrder,
    })),
  );

  const showInfo: CatalogueShowInfo = {
    name: show.name,
    showType: show.showType,
    showRuleset: (show as { showRuleset?: 'rkc' | 'wusv' | null }).showRuleset ?? null,
    date: show.startDate,
    endDate: show.endDate !== show.startDate ? show.endDate : undefined,
    venue: show.venue?.name,
    venueAddress: show.venue?.address ?? undefined,
    organisation: show.organisation?.name,
    kcLicenceNo: show.kcLicenceNo,
    showOpenTime: show.showOpenTime,
    startTime: show.startTime,
    logoUrl: safeLogoUrl ?? undefined,
    secretaryName: show.secretaryName ?? undefined,
    secretaryEmail: show.secretaryEmail ?? undefined,
    secretaryPhone: show.secretaryPhone ?? undefined,
    secretaryAddress: show.secretaryAddress ?? undefined,
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
    donations: showDonationRows.length > 0
      ? showDonationRows.map((d) => ({ name: d.donorName, affix: d.affix }))
      : undefined,
    allShowClasses: allShowClasses.length > 0 ? allShowClasses : undefined,
    welcomeNote: scheduleData?.welcomeNote,
    outsideAttraction: scheduleData?.outsideAttraction === true ? true : undefined,
    showManager: scheduleData?.showManager,
    firstAiders: scheduleData?.firstAiders,
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
    adverts: advertsForCatalogue,
  };

  // Check if JSON format was explicitly requested (for data export)
  const wantsJson = request.nextUrl.searchParams.get('output') === 'json';
  if (wantsJson) {
    return NextResponse.json({
      show: showInfo,
      // Suppress withheld owners' home addresses — this export is reachable
      // with exhibitor-level access on show day. Mirrors the PDF render.
      entries: redactWithheldOwnerAddresses(catalogueEntries),
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

      // SV/WUSV regional shows always render as the by-class single-breed
      // catalogue regardless of the requested format — Amanda 2026-05-23
      // "the only option will be 'by class' catalogue".
      const isWusv = showInfo.showRuleset === 'wusv';
      const effectiveFormat = isWusv ? 'by-class' : format;

      // Pre-bake the SV tonal washes (cover + inside) from the club's
      // brand colours so the React render stays synchronous.
      if (isWusv) {
        const orgRow = show.organisation as
          | { logoColorPrimary?: string | null; logoColorSecondary?: string | null; logoMonochrome?: boolean | null }
          | null
          | undefined;
        const { getTonalWash } = await import('@/server/services/sv-tonal-wash');
        const primary = orgRow?.logoMonochrome ? null : orgRow?.logoColorPrimary ?? null;
        const secondary = orgRow?.logoMonochrome ? null : orgRow?.logoColorSecondary ?? null;
        const [cover, inside] = await Promise.all([
          getTonalWash(primary, secondary, 'cover'),
          getTonalWash(primary, secondary, 'inside'),
        ]);
        showInfo.svWashes = { cover, inside };
      }

      const Component = formatComponents[effectiveFormat as keyof typeof formatComponents];
      pdfDocument = React.createElement(Component, { show: showInfo, entries: catalogueEntries });
    }

    const buffer = await renderToBuffer(pdfDocument);

    // Mixam saddle-stitched booklets require a page count that's a
    // multiple of 4 (each folded A4 sheet = 4 pages). Pad the two
    // public-facing catalogue formats with blank pages at the end
    // so they can be sent straight to Mixam. Internal working docs
    // (steward/marked/absentees) are home-printed and don't need it.
    const needsBookletPadding = format === 'standard' || format === 'by-class';
    // Every format goes through at least the base-14 phantom-font strip
    // (react-pdf leaves unembedded Helvetica/Times-Roman/etc. refs in every
    // document's Resources dict regardless of what's actually drawn) —
    // padPdfToMultiple already includes that step for the booklet formats.
    const finalBuffer = needsBookletPadding
      ? Buffer.from(await padPdfToMultiple(buffer, 4))
      : Buffer.from(await stripUnembeddedBase14Fonts(buffer));

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
