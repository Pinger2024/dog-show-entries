/**
 * PDF Generation service — reusable functions for generating PDF buffers.
 *
 * Extracted from the API routes so the print pipeline can generate PDFs
 * server-side and upload them to R2 for Tradeprint.
 */

import { db } from '@/server/db';
import { and, eq, isNull, asc, sql } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { formatDogName, formatDogNameForCatalogue } from '@/lib/utils';
import { renderToBuffer, Document, Page, Text, StyleSheet } from '@react-pdf/renderer';
import { CatalogueRingside } from '@/components/catalogue/catalogue-ringside';
import { CatalogueByClass } from '@/components/catalogue/catalogue-by-class';
import { CatalogueByBreed } from '@/components/catalogue/catalogue-by-breed';
import type { CatalogueEntry, CatalogueShowInfo } from '@/components/catalogue/catalogue-types';
import { PrizeCards } from '@/components/prize-cards/prize-cards';
import type { PrizeCardShowInfo, PrizeCardClass } from '@/components/prize-cards/prize-cards';
import { ShowSchedule } from '@/components/schedule/show-schedule';
import type { ScheduleShowInfo, ScheduleClass, ScheduleJudge, ScheduleSponsor } from '@/components/schedule/show-schedule';
import { RingBoard } from '@/components/ring-board/ring-board';
import type { RingBoardShowInfo, RingBoardRing } from '@/components/ring-board/ring-board';
import { RingNumbers as RingNumbersComponent } from '@/components/ring-numbers/ring-numbers';
import type { RingNumberShowInfo, RingNumberFormat } from '@/components/ring-numbers/ring-numbers';
import React from 'react';
import { uploadToR2, getPublicUrl } from '@/server/services/storage';
import { getDockingStatementFromScheduleData } from '@/lib/rkc-compliance';
import { buildClassLabelMap } from '@/lib/class-labels';

// ── Catalogue PDF ──

export async function generateCataloguePdf(
  showId: string,
  format: 'standard' | 'by-class' = 'standard'
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
  const [judgeAssignmentRows, showClassRows, entries, showSponsorRows] = await Promise.all([
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
  ]);

  const judgesByBreedName: Record<string, string> = {};
  const judgeBios: Record<string, string> = {};
  const judgePhotos: Record<string, string> = {};
  const judgeRingNumbers: Record<string, string> = {};
  const judgeDisplayList: string[] = []; // Sex-annotated: "Dogs — Mr A Winfrow"
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
  // Build sex-annotated display labels for catalogue front matter
  const seenJudgeKeys = new Set<string>();
  for (const ja of judgeAssignmentRows) {
    if (!ja.judge?.name) continue;
    const key = `${ja.judge.name}::${ja.sex ?? 'all'}`;
    if (seenJudgeKeys.has(key)) continue;
    seenJudgeKeys.add(key);
    const isJH = !ja.breed && ja.sex === null;
    const prefix = isJH ? 'Junior Handling' : ja.sex === 'dog' ? 'Dogs' : ja.sex === 'bitch' ? 'Bitches' : null;
    judgeDisplayList.push(prefix ? `${prefix} — ${ja.judge.name}` : ja.judge.name);
  }

  // Build class sponsorship list for the Trophies & Sponsorships page
  // AND the inline per-class sponsor lines. Mirrors route.ts so the two
  // pipelines produce the same catalogue for the same show.
  const classSponsorshipInfos: CatalogueShowInfo['classSponsorships'] = [];
  for (const sc of showClassRows) {
    for (const cs of sc.classSponsorships ?? []) {
      const sponsorName = cs.sponsorName ?? cs.showSponsor?.sponsor?.name ?? null;
      if (cs.trophyName || sponsorName || cs.prizeDescription) {
        classSponsorshipInfos.push({
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
    sortOrder: sc.sortOrder,
    sex: sc.sex,
  }));

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

  // The ringside-based "standard" format uses plain formatting; only the
  // Crufts-style by-breed layout (for all-breed shows under "by-class")
  // needs RKC catalogue formatting.
  const useKCFormat = format === 'by-class' && show.showScope !== 'single_breed';

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
    jhHandlerName: entry.juniorHandlerDetails?.handlerName ?? undefined,
    classes: entry.entryClasses.map((ec) => ({
      name: ec.showClass?.classDefinition?.name,
      sex: ec.showClass?.sex,
      classNumber: ec.showClass?.classNumber,
      sortOrder: ec.showClass?.sortOrder,
      showClassId: ec.showClassId,
    })),
    status: entry.status,
    entryType: entry.entryType,
    withholdFromPublication: entry.withholdFromPublication,
  }));

  // Drizzle gives us `ScheduleData | null` directly via the jsonb $type<>
  // annotation in the schema, so we can read fields without casts.
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
    allShowClasses: allShowClasses.length > 0 ? allShowClasses : undefined,
    customStatements: scheduleData?.customStatements,
    dockingStatement: getDockingStatementFromScheduleData(scheduleData),

    // Settings audit (backlog #85): wire schedule fields through to the
    // catalogue render pipeline so they actually appear in the PDF.
    welcomeNote: scheduleData?.welcomeNote,
    outsideAttraction: scheduleData?.outsideAttraction === true ? true : undefined,
    showManager: scheduleData?.showManager,
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

  const isAllBreed = show.showScope !== 'single_breed';
  const formatComponents = {
    standard: CatalogueRingside,
    'by-class': isAllBreed ? CatalogueByBreed : CatalogueByClass,
  } as const;

  const Component = formatComponents[format];
  const pdfDocument = React.createElement(Component, { show: showInfo, entries: catalogueEntries });
  return Buffer.from(await renderToBuffer(pdfDocument));
}

