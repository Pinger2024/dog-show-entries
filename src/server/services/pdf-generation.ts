/**
 * PDF Generation service — reusable functions for generating PDF buffers.
 *
 * Extracted from the API routes so the print pipeline can generate PDFs
 * server-side and upload them to R2 for Tradeprint.
 */

import path from 'node:path';
import sharp from 'sharp';
import { format, parseISO } from 'date-fns';
import { db } from '@/server/db';
import { and, eq, isNull, asc, sql, inArray } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { formatDogName, formatDogNameForCatalogue } from '@/lib/utils';
import { appendRegistrationFlags } from '@/lib/registration-flags';
import { renderToBuffer, Document, Page, Text, StyleSheet } from '@react-pdf/renderer';
import { CatalogueRingside } from '@/components/catalogue/catalogue-ringside';
import { CatalogueByClass } from '@/components/catalogue/catalogue-by-class';
import { CatalogueByBreed } from '@/components/catalogue/catalogue-by-breed';
import { CatalogueJudging } from '@/components/catalogue/catalogue-judging';
import type { CatalogueEntry, CatalogueShowInfo } from '@/components/catalogue/catalogue-types';
import { fetchClubImage } from '@/lib/safe-image-fetch';
import { PrizeCards } from '@/components/prize-cards/prize-cards';
import type { PrizeCardShowInfo, PrizeCardClass } from '@/components/prize-cards/prize-cards';
import { pickScheduleComponent, designedSchedulePageCount } from '@/components/schedule';
import { renderScheduleWithFit } from './schedule-render';
import type { ScheduleShowInfo, ScheduleClass, ScheduleJudge, ScheduleSponsor, SchedulePanelJudge } from '@/components/schedule';
import { RingBoard } from '@/components/ring-board/ring-board';
import type { RingBoardShowInfo, RingBoardRing } from '@/components/ring-board/ring-board';
import { RingNumbers as RingNumbersComponent } from '@/components/ring-numbers/ring-numbers';
import type { RingNumberShowInfo, RingNumberFormat } from '@/components/ring-numbers/ring-numbers';
import React from 'react';
import { uploadToR2, getPublicUrl } from '@/server/services/storage';
import { getDockingStatementFromScheduleData } from '@/lib/rkc-compliance';
import type { RegionalFeeConfig } from '@/server/db/schema/shows';
import { buildClassLabelMap, isSpecialAwardClass, buildCatalogueClassDefinitions } from '@/lib/class-labels';
import { buildScheduleJudges, aggregateJudgeAssignments } from '@/lib/schedule-judges';
import { padPdfToMultiple, stripUnembeddedBase14Fonts } from '@/lib/pdf-pad';
import { prepareAdvertsForRender } from '@/lib/advert-orientation';

// ── Catalogue PDF ──

