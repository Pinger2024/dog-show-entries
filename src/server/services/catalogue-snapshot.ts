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
 *
 * 2026-08-27 — a SECOND OOM risk in this same file: buildCatalogueSnapshot()
 * used to fetch every advert's and show-sponsor's image BYTES and embed
 * them in the snapshot it just got done moving off the web process. A
 * 20-advert show produced a 13.2 MB snapshot ROW and a +530 MB memory spike
 * — in the web process, at enqueue time, which is exactly the process this
 * whole file exists to protect. The snapshot now carries plain URLs only
 * (adverts keep their `imageUrl`; sponsors carry `logoUrl`) — see
 * `hydrateSnapshotForRender()`, which fetches the bytes in the WORKER
 * process, immediately before the PDF is actually built, into a
 * non-persisted copy of the snapshot.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { and, eq, isNull, asc, inArray } from 'drizzle-orm';
import type { Database } from '@/server/db';
import * as schema from '@/server/db/schema';
// Type-only: src/lib/catalogue-preflight.ts is the single source of truth
// for this contract (the preflight module built alongside this one imports
// nothing back from here) — nothing from that module may run in the web
// bundle, so this import must stay `import type`.
import type { CatalogueSnapshotMeta } from '@/lib/catalogue-preflight';
import { publicOrgColumns } from '@/server/trpc/public-org-columns';
import { getPaidOrderIdsForShow } from '@/server/services/show-metrics';
import { formatDogName, formatDogNameForCatalogue } from '@/lib/utils';
import { appendRegistrationFlags } from '@/lib/registration-flags';
import { fetchPdfSafeImage } from '@/lib/safe-image-fetch';
import { syncCatalogueNumbers } from '@/server/services/catalogue-numbering';
import { getDockingStatementFromScheduleData } from '@/lib/rkc-compliance';
import { buildClassLabelMap, buildCatalogueClassDefinitions, sortEntryClassesByShowClassOrder } from '@/lib/class-labels';
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

// ── Legacy buffer marker (backward compat only) ─────────────────────────
// Before 2026-08-27, buildCatalogueSnapshot() fetched sponsor logo bytes
// itself and stored them as `{__bufferBase64}` (jsonb can't hold a raw
// Buffer). A document-render job enqueued before that date may still carry
// one of these on its persisted `snapshot` column — hydrateSnapshotForRender()
// below decodes it directly rather than re-fetching from `logoUrl`. Nothing
// written from here on ever produces one; this exists purely to read old rows.

interface BufferMarker {
  __bufferBase64: string;
}

function isLegacyBufferMarker(value: unknown): value is BufferMarker {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as { __bufferBase64?: unknown }).__bufferBase64 === 'string'
  );
}

function fromBufferMarker(marker: BufferMarker): Buffer {
  return Buffer.from(marker.__bufferBase64, 'base64');
}

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

/** Everything in CatalogueShowInfo EXCEPT the two fields that need
 *  hydrating (showSponsors' logo bytes) or recomputing (svWashes) at
 *  render time. */
type SnapshotShowInfoBase = Omit<CatalogueShowInfo, 'showSponsors' | 'svWashes'>;

export interface CatalogueSnapshot {
  version: 1;
  showId: string;
  showInfoBase: SnapshotShowInfoBase;
  /** As BUILT (buildCatalogueSnapshot), every sponsor here carries only
   *  `logoUrl` — `logoBuffer` is left unset, so the persisted row never
   *  carries image bytes. `logoBuffer` is populated ONLY on the
   *  non-persisted, render-time copy hydrateSnapshotForRender() returns.
   *  `ShowSponsorInfo.logoBuffer` being optional is what lets one type
   *  describe both states rather than needing a separate "hydrated" type. */
  showSponsors: ShowSponsorInfo[];
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
  meta: CatalogueSnapshotMeta;
}

/** The preflight module (src/lib/catalogue-preflight.ts) is the single
 *  source of truth for this contract — re-exported here so existing
 *  importers of `CatalogueSnapshotMeta` from this file keep working. Every
 *  field is read by at least one preflight check; see that module's doc
 *  comments for what each one feeds. */
export type { CatalogueSnapshotMeta };

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

