/**
 * Catalogue rendering, split into two phases so the heavy PDF render can run
 * off the web request process (2026-08-26 — a catalogue render OOM-killed
 * the single prod web instance mid-entries).
 *
 *   buildCatalogueSnapshot(db, showId)   — queries the DB ONCE, at enqueue
 *     time, and freezes everything the render needs into a plain-JSON-safe
 *     object. This is the "closed-show snapshot": once captured, the render
 *     can happen any time later without touching the DB again, and two
 *     enqueues of an unchanged show produce byte-identical snapshots
 *     (see computeSnapshotHash) so they dedupe onto the same job.
 *
 *   renderCatalogueFromSnapshot(snapshot, format) — pure(ish) function from
 *     snapshot + format to a finished PDF Buffer. Runs in the worker
 *     process, never in a web request handler.
 *
 * The snapshot is intentionally format-independent — it captures every
 * confirmed entry with enough detail (both dogName variants, per-class
 * absence/result/transfer) that ANY of the 5 catalogue formats can be
 * rendered from the same snapshot. This mirrors (and was extracted from)
 * `/api/catalogue/[showId]/[format]/route.ts`'s data-building — that route
 * now enqueues instead of rendering; see `catalogue-jobs.ts`.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { and, eq, isNull, asc, inArray } from 'drizzle-orm';
import type { Database } from '@/server/db';
import * as schema from '@/server/db/schema';
import { publicOrgColumns } from '@/server/trpc/public-org-columns';
import { getPaidOrderIdsForShow } from '@/server/services/show-metrics';
import { formatDogName, formatDogNameForCatalogue } from '@/lib/utils';
import { appendRegistrationFlags } from '@/lib/registration-flags';
import { fetchPdfSafeImage } from '@/lib/safe-image-fetch';
import { syncCatalogueNumbers } from '@/server/services/catalogue-numbering';
import { getDockingStatementFromScheduleData } from '@/lib/rkc-compliance';
import { buildClassLabelMap, buildCatalogueClassDefinitions } from '@/lib/class-labels';
import { buildScheduleJudges, aggregateJudgeAssignments } from '@/lib/schedule-judges';
import { prepareAdvertsForRender } from '@/lib/advert-orientation';
import { padPdfToMultiple, stripUnembeddedBase14Fonts } from '@/lib/pdf-pad';
import { getTonalWash } from '@/server/services/sv-tonal-wash';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { CatalogueAbsentees } from '@/components/catalogue/catalogue-absentees';
import { CatalogueByClass } from '@/components/catalogue/catalogue-by-class';
import { CatalogueByBreed } from '@/components/catalogue/catalogue-by-breed';
import { CatalogueMarked, transferDisplayLabel } from '@/components/catalogue/catalogue-marked';
import { CatalogueJudging } from '@/components/catalogue/catalogue-judging';
import { CatalogueRingside } from '@/components/catalogue/catalogue-ringside';
import type {
  CatalogueEntry,
  CatalogueShowInfo,
  ShowSponsorInfo,
  ShowClassInfo,
} from '@/components/catalogue/catalogue-types';
import type { MarkedResult, MarkedAchievement } from '@/components/catalogue/catalogue-marked';

export const CATALOGUE_FORMATS = ['standard', 'by-class', 'judging', 'absentees', 'marked'] as const;
export type CatalogueFormat = (typeof CATALOGUE_FORMATS)[number];

// ── Buffer <-> JSON marker ──────────────────────────────────────────────
// jsonb can't hold a Buffer; a plain `{type:'Buffer',data:[...]}` round trip
// works but bloats the row and requires guessing the shape back out. Instead
// every Buffer becomes an explicit marker object with a base64 string, and is
// revived to a real Buffer immediately before it's handed to react-pdf.

interface BufferMarker {
  __bufferBase64: string;
}

function toBufferMarker(buf: Buffer | null | undefined): BufferMarker | null {
  return buf ? { __bufferBase64: buf.toString('base64') } : null;
}

function fromBufferMarker(marker: BufferMarker | null | undefined): Buffer | null {
  return marker ? Buffer.from(marker.__bufferBase64, 'base64') : null;
}

type SnapshotShowSponsorInfo = Omit<ShowSponsorInfo, 'logoBuffer'> & {
  logoBuffer: BufferMarker | null;
};

type SnapshotEntryClass = CatalogueEntry['classes'][number] & {
  absent: boolean;
  transferredToShowClassId: string | null;
  result: {
    placement: number | null;
    placementStatus: 'withheld' | 'unplaced' | null;
    specialAward: string | null;
  } | null;
};

export interface SnapshotEntry extends Omit<CatalogueEntry, 'dogName' | 'classes'> {
  orderId: string | null;
  dogNameStandard: string | null;
  dogNameKc: string | null;
  classes: SnapshotEntryClass[];
}

/** Everything in CatalogueShowInfo EXCEPT the two fields that need reviving
 *  (showSponsors' logo buffers) or recomputing (svWashes) at render time. */