// ── Prize Cards PDF ──

export async function generatePrizeCardsPdf(
  showId: string,
  options: { placements?: number; includeJudgeName?: boolean } = {}
): Promise<Buffer> {
  const { placements = 5, includeJudgeName = true } = options;

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
  for (const ja of judgeAssignments) {
    if (ja.judge?.name) judgeByBreed.set(ja.breedId, ja.judge.name);
  }

  const classes: PrizeCardClass[] = showClasses.map((sc) => ({
    classNumber: sc.classNumber,
    className: sc.classDefinition?.name ?? 'Unknown Class',
    sex: sc.sex,
    breedName: sc.breed?.name ?? null,
    judgeName: judgeByBreed.get(sc.breedId) ?? judgeByBreed.get(null) ?? null,
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
    cardStyle: 'filled' as const,
  });
  return Buffer.from(await renderToBuffer(pdfDocument));
}

// ── Schedule PDF ──

export async function generateSchedulePdf(showId: string): Promise<Buffer> {
  const show = await db.query.shows.findFirst({
    where: eq(schema.shows.id, showId),
    with: { organisation: true, venue: true },
  });

  if (!show) throw new Error(`Show ${showId} not found`);

  const [showClasses, judgeAssignments, showSponsors] = await Promise.all([
    db.query.showClasses.findMany({
      where: eq(schema.showClasses.showId, showId),
      with: {
        classDefinition: true,
        breed: true,
        classSponsorships: true,
      },
      orderBy: [asc(schema.showClasses.sortOrder), asc(schema.showClasses.classNumber)],
    }),
    db.query.judgeAssignments.findMany({
      where: eq(schema.judgeAssignments.showId, showId),
      with: { judge: true, breed: true },
    }),
    db.query.showSponsors.findMany({
      where: eq(schema.showSponsors.showId, showId),
      with: { sponsor: true },
    }),
  ]);

  // Build judges with sex-annotated display labels
  // Group by (name + sex) to preserve sex-split assignments
  const judgeKey = (name: string, sex: string | null) => `${name}::${sex ?? 'all'}`;
  const judgeEntries = new Map<string, { name: string; sex: string | null; breeds: string[]; isJH: boolean }>();
  for (const ja of judgeAssignments) {
    if (!ja.judge?.name) continue;
    const key = judgeKey(ja.judge.name, ja.sex);
    const existing = judgeEntries.get(key);
    // Detect Junior Handling: no breed, sex=null, and class names contain "handling"
    const isJH = !ja.breed && ja.sex === null;
    if (existing) {
      if (ja.breed?.name) existing.breeds.push(ja.breed.name);
    } else {
      judgeEntries.set(key, {
        name: ja.judge.name,
        sex: ja.sex,
        breeds: ja.breed?.name ? [ja.breed.name] : [],
        isJH,
      });
    }
  }

  // Build display labels: "Dogs — Mr A Winfrow" or "Junior Handling — Mandy McAteer"
  function sexPrefix(sex: string | null, isJH: boolean): string | null {
    if (isJH) return 'Junior Handling';
    if (sex === 'dog') return 'Dogs';
    if (sex === 'bitch') return 'Bitches';
    return null; // both sexes — no prefix needed
  }

  const judges: ScheduleJudge[] = [...judgeEntries.values()].map((j) => {
    const prefix = sexPrefix(j.sex, j.isJH);
    return {
      name: j.name,
      breeds: j.breeds,
      sex: j.sex,
      displayLabel: prefix ? `${prefix} — ${j.name}` : j.name,
    };
  });

  const classLabelMap = buildClassLabelMap(showClasses);
  const classes: ScheduleClass[] = showClasses.map((sc) => ({
    classNumber: sc.classNumber,
    classLabel: classLabelMap.get(sc.id) ?? '',
    className: sc.classDefinition?.name ?? 'Unknown',
    classDescription: sc.classDefinition?.description ?? null,
    sex: sc.sex,
    breedName: sc.breed?.name ?? null,
    classType: sc.classDefinition?.type ?? null,
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
    acceptsPostalEntries: show.acceptsPostalEntries ?? false,
    scheduleData: show.scheduleData as ScheduleShowInfo['scheduleData'],
    organisation: show.organisation ? {
      name: show.organisation.name,
      contactEmail: show.organisation.contactEmail,
      contactPhone: show.organisation.contactPhone,
      website: show.organisation.website,
      logoUrl: show.organisation.logoUrl,
    } : null,
    venue: show.venue ? {
      name: show.venue.name,
      address: show.venue.address,
      postcode: show.venue.postcode,
    } : null,
  };

  const pdfDocument = React.createElement(ShowSchedule, {
    show: showInfo,
    classes,
    judges,
    sponsors,
  });
  return Buffer.from(await renderToBuffer(pdfDocument));
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

  const ringData: RingBoardRing[] = rings.map((ring) => {
    const ringClasses = showClasses
      .filter((sc) => {
        const assignedRingId = sc.breedId ? breedRingMap.get(sc.breedId) : null;
        return assignedRingId === ring.id;
      })
      .map((sc) => ({
        classNumber: sc.classNumber,
        className: sc.classDefinition?.name ?? '',
        sex: sc.sex,
        breedName: sc.breed?.name ?? null,
        entryCount: entryCountMap.get(sc.id) ?? 0,
      }));

    return {
      ringNumber: ring.ringNumber,
      judgeName: ringJudgeMap.get(ring.id) ?? null,
      classes: ringClasses,
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

// ── Upload helper for print pipeline ──

export async function generateAndUploadForPrint(
  showId: string,
  documentType: string,
  documentFormat?: string
): Promise<{ storageKey: string; publicUrl: string }> {
  let buffer: Buffer;

  switch (documentType) {
    case 'catalogue':
      buffer = await generateCataloguePdf(showId, (documentFormat as 'standard' | 'by-class') ?? 'standard');
      break;
    case 'prize_cards':
      buffer = await generatePrizeCardsPdf(showId);
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

  const timestamp = Date.now();
  const formatSuffix = documentFormat ? `-${documentFormat}` : '';
  const storageKey = `print-orders/${showId}/${documentType}${formatSuffix}-${timestamp}.pdf`;

  await uploadToR2(storageKey, buffer, 'application/pdf');
  const publicUrl = getPublicUrl(storageKey);

  return { storageKey, publicUrl };
}