/** sha256 of the snapshot's canonical JSON, EXCLUDING `meta` ENTIRELY
 *  (2026-08-28) — identity is the data the render is actually built from:
 *  `showInfoBase`, `entries`, `showSponsors`, `achievements`, etc. `meta` is
 *  bookkeeping (capture timestamps, renderer provenance) plus the preflight
 *  contract (showStatus, showRuleset, expectedNumbers, entryNames — all of
 *  it derived FROM `rest`, never independent data), so it can evolve —
 *  gain a field, have a value change — without invalidating a stored
 *  catalogue that would render byte-identically either way.
 *
 *  This now hashes advert/sponsor-logo URLS rather than image bytes (the
 *  snapshot no longer carries the bytes at all — see the file header). That
 *  is still a sound change-fingerprint: every upload — advert or logo —
 *  mints a fresh `randomUUID()` storage key (api/upload/presign/route.ts,
 *  judge-photo/route.ts), so a re-upload of "the same" artwork always
 *  produces a different URL. A URL changing IS the content changing; there
 *  is no case where the bytes change but the URL doesn't.
 *
 *  `meta.rendererGitSha` was excluded first (2026-08-27): the hash is the
 *  identity of the show's DATA, and a stored catalogue stays valid across
 *  deploys. With the SHA in the hash, every push changed every hash, so the
 *  hourly refresh sweep re-rendered every closed show after each deploy and
 *  a secretary's first View after a deploy waited for a render instead of
 *  downloading the file already on disk — the opposite of "store a finished
 *  version, download it". The SHA is still recorded on the job (provenance,
 *  and the preflight's stable-identity check); it just isn't identity.
 *
 *  Excluding the REST of `meta` too (2026-08-28) is the same argument
 *  generalised: adding `showRuleset`/richer `entryNames` flags to feed the
 *  format-aware preflight contract is exactly this kind of bookkeeping-only
 *  change, and previously would have changed every existing hash for a
 *  reason that has nothing to do with what gets rendered. This DOES change
 *  every existing hash once, on deploy (meta's shape itself changed) — one
 *  re-render per stored closed-show catalogue, deliberately accepted. */