type SnapshotShowInfoBase = Omit<CatalogueShowInfo, 'showSponsors' | 'svWashes'>;

export interface CatalogueSnapshot {
  version: 1;
  showId: string;
  showInfoBase: SnapshotShowInfoBase;
  showSponsors: SnapshotShowSponsorInfo[];
  entries: SnapshotEntry[];
  achievements: MarkedAchievement[];
  paidOrderIds: string[];
  /** showClassId -> "Transferred to X" target label, for every class in the
   *  show (a superset of the ones actually referenced by a transfer). */
  transferLabelByShowClassId: Record<string, string>;
  /** Org brand colours for the WUSV tonal-wash cover — recomputed at render
   *  time via getTonalWash() rather than storing the rendered wash buffers,
   *  since only WUSV shows need it and it's cheap to redo. */
  orgColors: { primary: string | null; secondary: string | null; monochrome: boolean } | null;
  meta: {
    showStatus: string;
    catalogueNumbersLockedAt: string | null;
    entryCloseDate: string | null;
    capturedAt: string;
    rendererGitSha: string;
  };
}

// ── Renderer identity ────────────────────────────────────────────────────

let cachedGitSha: string | null = null;

/** The commit this render pipeline is running from — folded into the
 *  snapshot hash so a new deploy never dedupes onto a job rendered by the
 *  previous version of the renderer. Render sets RENDER_GIT_COMMIT; falls
 *  back to `git rev-parse HEAD` for local/dev, then 'unknown'. */
export function getRendererGitSha(): string {
  if (cachedGitSha) return cachedGitSha;
  if (process.env.RENDER_GIT_COMMIT) {
    cachedGitSha = process.env.RENDER_GIT_COMMIT;
    return cachedGitSha;
  }
  try {
    cachedGitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: process.cwd() }).toString().trim();
  } catch {
    cachedGitSha = 'unknown';
  }
  return cachedGitSha;
}

// ── Canonical JSON + hash ────────────────────────────────────────────────

/** Deterministic stringify — object keys sorted recursively — so the same
 *  underlying data always hashes the same regardless of build-order. */
