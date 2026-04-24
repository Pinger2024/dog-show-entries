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

  const classLabelMap = buildClassLabelMap(showClassRows);

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
      classLabel: ec.showClass?.id ? classLabelMap.get(ec.showClass.id) : undefined,
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

  const prizeCardLabelMap = buildClassLabelMap(showClasses);
  const classes: PrizeCardClass[] = showClasses.map((sc) => ({
    classLabel: prizeCardLabelMap.get(sc.id) ?? '',
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

  const ringBoardLabelMap = buildClassLabelMap(showClasses);

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

  // Fetch club logo if present
  let logoBuffer: Buffer | null = null;
  const logoUrl = show.organisation?.logoUrl;
  if (logoUrl) {
    try {
      const res = await fetch(logoUrl);
      if (res.ok) logoBuffer = Buffer.from(await res.arrayBuffer());
    } catch {
      // proceed without logo
    }
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