export async function generateCataloguePdf(
  showId: string,
  format: 'standard' | 'by-class' | 'judging' = 'standard',
  opts?: {
    /** Print a different venue than the one stored on the show — for an
     *  embargoed venue change (Mandy 2026-08-17: Clyde Valley + Scotland
     *  moved to Monteith Park, but the public site must keep the old venue
     *  until the club has announced it). The site's own downloads keep
     *  reading the DB, so the embargo holds itself; this override exists
     *  for generating the print files ahead of the announcement. */
    venueOverride?: { name: string; address: string; what3words?: string };
  }
): Promise<Buffer> {
  const show = await db.query.shows.findFirst({
    where: eq(schema.shows.id, showId),
    with: { organisation: true, venue: true },
  });

  if (!show) throw new Error(`Show ${showId} not found`);

  // Run independent queries in parallel. These match the catalogue
  // API route's queries so both pipelines build identical showInfo —
  // previously this service dropped bios/photos/ring numbers/class
  // sponsorships/show sponsors, so any catalogue generated via
  // generateAndUploadForPrint was missing them.
  const [judgeAssignmentRows, showClassRows, entries, showSponsorRows, catalogueAdvertRows] = await Promise.all([
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
        eq(schema.entries.status, 'confirmed'),
        isNull(schema.entries.deletedAt)
      ),
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
          with: { showClass: { with: { classDefinition: true } } },
        },
      },
      orderBy: [asc(schema.entries.catalogueNumber)],
    }),
    db.query.showSponsors.findMany({
      where: eq(schema.showSponsors.showId, showId),
      with: { sponsor: true },
      orderBy: [asc(schema.showSponsors.displayOrder)],
    }),
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
  for (const ja of judgeAssignmentRows) {
    if (ja.breed?.name && ja.judge?.name) {
      judgesByBreedName[ja.breed.name] = ja.judge.name;
    }
    if (ja.judge?.bio && !judgeBios[ja.judge.name]) {
      judgeBios[ja.judge.name] = ja.judge.bio;
    }
    if (ja.judge?.photoUrl && !judgePhotos[ja.judge.name]) {
      judgePhotos[ja.judge.name] = ja.judge.photoUrl;
    }
    if (ja.ring?.number != null && ja.breed?.name) {
      judgeRingNumbers[ja.breed.name] = String(ja.ring.number);
    }
  }
  // Sex-annotated display labels — the SAME aggregator + resolver the catalogue
  // HTTP route and the schedule use, so a judge doing both sexes shows ONCE as
  // "Dogs & Bitches — <name>" everywhere (Mandy 2026-06-16; shared 2026-06-19).
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

  const classLabelMap = buildClassLabelMap(showClassRows, show.showRuleset);

  // Build class sponsorship list for the Trophies & Sponsorships page
  // AND the inline per-class sponsor lines. Mirrors route.ts so the two
  // pipelines produce the same catalogue for the same show.
  const classSponsorshipInfos: CatalogueShowInfo['classSponsorships'] = [];
  for (const sc of showClassRows) {
    for (const cs of sc.classSponsorships ?? []) {
      const sponsorName = cs.sponsorName ?? cs.showSponsor?.sponsor?.name ?? null;
      const bannerImageUrl = (cs as { bannerImageUrl?: string | null }).bannerImageUrl ?? null;
      if (cs.trophyName || sponsorName || cs.prizeDescription || bannerImageUrl) {
        classSponsorshipInfos.push({
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

  const showSponsorInfos = showSponsorRows.map((ss) => ({
    name: ss.sponsor.name,
    tier: ss.tier,
    logoUrl: ss.sponsor.logoUrl,
    website: ss.sponsor.website,
    customTitle: ss.customTitle,
  }));

  const allShowClasses = showClassRows.map((sc) => ({
    className: sc.classDefinition?.name ?? 'Unknown Class',
    classNumber: sc.classNumber,
    classLabel: classLabelMap.get(sc.id) ?? '',
    sortOrder: sc.sortOrder,
    sex: sc.sex,
    svCoatType: (sc as { svCoatType?: 'stock' | 'long_stock' | null }).svCoatType ?? null,
    classDefinitionType: sc.classDefinition?.type ?? null,
  }));

  // Definitions of Classes — deduped, Junior Handling floated to the END (after
  // Veteran). Shared with the HTTP route so the page can't drift between them.
  const classDefinitions = buildCatalogueClassDefinitions(showClassRows);

  // The ringside-based "standard" format uses plain formatting; only the
  // Crufts-style by-breed layout (for all-breed shows under "by-class")
  // needs RKC catalogue formatting.
  const useKCFormat = format === 'by-class' && show.showScope !== 'single_breed';

  const catalogueEntries: CatalogueEntry[] = entries.map((entry) => ({
    catalogueNumber: entry.catalogueNumber,
    // RKC registration flags (NAF/TAF/CNAF) print after the dog's name. Must
    // stay identical to the twin expression in the catalogue HTTP route —
    // these are the two render paths that have to produce the same output.
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
    jhHandlerName: entry.juniorHandlerDetails?.handlerName ?? undefined,
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
    withholdFromPublication: entry.withholdFromPublication,
  }));

  // Drizzle gives us `ScheduleData | null` directly via the jsonb $type<>
  // annotation in the schema, so we can read fields without casts.
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
    venue: opts?.venueOverride?.name ?? show.venue?.name,
    venueAddress: opts?.venueOverride?.address ?? show.venue?.address ?? undefined,
    venueWhat3words: opts?.venueOverride?.what3words,
    organisation: show.organisation?.name,
    kcLicenceNo: show.kcLicenceNo,
    logoUrl: show.organisation?.logoUrl ?? undefined,
    secretaryName: show.secretaryName ?? undefined,
    secretaryEmail: show.secretaryEmail ?? undefined,
    secretaryPhone: show.secretaryPhone ?? undefined,
    secretaryAddress: show.secretaryAddress ?? undefined,
    onCallVet: show.onCallVet ?? undefined,
    showOpenTime: show.showOpenTime,
    startTime: show.startTime,
    totalClasses: showClassRows.length,
    wetWeatherAccommodation: scheduleData?.wetWeatherAccommodation,
    judgedOnGroupSystem: scheduleData?.judgedOnGroupSystem,
    judgesByBreedName,
    judgeDisplayList: judgeDisplayList.length > 0 ? judgeDisplayList : undefined,
    judgeBios: Object.keys(judgeBios).length > 0 ? judgeBios : undefined,
    judgePhotos: Object.keys(judgePhotos).length > 0 ? judgePhotos : undefined,
    judgeRingNumbers: Object.keys(judgeRingNumbers).length > 0 ? judgeRingNumbers : undefined,
    classDefinitions,
    showScope: show.showScope ?? undefined,
    classSponsorships: classSponsorshipInfos.length > 0 ? classSponsorshipInfos : undefined,
    skipTrophiesPage: classSponsorshipInfos.length > 0,
    showSponsors: showSponsorInfos.length > 0 ? showSponsorInfos : undefined,
    donations: showDonationRows.length > 0
      ? showDonationRows.map((d) => ({ name: d.donorName, affix: d.affix }))
      : undefined,
    allShowClasses: allShowClasses.length > 0 ? allShowClasses : undefined,
    customStatements: scheduleData?.customStatements,
    dockingStatement: getDockingStatementFromScheduleData(scheduleData),

    // Settings audit (backlog #85): wire schedule fields through to the
    // catalogue render pipeline so they actually appear in the PDF.
    welcomeNote: scheduleData?.welcomeNote,
    outsideAttraction: scheduleData?.outsideAttraction === true ? true : undefined,
    showManager: scheduleData?.showManager,
    firstAiders: scheduleData?.firstAiders,
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

  const isAllBreed = show.showScope !== 'single_breed';
  const isWusv = showInfo.showRuleset === 'wusv';

  // SV/WUSV regional shows always render as the by-class single-breed
  // catalogue regardless of the requested format — Amanda 2026-05-23:
  // "the only option will be 'by class' catalogue".
  const effectiveFormat = isWusv ? 'by-class' : format;
  const formatComponents = {
    standard: CatalogueRingside,
    'by-class': isAllBreed ? CatalogueByBreed : CatalogueByClass,
    // Stewards' catalogue — same props, same assembly; mirrors the route's
    // dispatch so the working document is renderable server-side too
    // (verification harness / print pipeline).
    judging: CatalogueJudging,
  } as const;

  // For SV shows we pre-bake the cover + inside tonal washes from the
  // org's brand colours so the catalogue render stays synchronous.
  if (isWusv) {
    const orgRow = show.organisation as
      | { logoColorPrimary?: string | null; logoColorSecondary?: string | null; logoMonochrome?: boolean | null }
      | null
      | undefined;
    const { getTonalWash } = await import('./sv-tonal-wash');
    const primary = orgRow?.logoMonochrome ? null : orgRow?.logoColorPrimary ?? null;
    const secondary = orgRow?.logoMonochrome ? null : orgRow?.logoColorSecondary ?? null;
    const [cover, inside] = await Promise.all([
      getTonalWash(primary, secondary, 'cover'),
      getTonalWash(primary, secondary, 'inside'),
    ]);
    showInfo.svWashes = { cover, inside };
  }

  const Component = formatComponents[effectiveFormat];
  const pdfDocument = React.createElement(Component, { show: showInfo, entries: catalogueEntries });
  const rawBuffer = await renderToBuffer(pdfDocument);
  // Pad to a multiple of 4 pages — the SAME padPdfToMultiple the
  // /api/catalogue route applies to these booklet formats, so a catalogue
  // from this function is page-for-page identical to a site download. It
  // also strips react-pdf's unembedded base-14 phantom font refs. Before
  // 2026-08-17 this function only stripped fonts and skipped the padding,
  // which is how Mandy received a 31-page book that couldn't duplex
  // ("we need an even number of pages for printing the catalogue").
  // The judging (stewards') catalogue is an internal working document — the
  // route doesn't booklet-pad it either, only the public booklet formats.
  if (effectiveFormat === 'judging') {
    return Buffer.from(await stripUnembeddedBase14Fonts(rawBuffer));
  }
  return Buffer.from(await padPdfToMultiple(rawBuffer, 4));
}

// ── Prize Cards PDF ──

export async function generatePrizeCardsPdf(
  showId: string,
  options: {
    placements?: number;
    includeJudgeName?: boolean;
    onlySac?: boolean;
    cardStyle?: 'filled' | 'outline';
    pageSize?: [number, number];
  } = {}
): Promise<Buffer> {
  const {
    placements = 5,
    includeJudgeName = true,
    onlySac = false,
    cardStyle = 'filled',
    pageSize,
  } = options;

  const show = await db.query.shows.findFirst({
    where: eq(schema.shows.id, showId),
    with: { organisation: true },
  });

  if (!show) throw new Error(`Show ${showId} not found`);

  const [showClasses, judgeAssignments] = await Promise.all([
    db.query.showClasses.findMany({
      where: eq(schema.showClasses.showId, showId),
      with: { classDefinition: true, breed: true },
      orderBy: [asc(schema.showClasses.sortOrder), asc(schema.showClasses.classNumber)],
    }),
    db.query.judgeAssignments.findMany({
      where: eq(schema.judgeAssignments.showId, showId),
      with: { judge: true },
    }),
  ]);

  const judgeByBreed = new Map<string | null, string>();
  let sacJudgeName: string | null = null;
  for (const ja of judgeAssignments) {
    if (!ja.judge?.name) continue;
    if (ja.isSpecialAwardsClassesJudge) {
      sacJudgeName = ja.judge.name;
    } else {
      judgeByBreed.set(ja.breedId, ja.judge.name);
    }
  }

  const prizeCardLabelMap = buildClassLabelMap(showClasses, show.showRuleset);
  const filteredShowClasses = onlySac
    ? showClasses.filter((sc) => isSpecialAwardClass(sc))
    : showClasses;
  const classes: PrizeCardClass[] = filteredShowClasses.map((sc) => ({
    classLabel: prizeCardLabelMap.get(sc.id) ?? '',
    className: sc.classDefinition?.name ?? 'Unknown Class',
    sex: sc.sex,
    breedName: sc.breed?.name ?? null,
    judgeName: isSpecialAwardClass(sc)
      ? sacJudgeName
      : judgeByBreed.get(sc.breedId) ?? judgeByBreed.get(null) ?? null,
  }));

  const showInfo: PrizeCardShowInfo = {
    name: show.name,
    showType: show.showType,
    date: show.startDate,
    organisation: show.organisation?.name ?? null,
    logoUrl: show.organisation?.logoUrl ?? null,
  };

  const pdfDocument = React.createElement(PrizeCards, {
    show: showInfo,
    classes,
    includeJudgeName,
    placements,
    cardStyle,
    pageSize,
  });
  return Buffer.from(await renderToBuffer(pdfDocument));
}

// ── Schedule PDF ──

export async function generateSchedulePdf(showId: string): Promise<Buffer> {
  const show = await db.query.shows.findFirst({
    where: eq(schema.shows.id, showId),
    with: { organisation: true, venue: true, breed: true },
  });

  if (!show) throw new Error(`Show ${showId} not found`);

  const [showClasses, judgeAssignments, showSponsors, discountGroups, advertRows, sundryItemRows, showBreedRows] = await Promise.all([
    db.query.showClasses.findMany({
      where: eq(schema.showClasses.showId, showId),
      with: {
        classDefinition: true,
        breed: { with: { group: true } },
        classSponsorships: true,
      },
      orderBy: [asc(schema.showClasses.sortOrder), asc(schema.showClasses.classNumber)],
    }),
    db.query.judgeAssignments.findMany({
      where: eq(schema.judgeAssignments.showId, showId),
      with: { judge: true, breed: true, breedGroup: true, judgeRole: true },
    }),
    db.query.showSponsors.findMany({
      where: eq(schema.showSponsors.showId, showId),
      with: { sponsor: true },
    }),
    db.query.showDiscountGroups.findMany({
      where: eq(schema.showDiscountGroups.showId, showId),
      orderBy: [asc(schema.showDiscountGroups.displayOrder)],
    }),
    db.query.catalogueAdverts.findMany({
      where: eq(schema.catalogueAdverts.showId, showId),
      orderBy: [asc(schema.catalogueAdverts.sortOrder)],
    }),
    db.query.sundryItems.findMany({
      where: eq(schema.sundryItems.showId, showId),
      orderBy: [asc(schema.sundryItems.sortOrder)],
    }),
    db.query.showBreeds.findMany({
      where: eq(schema.showBreeds.showId, showId),
      columns: { breedId: true, ccOffered: true },
    }),
  ]);

  const adverts = advertRows.map((ad) => ({
    id: ad.id,
    advertiserName: ad.advertiserName,
    document: ad.document,
    position: ad.position,
    imageUrl: ad.imageUrl,
    sortOrder: ad.sortOrder,
  }));

  // Group by judge — combining dog + bitch assignments into a single
  // "Dogs & Bitches" row (Amanda 2026-05-24: "anyway we can have Hugh's
  // name showing one with dogs & bitches"). Mirrors the user-facing
  // /api/schedule/[showId] route's combining logic so both code paths
  // produce identical schedules. Skip group/show-level (panel)
  // assignments — those are surfaced via panelJudges below.
  const judgeEntries = new Map<string, {
    name: string;
    affix: string | null;
    breeds: Set<string>;
    sexes: Set<string>;
    hasNullSexAssignment: boolean;
    subjectToRkcApproval: boolean;
  }>();
  const specialAwardsJudges: Array<{ name: string; subjectToRkcApproval: boolean }> = [];
  for (const ja of judgeAssignments) {
    if (!ja.judge?.id || !ja.judge?.name) continue;
    const subjectToRkcApproval = (ja as { subjectToRkcApproval?: boolean }).subjectToRkcApproval === true;
    if (ja.isSpecialAwardsClassesJudge) {
      specialAwardsJudges.push({ name: ja.judge.name, subjectToRkcApproval });
      continue;
    }
    if (ja.judgeRoleId) continue;
    const key = ja.judge.id;
    const existing = judgeEntries.get(key);
    if (existing) {
      if (ja.breed?.name) existing.breeds.add(ja.breed.name);
      if (ja.sex) existing.sexes.add(ja.sex);
      else existing.hasNullSexAssignment = true;
      // Any single assignment being subject-to-approval flags the whole judge entry.
      if (subjectToRkcApproval) existing.subjectToRkcApproval = true;
    } else {
      judgeEntries.set(key, {
        name: ja.judge.name,
        affix: ja.judge.kennelClubAffix ?? null,
        breeds: new Set(ja.breed?.name ? [ja.breed.name] : []),
        sexes: new Set(ja.sex ? [ja.sex] : []),
        hasNullSexAssignment: !ja.sex,
        subjectToRkcApproval,
      });
    }
  }

  // Multi-breed panel judges (group-level + show-level). Empty for single-breed.
  const panelJudges: SchedulePanelJudge[] = judgeAssignments
    .filter((ja) => ja.judgeRoleId && ja.judge?.name && ja.judgeRole)
    .map((ja) => {
      const subjectToRkcApproval = (ja as { subjectToRkcApproval?: boolean }).subjectToRkcApproval === true;
      const baseName = ja.judge!.kennelClubAffix
        ? `${ja.judge!.name} (${ja.judge!.kennelClubAffix})`
        : ja.judge!.name;
      const namePart = `${baseName}${subjectToRkcApproval ? ' (subject to RKC approval)' : ''}`;
      return {
        displayLabel: namePart,
        roleName: ja.judgeRole!.name,
        roleShortLabel: ja.judgeRole!.shortLabel ?? null,
        roleSortOrder: ja.judgeRole!.sortOrder,
        isGroupLevel: ja.judgeRole!.isGroupLevel,
        groupName: ja.breedGroup?.name ?? null,
        groupSortOrder: ja.breedGroup?.sortOrder ?? null,
      };
    });

  const approvalSuffix = (subjectToRkcApproval: boolean) =>
    subjectToRkcApproval ? ' (subject to RKC approval)' : '';

  // Detect Junior Handling: a judge whose only assignments have no
  // breed/sex set — JH classes don't FK to a breed and don't carry a sex.
  const hasJuniorHandlerClasses = showClasses.some((sc) => sc.classDefinition?.type === 'junior_handler');

  const judges: ScheduleJudge[] = [...judgeEntries.values()].map((j) => {
    const breedArr = Array.from(j.breeds);
    const isJH = breedArr.length === 0 && j.sexes.size === 0 && j.hasNullSexAssignment && hasJuniorHandlerClasses;
    const role = isJH
      ? 'Junior Handling'
      : j.sexes.has('dog') && j.sexes.has('bitch')
        ? 'Dogs & Bitches'
        : j.sexes.has('dog')
          ? 'Dogs'
          : j.sexes.has('bitch')
            ? 'Bitches'
            : null;
    const suffix = approvalSuffix(j.subjectToRkcApproval);
    const namePart = `${j.name}${suffix}`;
    return {
      name: j.name,
      affix: j.affix,
      breeds: breedArr,
      sex: j.sexes.size === 1 ? (Array.from(j.sexes)[0] as 'dog' | 'bitch') : null,
      // role MUST be set (not just baked into displayLabel) — the SV schedule's
      // Junior Handling banner reads judges.find(role === 'Junior Handling').
      // Without it the JH judge silently vanished from this render path while
      // the /api/schedule route showed it (Mandy 2026-07-09).
      role: role ?? undefined,
      displayLabel: role ? `${role} — ${namePart}` : namePart,
    };
  });

  // Append Special Awards Classes judges with the explicit role label.
  // Format mirrors the other judges (Amanda 2026-05-27):
  // "Special Awards Classes — <name>". The role field is what the
  // schedule component filters on to surface the SAC judge inside the
  // SAC section, so it MUST be set — without it the dedicated SAC
  // block silently rendered with no judge line (Amanda spotted it).
  for (const sac of specialAwardsJudges) {
    judges.push({
      name: sac.name,
      breeds: [],
      sex: null,
      role: 'Special Awards Classes',
      displayLabel: `Special Awards Classes — ${sac.name}${approvalSuffix(sac.subjectToRkcApproval)}`,
    });
  }

  const classLabelMap = buildClassLabelMap(showClasses, show.showRuleset);
  const ccOfferedByBreed = new Map(showBreedRows.map((row) => [row.breedId, row.ccOffered]));
  const classes: ScheduleClass[] = showClasses.map((sc) => ({
    classNumber: sc.classNumber,
    classLabel: classLabelMap.get(sc.id) ?? '',
    className: sc.classDefinition?.name ?? 'Unknown',
    classDescription: sc.classDefinition?.description ?? null,
    sex: sc.sex,
    breedName: sc.breed?.name ?? null,
    classType: sc.classDefinition?.type ?? null,
    svCoatType: (sc as { svCoatType?: 'stock' | 'long_stock' | null }).svCoatType ?? null,
    breedGroupName: sc.breed?.group?.name ?? sc.classGroup ?? null,
    breedGroupSortOrder: sc.breed?.group?.sortOrder ?? (sc.classGroup
      ? ['Gundog', 'Hound', 'Pastoral', 'Terrier', 'Toy', 'Utility', 'Working'].indexOf(sc.classGroup) + 1
      : null),
    classGroup: sc.classGroup,
    entryFee: sc.entryFee ?? null,
    ccOffered: sc.breedId ? ccOfferedByBreed.get(sc.breedId) === true : false,
  }));

  // Build class sponsorships grouped by show sponsor (loaded via showClasses relation)
  const classSponsorsByShowSponsor = new Map<string, Array<{
    className: string;
    trophyName: string | null;
    trophyDonor: string | null;
    prizeDescription: string | null;
  }>>();
  for (const sc of showClasses) {
    for (const cs of sc.classSponsorships ?? []) {
    if (!cs.showSponsorId) continue;
    const list = classSponsorsByShowSponsor.get(cs.showSponsorId) ?? [];
    list.push({
      className: sc.classDefinition?.name ?? 'Unknown',
      trophyName: cs.trophyName,
      trophyDonor: cs.trophyDonor,
      prizeDescription: cs.prizeDescription,
    });
    classSponsorsByShowSponsor.set(cs.showSponsorId, list);
    }
  }

  const sponsors: ScheduleSponsor[] = showSponsors.map((ss) => ({
    name: ss.sponsor.name,
    tier: ss.tier,
    customTitle: ss.customTitle,
    logoUrl: ss.sponsor.logoUrl,
    website: ss.sponsor.website,
    specialPrizes: ss.specialPrizes,
    classSponsorships: classSponsorsByShowSponsor.get(ss.id) ?? [],
  }));

  const showInfo: ScheduleShowInfo = {
    slug: show.slug,
    name: show.name,
    showType: show.showType,
    showScope: show.showScope ?? 'single_breed',
    date: show.startDate,
    endDate: show.endDate,
    startTime: show.startTime,
    entriesOpenDate: show.entriesOpenDate,
    entryCloseDate: show.entryCloseDate,
    postalCloseDate: show.postalCloseDate,
    kcLicenceNo: show.kcLicenceNo,
    secretaryEmail: show.secretaryEmail,
    secretaryName: show.secretaryName,
    secretaryAddress: show.secretaryAddress,
    secretaryPhone: show.secretaryPhone,
    showOpenTime: show.showOpenTime,
    onCallVet: show.onCallVet,
    description: show.description,
    firstEntryFee: show.firstEntryFee,
    subsequentEntryFee: show.subsequentEntryFee,
    nfcEntryFee: show.nfcEntryFee,
    juniorHandlerFee: show.juniorHandlerFee ?? null,
    multiDogThreshold: show.multiDogThreshold ?? null,
    multiDogPackagePence: show.multiDogPackagePence ?? null,
    regionalFeeConfig:
      (show as { regionalFeeConfig?: RegionalFeeConfig | null }).regionalFeeConfig ?? null,
    discountGroups: discountGroups.map((g) => ({
      label: g.label,
      firstEntryFeePence: g.firstEntryFeePence,
      multiDogPackagePence: g.multiDogPackagePence,
    })),
    acceptsPostalEntries: show.acceptsPostalEntries ?? false,
    sundryItems: sundryItemRows
      .filter((s) => s.enabled)
      .map((s) => ({
        name: s.name,
        description: s.description,
        priceInPence: s.priceInPence,
      })),
    showRuleset: (show as { showRuleset?: 'rkc' | 'wusv' }).showRuleset,
    breedName: (show as { breed?: { name?: string | null } }).breed?.name ?? null,
    scheduleData: show.scheduleData as ScheduleShowInfo['scheduleData'],
    organisation: show.organisation ? {
      name: show.organisation.name,
      contactEmail: show.organisation.contactEmail,
      contactPhone: show.organisation.contactPhone,
      website: show.organisation.website,
      logoUrl: show.organisation.logoUrl,
      logoColorPrimary: (show.organisation as { logoColorPrimary?: string | null }).logoColorPrimary ?? null,
      logoColorSecondary: (show.organisation as { logoColorSecondary?: string | null }).logoColorSecondary ?? null,
      logoMonochrome: (show.organisation as { logoMonochrome?: boolean | null }).logoMonochrome ?? null,
    } : null,
    venue: show.venue ? {
      name: show.venue.name,
      address: show.venue.address,
      postcode: show.venue.postcode,
    } : null,
  };

  const ScheduleComponent = pickScheduleComponent(
    showInfo.showScope,
    showInfo.showRuleset ?? 'rkc',
  );

  // SV/WUSV: pre-bake the tonal-wash backgrounds from the org's brand
  // colours (memoised). The React render below stays synchronous.
  let washes: { cover: Buffer; inside: Buffer } | undefined;
  if (showInfo.showRuleset === 'wusv') {
    const { getTonalWash } = await import('./sv-tonal-wash');
    const primary = showInfo.organisation?.logoMonochrome
      ? null
      : showInfo.organisation?.logoColorPrimary ?? null;
    const secondary = showInfo.organisation?.logoMonochrome
      ? null
      : showInfo.organisation?.logoColorSecondary ?? null;
    const [cover, inside] = await Promise.all([
      getTonalWash(primary, secondary, 'cover'),
      getTonalWash(primary, secondary, 'inside'),
    ]);
    washes = { cover, inside };
  }

  // Same fit fallback as the HTTP schedule route — re-render at compact
  // density instead of shipping an orphaned extra page.
  const rawBuffer = await renderScheduleWithFit(
    ScheduleComponent as React.ComponentType<Record<string, unknown>>,
    {
      show: showInfo,
      classes,
      judges,
      sponsors,
      adverts,
      panelJudges,
      washes,
    },
    designedSchedulePageCount(showInfo.showRuleset ?? 'rkc', adverts),
  );
  // Strip react-pdf's unembedded base-14 phantom font refs (Helvetica etc.)
  // before this goes to print — mirrors the /api/schedule route so both
  // schedule render paths pass the same print-preflight bar.
  return Buffer.from(await stripUnembeddedBase14Fonts(rawBuffer));
}

// ── Ring Board PDF ──

export async function generateRingBoardPdf(showId: string): Promise<Buffer> {
  const show = await db.query.shows.findFirst({
    where: eq(schema.shows.id, showId),
    with: { organisation: true, venue: true },
  });

  if (!show) throw new Error(`Show ${showId} not found`);

  const [rings, judgeAssignments, showClasses, entryCountRows] = await Promise.all([
    db.query.rings.findMany({
      where: eq(schema.rings.showId, showId),
      orderBy: [asc(schema.rings.number)],
    }),
    db.query.judgeAssignments.findMany({
      where: eq(schema.judgeAssignments.showId, showId),
      with: { judge: true, breed: true, ring: true },
    }),
    db.query.showClasses.findMany({
      where: eq(schema.showClasses.showId, showId),
      with: { classDefinition: true, breed: true },
      orderBy: [asc(schema.showClasses.sortOrder), asc(schema.showClasses.classNumber)],
    }),
    db.select({
      showClassId: schema.entryClasses.showClassId,
      count: sql<number>`count(*)`,
    })
      .from(schema.entryClasses)
      .innerJoin(schema.entries, eq(schema.entryClasses.entryId, schema.entries.id))
      .where(
        and(
          eq(schema.entries.showId, showId),
          eq(schema.entries.status, 'confirmed'),
          isNull(schema.entries.deletedAt)
        )
      )
      .groupBy(schema.entryClasses.showClassId),
  ]);

  const entryCountMap = new Map<string, number>();
  for (const row of entryCountRows) {
    entryCountMap.set(row.showClassId, Number(row.count));
  }

  // Build ring→judge, breed→ring maps
  const breedRingMap = new Map<string | null, string>();
  const ringJudgeMap = new Map<string, string>();
  for (const ja of judgeAssignments) {
    if (ja.breedId && ja.ringId) breedRingMap.set(ja.breedId, ja.ringId);
    if (ja.ringId && ja.judge?.name) ringJudgeMap.set(ja.ringId, ja.judge.name);
  }

  const ringBoardLabelMap = buildClassLabelMap(showClasses, show.showRuleset);

  const ringData: RingBoardRing[] = rings.map((ring) => {
    const ringClasses = showClasses.filter((sc) => {
      const assignedRingId = sc.breedId ? breedRingMap.get(sc.breedId) : null;
      return assignedRingId === ring.id;
    });

    // Group classes by breed to match RingBoardRing.breeds shape
    const breedMap = new Map<string, {
      breedName: string | null;
      classes: { classLabel: string; className: string; sex: string | null; entryCount: number }[];
      totalEntries: number;
    }>();
    for (const sc of ringClasses) {
      const breedKey = sc.breed?.name ?? '__unspecified__';
      if (!breedMap.has(breedKey)) {
        breedMap.set(breedKey, {
          breedName: sc.breed?.name ?? null,
          classes: [],
          totalEntries: 0,
        });
      }
      const entryCount = entryCountMap.get(sc.id) ?? 0;
      const grp = breedMap.get(breedKey)!;
      grp.classes.push({
        classLabel: ringBoardLabelMap.get(sc.id) ?? '',
        className: sc.classDefinition?.name ?? '',
        sex: sc.sex,
        entryCount,
      });
      grp.totalEntries += entryCount;
    }

    return {
      ringNumber: ring.ringNumber,
      judgeName: ringJudgeMap.get(ring.id) ?? null,
      breeds: Array.from(breedMap.values()),
    };
  });

  const showInfo: RingBoardShowInfo = {
    name: show.name,
    showType: show.showType,
    date: show.startDate,
    venue: show.venue?.name ?? null,
    organisation: show.organisation?.name ?? null,
    logoUrl: show.organisation?.logoUrl ?? null,
  };

  const pdfDocument = React.createElement(RingBoard, {
    show: showInfo,
    rings: ringData,
  });
  return Buffer.from(await renderToBuffer(pdfDocument));
}

// ── Ring Numbers PDF ──

export async function generateRingNumbersPdf(
  showId: string,
  format: RingNumberFormat = 'multi-up'
): Promise<Buffer> {
  const show = await db.query.shows.findFirst({
    where: eq(schema.shows.id, showId),
    with: { organisation: true },
  });
  if (!show) throw new Error(`Show ${showId} not found`);

  const entries = await db.query.entries.findMany({
    where: and(
      eq(schema.entries.showId, showId),
      eq(schema.entries.status, 'confirmed'),
      isNull(schema.entries.deletedAt),
    ),
    columns: { catalogueNumber: true },
    orderBy: [asc(schema.entries.catalogueNumber)],
  });

  const numbers = entries
    .map((e) => e.catalogueNumber)
    .filter((n): n is string => n != null && n.trim() !== '')
    .map((n) => parseInt(n, 10))
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b);

  if (numbers.length === 0) {
    throw new Error('No catalogue numbers found — assign catalogue numbers before generating ring numbers');
  }

  const showInfo: RingNumberShowInfo = {
    name: show.name,
  };

  const pdfDocument = React.createElement(RingNumbersComponent, {
    show: showInfo,
    numbers,
    format,
  });

  return Buffer.from(await renderToBuffer(pdfDocument));
}

// ── Prize Cards A3 4-up (Mixam flyer model) ──

const PRIZE_CARD_TEMPLATES = [
  'public/prize-cards/1-first.jpg',
  'public/prize-cards/2-second.jpg',
  'public/prize-cards/3-third.jpg',
  'public/prize-cards/4-reserve.jpg',
] as const;

const PLACEMENT_COLOURS = ['#8A0F25', '#12315A', '#6B5A1A', '#104A22'] as const;

// Trimmed A3 landscape @ 300 DPI
const A3_W = 4960;
const A3_H = 3508;
const CARD_SLOT_W = A3_W / 2; // 2480
const CARD_SLOT_H = A3_H / 2; // 1754
const TEMPLATE_W = 2480;
const TEMPLATE_H = 1766;
const LOGO_HEIGHT = 280;
// 3mm bleed (standard Mixam requirement): 3 × (300/25.4) ≈ 35px
const BLEED_PX = 35;

function buildOverlaySvg(opts: {
  orgName: string;
  showName: string;
  dateStr: string;
  judgeName: string | null;
  placementColour: string;
}): Buffer {
  const { orgName, showName, dateStr, judgeName, placementColour } = opts;
  const cx = TEMPLATE_W / 2;
  const judgeText = judgeName
    ? `<text x="${cx}" y="1055" class="judgeName">Judge: ${escapeXml(judgeName)}</text>`
    : '';
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${TEMPLATE_W}" height="${TEMPLATE_H}">
      <style>
        .clubName { font-family: 'Times New Roman', serif; font-weight: 700; font-size: 82px; fill: #1a1a1a; text-anchor: middle; letter-spacing: 1px; }
        .showName { font-family: 'Times New Roman', serif; font-style: italic; font-size: 60px; fill: #333; text-anchor: middle; }
        .showDate { font-family: 'Times New Roman', serif; font-size: 50px; fill: #555; text-anchor: middle; letter-spacing: 2px; }
        .judgeName { font-family: 'Times New Roman', serif; font-style: italic; font-size: 58px; fill: #444; text-anchor: middle; }
        .divider { stroke: ${placementColour}; stroke-width: 2; opacity: 0.5; }
      </style>
      <text x="${cx}" y="760" class="clubName">${escapeXml(orgName)}</text>
      <line x1="${cx - 500}" y1="810" x2="${cx + 500}" y2="810" class="divider" />
      <text x="${cx}" y="895" class="showName">${escapeXml(showName)}</text>
      <text x="${cx}" y="975" class="showDate">${escapeXml(dateStr)}</text>
      ${judgeText}
    </svg>`);
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatShowDate(isoDate: string): string {
  return format(parseISO(isoDate), 'EEEE d MMMM yyyy'); // "Saturday 4 July 2026"
}

async function composeOneCard(
  templatePath: string,
  placementIdx: number,
  overlayOpts: Omit<Parameters<typeof buildOverlaySvg>[0], 'placementColour'>,
  logoBuffer: Buffer | null,
): Promise<Buffer> {
  const svg = buildOverlaySvg({ ...overlayOpts, placementColour: PLACEMENT_COLOURS[placementIdx] });
  const composites: sharp.OverlayOptions[] = [];

  if (logoBuffer) {
    const resizedLogo = await sharp(logoBuffer)
      .resize({ height: LOGO_HEIGHT, fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer();
    const { width: lw = LOGO_HEIGHT } = await sharp(resizedLogo).metadata();
    composites.push({ input: resizedLogo, top: 420, left: Math.round((TEMPLATE_W - lw) / 2) });
  }

  composites.push({ input: svg, top: 0, left: 0 });

  return sharp(templatePath).composite(composites).toBuffer();
}

/**
 * Generates an A3 landscape 4-up prize card sheet (JPEG, 300 DPI, +3mm bleed)
 * suitable for uploading to Mixam as flyer artwork. Returns a JPEG Buffer.
 */
export async function generatePrizeCardsA3Jpeg(showId: string): Promise<Buffer> {
  const show = await db.query.shows.findFirst({
    where: eq(schema.shows.id, showId),
    with: { organisation: true },
  });
  if (!show) throw new Error(`Show ${showId} not found`);

  const judgeAssignments = await db.query.judgeAssignments.findMany({
    where: eq(schema.judgeAssignments.showId, showId),
    with: { judge: true },
  });

  const uniqueNames = [...new Set(
    judgeAssignments.map((ja) => ja.judge?.name).filter((n): n is string => !!n)
  )];
  const judgeName = uniqueNames.length === 1 ? uniqueNames[0] : uniqueNames.length > 1 ? 'Various Judges' : null;

  // Fetch club logo if present. Guarded — organisations.logo_url is
  // secretary-supplied free text, so a bare fetch() here is an SSRF sink
  // (lib/safe-image-fetch.ts). Returns null on anything suspicious and the
  // card simply renders without a logo.
  let logoBuffer: Buffer | null = null;
  const logoUrl = show.organisation?.logoUrl;
  if (logoUrl) {
    logoBuffer = await fetchClubImage(logoUrl);
  }

  const overlayOpts = {
    orgName: show.organisation?.name ?? '',
    showName: show.name,
    dateStr: formatShowDate(show.startDate),
    judgeName,
  };

  const cards = await Promise.all(
    PRIZE_CARD_TEMPLATES.map((tpl, i) =>
      composeOneCard(path.join(process.cwd(), tpl), i, overlayOpts, logoBuffer)
    )
  );

  const resized = await Promise.all(
    cards.map((buf) =>
      sharp(buf).resize(CARD_SLOT_W, CARD_SLOT_H, { fit: 'cover', position: 'top' }).png().toBuffer()
    )
  );

  const canvasW = A3_W + BLEED_PX * 2;
  const canvasH = A3_H + BLEED_PX * 2;

  const sheet = await sharp({
    create: { width: canvasW, height: canvasH, channels: 3, background: '#ffffff' },
  })
    .composite([
      { input: resized[0], left: BLEED_PX, top: BLEED_PX },
      { input: resized[1], left: BLEED_PX + CARD_SLOT_W, top: BLEED_PX },
      { input: resized[2], left: BLEED_PX, top: BLEED_PX + CARD_SLOT_H },
      { input: resized[3], left: BLEED_PX + CARD_SLOT_W, top: BLEED_PX + CARD_SLOT_H },
    ])
    // Embed 300 DPI in JFIF headers so Mixam's resolution checker recognises the spec.
    .withMetadata({ density: 300 })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();

  return sheet;
}

// ── Upload helper for print pipeline ──

export async function generateAndUploadForPrint(
  showId: string,
  documentType: string,
  documentFormat?: string
): Promise<{ storageKey: string; publicUrl: string }> {
  const timestamp = Date.now();
  const formatSuffix = documentFormat ? `-${documentFormat}` : '';

  // Prize cards use the sharp-based A3 4-up compositor (JPEG artwork for Mixam).
  // All other types generate PDFs via @react-pdf/renderer.
  if (documentType === 'prize_cards') {
    const jpegBuf = await generatePrizeCardsA3Jpeg(showId);
    const storageKey = `print-orders/${showId}/prize_cards${formatSuffix}-${timestamp}.jpg`;
    await uploadToR2(storageKey, jpegBuf, 'image/jpeg');
    return { storageKey, publicUrl: getPublicUrl(storageKey) };
  }

  let buffer: Buffer;
  switch (documentType) {
    case 'catalogue':
      buffer = await generateCataloguePdf(showId, (documentFormat as 'standard' | 'by-class') ?? 'standard');
      break;
    case 'schedule':
      buffer = await generateSchedulePdf(showId);
      break;
    case 'ring_board':
      buffer = await generateRingBoardPdf(showId);
      break;
    case 'ring_numbers':
      buffer = await generateRingNumbersPdf(showId);
      break;
    default:
      throw new Error(`Unsupported document type: ${documentType}`);
  }

  const storageKey = `print-orders/${showId}/${documentType}${formatSuffix}-${timestamp}.pdf`;
  await uploadToR2(storageKey, buffer, 'application/pdf');
  return { storageKey, publicUrl: getPublicUrl(storageKey) };
}