function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalStringify(v)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${canonicalStringify((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** sha256 of the snapshot's canonical JSON, EXCLUDING `meta.capturedAt` —
 *  two enqueues of an unchanged show a minute apart must hash identically
 *  so the second one dedupes onto the first's job. */
export function computeSnapshotHash(snapshot: CatalogueSnapshot): string {
  const { meta, ...rest } = snapshot;
  const stableMeta = { ...meta, capturedAt: undefined };
  return createHash('sha256').update(canonicalStringify({ ...rest, meta: stableMeta })).digest('hex');
}

// ── Build ────────────────────────────────────────────────────────────────

export async function buildCatalogueSnapshot(db: Database, showId: string): Promise<CatalogueSnapshot> {
  const show = await db.query.shows.findFirst({
    where: eq(schema.shows.id, showId),
    with: { organisation: { columns: publicOrgColumns }, venue: true },
  });
  if (!show) throw new Error(`Show ${showId} not found`);

  // Auto-assign catalogue numbers in class order if the show doesn't have
  // any yet — mirrors the route's UX (opening/enqueuing a catalogue just
  // works). Never resorts an already-numbered show out from under a
  // secretary who is mid-print.
  await syncCatalogueNumbers(db, showId, { allowResort: false });

  const paidOrderIds = await getPaidOrderIdsForShow(db, showId);

  const [judgeAssignmentRows, showClassRows, entries, safeLogoUrl, showSponsorRows, achievementRows, catalogueAdvertRows] =
    await Promise.all([
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
      // The full confirmed, non-deleted entry set — a superset of every
      // format's needs. `absentees` is derived at render time by filtering
      // this set the same way paidConfirmedAbsentNonJhWhere would.
      db.query.entries.findMany({
        where: and(eq(schema.entries.showId, showId), eq(schema.entries.status, 'confirmed'), isNull(schema.entries.deletedAt)),
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
            with: { showClass: { with: { classDefinition: true } }, result: true },
          },
        },
        orderBy: [asc(schema.entries.catalogueNumber)],
      }),
      (async () => {
        const { validateRasterLogoUrl } = await import('@/lib/pdf-utils');
        return validateRasterLogoUrl(show.organisation?.logoUrl);
      })(),
      db.query.showSponsors.findMany({
        where: eq(schema.showSponsors.showId, showId),
        with: { sponsor: true },
        orderBy: [asc(schema.showSponsors.displayOrder)],
      }),
      db.query.achievements.findMany({
        where: eq(schema.achievements.showId, showId),
        with: { dog: { with: { breed: true } } },
      }),
      db.query.catalogueAdverts.findMany({
        where: and(
          eq(schema.catalogueAdverts.showId, showId),
          inArray(schema.catalogueAdverts.document, ['catalogue', 'both']),
        ),
        orderBy: [asc(schema.catalogueAdverts.sortOrder)],
      }),
    ]);

  const showDonationRows = await db.query.showDonations.findMany({
    where: eq(schema.showDonations.showId, showId),
    orderBy: [asc(schema.showDonations.displayOrder), asc(schema.showDonations.createdAt)],
  });

  const judgesByBreedName: Record<string, string> = {};
  const judgeBios: Record<string, string> = {};
  const judgePhotos: Record<string, string> = {};
  const judgeRingNumbers: Record<string, string> = {};
  for (const ja of judgeAssignmentRows) {
    if (!ja.judge?.name) continue;
    if (ja.judge.bio && !judgeBios[ja.judge.name]) judgeBios[ja.judge.name] = ja.judge.bio;
    if (ja.judge.photoUrl && !judgePhotos[ja.judge.name]) judgePhotos[ja.judge.name] = ja.judge.photoUrl;
    if (ja.breed?.name) {
      judgesByBreedName[ja.breed.name] = ja.judge.name;
      if (ja.ring?.number) judgeRingNumbers[ja.breed.name] = String(ja.ring.number);
    }
  }

  const { entries: catJudgeEntries, specialAwardsJudges: catSpecialAwardsJudges } =
    aggregateJudgeAssignments(judgeAssignmentRows);
  const catHasJuniorHandlerClasses = showClassRows.some((sc) => sc.classDefinition?.type === 'junior_handler');
  const judgeDisplayList = buildScheduleJudges(catJudgeEntries.values(), catSpecialAwardsJudges, catHasJuniorHandlerClasses)
    .map((j) => j.displayLabel)
    .filter((label): label is string => !!label);

  const classDefinitions = buildCatalogueClassDefinitions(showClassRows);
  const classLabelMap = buildClassLabelMap(showClassRows, show.showRuleset);

  const classSponsorships: NonNullable<CatalogueShowInfo['classSponsorships']> = [];
  for (const sc of showClassRows) {
    for (const cs of sc.classSponsorships ?? []) {
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

  // Every show class's transfer-target label, keyed by id — a superset of
  // whatever a transfer actually points at, computed once here instead of a
  // second targeted query (route.ts's approach) since we already have every
  // class in memory.
  const transferLabelByShowClassId: Record<string, string> = {};
  for (const sc of showClassRows) {
    transferLabelByShowClassId[sc.id] = transferDisplayLabel(sc.classDefinition?.name ?? 'another class');
  }

  const snapshotEntries: SnapshotEntry[] = entries.map((entry) => {
    const dogNameStandard = appendRegistrationFlags(entry.dog ? formatDogName(entry.dog) : null, entry);
    const dogNameKc = appendRegistrationFlags(entry.dog ? formatDogNameForCatalogue(entry.dog) : null, entry);
    return {
      catalogueNumber: entry.catalogueNumber,
      orderId: entry.orderId,
      dogNameStandard,
      dogNameKc,
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
            workingTitle: entry.dog.svProfile.workingTitle ?? null,
            bh: entry.dog.svProfile.bh ?? false,
            ad: entry.dog.svProfile.ad ?? false,
            wb: entry.dog.svProfile.wb ?? false,
            otherQualifications: entry.dog.svProfile.otherQualifications ?? null,
          }
        : null,
      colour: entry.dog?.colour,
      sire: entry.dog?.sireName,
      dam: entry.dog?.damName,
      breeder: entry.dog?.breederName,
      breederCity: (entry.dog as { breederCity?: string | null })?.breederCity ?? null,
      breederPostcode: (entry.dog as { breederPostcode?: string | null })?.breederPostcode ?? null,
      titles: entry.dog?.titles?.map((t) => t.title).filter(Boolean) ?? [],
      owners:
        entry.dog?.owners?.map((o) => ({
          title: o.ownerTitle,
          name: o.ownerName,
          address: o.ownerAddress,
          userId: o.userId,
        })) ?? [],
      exhibitorId: entry.exhibitorId,
      handler: entry.handler?.name,
      exhibitor: entry.exhibitor?.name,
      status: entry.status,
      entryType: entry.entryType,
      isNfc: entry.isNfc,
      jhHandlerName: entry.juniorHandlerDetails?.handlerName ?? undefined,
      withholdFromPublication: entry.withholdFromPublication,
      classes: entry.entryClasses.map((ec) => ({
        name: ec.showClass?.classDefinition?.name,
        sex: ec.showClass?.sex,
        classNumber: ec.showClass?.classNumber,
        classLabel: ec.showClass?.id ? classLabelMap.get(ec.showClass.id) : undefined,
        sortOrder: ec.showClass?.sortOrder,
        showClassId: ec.showClassId,
        svCoatType: (ec.showClass as { svCoatType?: 'stock' | 'long_stock' | null } | undefined)?.svCoatType ?? null,
        classDefinitionType: ec.showClass?.classDefinition?.type ?? null,
        absent: ec.absent,
        transferredToShowClassId: (ec as { transferredToShowClassId?: string | null }).transferredToShowClassId ?? null,
        result: ec.result
          ? {
              placement: ec.result.placement,
              placementStatus:
                ec.result.placementStatus === 'withheld' || ec.result.placementStatus === 'unplaced'
                  ? ec.result.placementStatus
                  : null,
              specialAward: ec.result.specialAward,
            }
          : null,
      })),
    };
  });

  const showSponsorInfos: SnapshotShowSponsorInfo[] = await Promise.all(
    showSponsorRows.map(async (ss) => ({
      name: ss.sponsor.name,
      tier: ss.tier,
      logoUrl: ss.sponsor.logoUrl,
      website: ss.sponsor.website,
      customTitle: ss.customTitle,
      logoBuffer: toBufferMarker(
        ss.tier === 'show' && ss.sponsor.logoUrl ? await fetchPdfSafeImage(ss.sponsor.logoUrl) : null,
      ),
    })),
  );

  const allShowClasses: ShowClassInfo[] = showClassRows.map((sc) => ({
    className: sc.classDefinition?.name ?? 'Unknown Class',
    classNumber: sc.classNumber,
    classLabel: classLabelMap.get(sc.id) ?? '',
    sortOrder: sc.sortOrder,
    sex: sc.sex,
    svCoatType: (sc as { svCoatType?: 'stock' | 'long_stock' | null }).svCoatType ?? null,
    classDefinitionType: sc.classDefinition?.type ?? null,
  }));

  const scheduleData = show.scheduleData;

  const advertsForCatalogue = await prepareAdvertsForRender(
    catalogueAdvertRows.map((ad) => ({
      id: ad.id,
      advertiserName: ad.advertiserName,
      position: ad.position,
      imageUrl: ad.imageUrl,
      sortOrder: ad.sortOrder,
    })),
  );

  const achievements: MarkedAchievement[] = achievementRows.map((a) => ({
    type: a.type,
    dogName: a.dog?.registeredName ?? 'Unknown',
    breedName: a.dog?.breed?.name ?? null,
  }));

  const showInfoBase: SnapshotShowInfoBase = {
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
    wetWeatherAccommodation:
      scheduleData?.wetWeatherAccommodation === true ? true : scheduleData?.wetWeatherAccommodation === false ? false : undefined,
    judgedOnGroupSystem: scheduleData?.judgedOnGroupSystem === true ? true : undefined,
    judgesByBreedName,
    judgeDisplayList: judgeDisplayList.length > 0 ? judgeDisplayList : undefined,
    judgeBios: Object.keys(judgeBios).length > 0 ? judgeBios : undefined,
    judgePhotos: Object.keys(judgePhotos).length > 0 ? judgePhotos : undefined,
    judgeRingNumbers: Object.keys(judgeRingNumbers).length > 0 ? judgeRingNumbers : undefined,
    classDefinitions,
    showScope: show.showScope ?? undefined,
    classSponsorships: classSponsorships.length > 0 ? classSponsorships : undefined,
    skipTrophiesPage: classSponsorships.length > 0,
    customStatements: scheduleData?.customStatements,
    donations: showDonationRows.length > 0 ? showDonationRows.map((d) => ({ name: d.donorName, affix: d.affix })) : undefined,
    allShowClasses: allShowClasses.length > 0 ? allShowClasses : undefined,
    welcomeNote: scheduleData?.welcomeNote,
    outsideAttraction: scheduleData?.outsideAttraction === true ? true : undefined,
    showManager: scheduleData?.showManager,
    firstAiders: scheduleData?.firstAiders,
    dockingStatement: getDockingStatementFromScheduleData(scheduleData),
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

  const orgRow = show.organisation as
    | { logoColorPrimary?: string | null; logoColorSecondary?: string | null; logoMonochrome?: boolean | null }
    | null
    | undefined;

  return {
    version: 1,
    showId,
    showInfoBase,
    showSponsors: showSponsorInfos,
    entries: snapshotEntries,
    achievements,
    paidOrderIds,
    transferLabelByShowClassId,
    orgColors: orgRow
      ? {
          primary: orgRow.logoMonochrome ? null : orgRow.logoColorPrimary ?? null,
          secondary: orgRow.logoMonochrome ? null : orgRow.logoColorSecondary ?? null,
          monochrome: orgRow.logoMonochrome ?? false,
        }
      : null,
    meta: {
      showStatus: show.status,
      catalogueNumbersLockedAt: show.catalogueNumbersLockedAt
        ? new Date(show.catalogueNumbersLockedAt).toISOString()
        : null,
      entryCloseDate: show.entryCloseDate ? new Date(show.entryCloseDate).toISOString() : null,
      capturedAt: new Date().toISOString(),
      rendererGitSha: getRendererGitSha(),
    },
  };
}

// ── Render ───────────────────────────────────────────────────────────────

/** Mirrors report-queries.ts's `paidConfirmedAbsentNonJhWhere` in plain JS
 *  over the already-fetched snapshot entries, rather than re-querying. */
function isEligibleAbsentee(entry: SnapshotEntry, paidOrderIds: Set<string>): boolean {
  return (
    entry.orderId != null &&
    paidOrderIds.has(entry.orderId) &&
    entry.status === 'confirmed' &&
    entry.entryType !== 'junior_handler' &&
    entry.classes.some((c) => c.absent)
  );
}

/**
 * The format-dependent half of catalogue rendering: which entries are
 * eligible, whether dog names use KC formatting, and which classes show —
 * shared by the PDF render path below AND by the /api/catalogue route's
 * `?output=json` export, so the two can never present different data for
 * the same (show, format) again (the drift the JSON export used to risk by
 * duplicating this logic).
 */
export function materializeCatalogueEntries(
  snapshot: CatalogueSnapshot,
  format: CatalogueFormat,
): { showInfo: CatalogueShowInfo; entries: CatalogueEntry[]; filteredEntries: SnapshotEntry[] } {
  const paidOrderIdSet = new Set(snapshot.paidOrderIds);
  const filteredEntries =
    format === 'absentees' ? snapshot.entries.filter((e) => isEligibleAbsentee(e, paidOrderIdSet)) : snapshot.entries;

  const isAllBreed = snapshot.showInfoBase.showScope !== 'single_breed';
  const useKCFormat = format === 'marked' || (format === 'by-class' && isAllBreed);

  const catalogueEntries: CatalogueEntry[] = filteredEntries.map((entry) => ({
    ...entry,
    dogName: useKCFormat ? entry.dogNameKc : entry.dogNameStandard,
    classes: (format === 'absentees' ? entry.classes.filter((c) => c.absent) : entry.classes).map((c) => ({
      name: c.name,
      sex: c.sex,
      classNumber: c.classNumber,
      classLabel: c.classLabel,
      sortOrder: c.sortOrder,
      showClassId: c.showClassId,
      svCoatType: c.svCoatType,
      classDefinitionType: c.classDefinitionType,
    })),
  }));

  const revivedShowSponsors: ShowSponsorInfo[] = snapshot.showSponsors.map((s) => ({
    ...s,
    logoBuffer: fromBufferMarker(s.logoBuffer),
  }));

  const showInfo: CatalogueShowInfo = {
    ...snapshot.showInfoBase,
    showSponsors: revivedShowSponsors.length > 0 ? revivedShowSponsors : undefined,
  };

  return { showInfo, entries: catalogueEntries, filteredEntries };
}

export async function renderCatalogueFromSnapshot(
  snapshot: CatalogueSnapshot,
  format: CatalogueFormat,
): Promise<Buffer> {
  const { showInfo, entries: catalogueEntries, filteredEntries } = materializeCatalogueEntries(snapshot, format);
  const isAllBreed = snapshot.showInfoBase.showScope !== 'single_breed';

  // `ReactElement<any>` (not `unknown`) because the format components have
  // slightly different prop signatures (marked takes extra results/absentees
  // props) and `renderToBuffer`'s signature uses react-pdf's internal
  // DocumentProps type, which we don't import — mirrors the same cast the
  // route this was extracted from used, and pdf-generation.ts's own render calls.
  let pdfDocument: React.ReactElement<any>;

  if (format === 'marked') {
    const resultsMap = new Map<string, MarkedResult>();
    const absenteesSet = new Set<string>();
    const transfersMap = new Map<string, string>();
    for (const entry of filteredEntries) {
      for (const ec of entry.classes) {
        if (!entry.catalogueNumber) continue;
        const key = `${entry.catalogueNumber}-${ec.showClassId}`;
        if (ec.absent) absenteesSet.add(key);
        if (ec.transferredToShowClassId) {
          transfersMap.set(key, snapshot.transferLabelByShowClassId[ec.transferredToShowClassId] ?? 'another class');
        }
        if (ec.result) {
          resultsMap.set(key, {
            catalogueNumber: entry.catalogueNumber,
            showClassId: ec.showClassId as string,
            placement: ec.result.placement,
            placementStatus: ec.result.placementStatus,
            specialAward: ec.result.specialAward,
          });
        }
      }
    }

    pdfDocument = React.createElement(CatalogueMarked, {
      show: showInfo,
      entries: catalogueEntries,
      results: resultsMap,
      absentees: absenteesSet,
      achievements: snapshot.achievements,
      transfers: transfersMap,
    });
  } else {
    const formatComponents = {
      standard: CatalogueRingside,
      'by-class': isAllBreed ? CatalogueByBreed : CatalogueByClass,
      judging: CatalogueJudging,
      absentees: CatalogueAbsentees,
    } as const;

    const isWusv = showInfo.showRuleset === 'wusv';
    const effectiveFormat = isWusv ? 'by-class' : format;

    if (isWusv) {
      const [cover, inside] = await Promise.all([
        getTonalWash(snapshot.orgColors?.primary ?? null, snapshot.orgColors?.secondary ?? null, 'cover'),
        getTonalWash(snapshot.orgColors?.primary ?? null, snapshot.orgColors?.secondary ?? null, 'inside'),
      ]);
      showInfo.svWashes = { cover, inside };
    }

    const Component = formatComponents[effectiveFormat as keyof typeof formatComponents];
    pdfDocument = React.createElement(Component, { show: showInfo, entries: catalogueEntries });
  }

  const buffer = await renderToBuffer(pdfDocument);

  // Post-processing for ALL paths — previously only the HTTP route did
  // this, so a catalogue rendered via the print pipeline (generateAndUploadForPrint)
  // shipped with unembedded base-14 font refs. Every job render goes through here.
  const needsBookletPadding = format === 'standard' || format === 'by-class';
  return needsBookletPadding
    ? Buffer.from(await padPdfToMultiple(buffer, 4))
    : Buffer.from(await stripUnembeddedBase14Fonts(buffer));
}

export const CATALOGUE_FORMAT_LABELS: Record<CatalogueFormat, string> = {
  standard: 'Catalogue',
  'by-class': 'Catalogue-By-Class',
  judging: 'Steward-Catalogue',
  absentees: 'Absentees',
  marked: 'Marked-Catalogue',
};