export function computeSnapshotHash(snapshot: CatalogueSnapshot): string {
  const { meta: _meta, ...rest } = snapshot;
  return createHash('sha256').update(canonicalStringify(rest)).digest('hex');
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
        orderBy: [schema.catalogueNumberAsc()],
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
      // sortEntryClassesByShowClassOrder — see class-labels.ts's doc comment
      // — because Drizzle can't ORDER BY the joined showClass's sortOrder on
      // this relation and Postgres gives no ordering guarantee without one.
      // Every catalogue format reads this SAME array, so fixing it once
      // here (rather than per-renderer) is what makes catalogue-absentees'
      // unsorted `entry.classes.map(...).join(', ')` — and any other format
      // that doesn't already do its own local re-sort — safe. Confirmed
      // real-world impact: gsd-scotland-champ-2026's absentees pages
      // swapped "9, C" / "C, 9" between two identical renders.
      classes: sortEntryClassesByShowClassOrder(entry.entryClasses).map((ec) => ({
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

  // URL only — no fetch, no bytes. This used to `await fetchPdfSafeImage()`
  // here, at enqueue time, in the web process; that fetch (and the advert
  // one below) is exactly what produced the 2026-08-27 OOM risk this
  // function exists to avoid. The logo is fetched later, in the worker
  // process, by hydrateSnapshotForRender() — see the file header.
  const showSponsorInfos: ShowSponsorInfo[] = showSponsorRows.map((ss) => ({
    name: ss.sponsor.name,
    tier: ss.tier,
    logoUrl: ss.sponsor.logoUrl,
    website: ss.sponsor.website,
    customTitle: ss.customTitle,
  }));

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

  // Original URL only — no fetch, no rotation. prepareAdvertsForRender()
  // (which fetches the artwork and, for landscape adverts, rotates it into
  // a data: URI) now runs in hydrateSnapshotForRender() at render time
  // instead — see the file header.
  const advertsForCatalogue = catalogueAdvertRows.map((ad) => ({
    id: ad.id,
    advertiserName: ad.advertiserName,
    position: ad.position,
    imageUrl: ad.imageUrl,
    sortOrder: ad.sortOrder,
  }));

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
      showRuleset: show.showRuleset ?? null,
      ...buildExpectedNumbersAndNames(entries),
    },
  };
}

/** Every catalogue number that should exist, deduped per dog exactly as
 *  assignNumbers() in catalogue-numbering.ts dedupes, plus a number->name
 *  lookup (with NFC/Junior-Handler flags) for every confirmed entry that
 *  has one — the preflight module's gapless-1..N, every-entry-printed, and
 *  format-aware completeness checks. */
function buildExpectedNumbersAndNames(
  entries: Array<{
    dogId: string | null;
    catalogueNumber: string | null;
    entryType: string;
    isNfc?: boolean | null;
    dog?: { registeredName?: string | null } | null;
    juniorHandlerDetails?: { handlerName?: string | null } | null;
  }>,
): Pick<CatalogueSnapshotMeta, 'expectedNumbers' | 'entryNames'> {
  const seenDogIds = new Set<string>();
  const expectedNumbersSet = new Set<number>();
  const infoByNumber = new Map<number, { name: string; isNfc: boolean; isJuniorHandler: boolean }>();

  for (const entry of entries) {
    if (!entry.catalogueNumber) continue;
    const num = Number(entry.catalogueNumber);
    if (!Number.isFinite(num)) continue;

    // Dog-aware dedup, mirroring assignNumbers(): a dog's second (or third...)
    // entry row shares its first row's number and must not count again.
    // Junior Handler entries carry no dog (dogId null) and are always
    // numbered — and counted — individually.
    if (entry.dogId) {
      if (!seenDogIds.has(entry.dogId)) {
        seenDogIds.add(entry.dogId);
        expectedNumbersSet.add(num);
      }
    } else {
      expectedNumbersSet.add(num);
    }

    // First-seen row per number decides the name/flags — mirrors the
    // pre-existing dedup-by-number behaviour (a dog's second entry row
    // shares the first's number and must not overwrite its info).
    if (!infoByNumber.has(num)) {
      const isJuniorHandler = entry.entryType === 'junior_handler';
      const name = isJuniorHandler ? entry.juniorHandlerDetails?.handlerName : entry.dog?.registeredName;
      infoByNumber.set(num, { name: name ?? 'Unknown', isNfc: !!entry.isNfc, isJuniorHandler });
    }
  }

  return {
    expectedNumbers: [...expectedNumbersSet].sort((a, b) => a - b),
    entryNames: [...infoByNumber.entries()]
      .map(([number, info]) => ({ number, ...info }))
      .sort((a, b) => a.number - b.number),
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

  // Sponsors pass through as-is: `logoBuffer` is simply absent on a
  // freshly-built snapshot (this function also serves the `?output=json`
  // export, which never needs it) and is a real Buffer only when `snapshot`
  // is the hydrated, render-ready copy hydrateSnapshotForRender() produced.
  const showInfo: CatalogueShowInfo = {
    ...snapshot.showInfoBase,
    showSponsors: snapshot.showSponsors.length > 0 ? snapshot.showSponsors : undefined,
  };

  return { showInfo, entries: catalogueEntries, filteredEntries };
}

/**
 * Produce a render-ready COPY of `snapshot` with real image bytes wired in:
 * advert portrait/landscape orientation (prepareAdvertsForRender, which
 * rotates landscape artwork into a data: URI) and show-tier sponsor logos
 * (fetchPdfSafeImage, into `logoBuffer` — exactly the field the components
 * already read, e.g. sv-front-matter.tsx's ShowSponsorBilling). This is
 * what used to happen inside buildCatalogueSnapshot(), at enqueue time, in
 * the web process — see the file header for why that OOM'd prod. It now
 * happens HERE, at render time, in the worker process, against a copy —
 * `snapshot` itself is never mutated, since the same persisted row can be
 * rendered again later (a retry, or a second format sharing the dedupe
 * hash) and the entire point is that the STORED row never carries bytes.
 *
 * Backward compatible with a job row enqueued before this refactor
 * shipped, whose persisted snapshot may still carry bytes from the OLD
 * buildCatalogueSnapshot: an advert `imageUrl` that's already a `data:` URI
 * is left untouched by prepareAdvertsForRender (nothing to fetch or
 * re-rotate), and a sponsor `logoBuffer` still in its legacy
 * `{__bufferBase64}` marker shape is decoded directly rather than
 * re-fetched from `logoUrl`.
 */
export async function hydrateSnapshotForRender(snapshot: CatalogueSnapshot): Promise<CatalogueSnapshot> {
  const adverts = snapshot.showInfoBase.adverts;
  const hydratedAdverts = adverts && adverts.length > 0 ? await prepareAdvertsForRender(adverts) : adverts;

  const hydratedSponsors: ShowSponsorInfo[] = await Promise.all(
    snapshot.showSponsors.map(async (s) => {
      const legacy = (s as { logoBuffer?: unknown }).logoBuffer;
      if (isLegacyBufferMarker(legacy)) {
        return { ...s, logoBuffer: fromBufferMarker(legacy) };
      }
      const logoBuffer = s.tier === 'show' && s.logoUrl ? await fetchPdfSafeImage(s.logoUrl) : null;
      return { ...s, logoBuffer };
    }),
  );

  return {
    ...snapshot,
    showInfoBase: { ...snapshot.showInfoBase, adverts: hydratedAdverts },
    showSponsors: hydratedSponsors,
  };
}

export async function renderCatalogueFromSnapshot(
  rawSnapshot: CatalogueSnapshot,
  format: CatalogueFormat,
): Promise<Buffer> {
  // Everything below reads `snapshot` — binding it to the hydrated copy
  // here (rather than threading a second variable through the rest of the
  // function) is what guarantees every downstream read sees real image
  // bytes while `rawSnapshot`, the caller's object, is never touched.
  const snapshot = await hydrateSnapshotForRender(rawSnapshot);
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
