/**
 * Pure, read-only "export one show's full document-rendering graph" query.
 *
 * Used by TWO callers:
 *  - scripts/export-show-fixture.ts — the real CLI, run by the team lead
 *    against PRODUCTION (never by this agent). Opens its own read-only DB
 *    session before calling in here.
 *  - src/__tests__/golden/generate-synthetic-fixture.ts — a dev-only script
 *    that builds a synthetic show in remi_test via factories and exports it
 *    through this SAME code path, so the export logic, the fixture shape,
 *    and the loader are all proven end-to-end before any real show is ever
 *    touched.
 *
 * This module does not know or care which DB it's pointed at — it just
 * reads. All anonymisation happens IN HERE (not in the CLI wrapper) so
 * there is exactly one place that decides what PII does and doesn't survive
 * into a fixture file, and the synthetic-fixture path exercises it too.
 *
 * Anonymisation policy (see scripts/lib/anonymise.ts for the mechanism):
 *  - Person identity (names, emails, phones, addresses, postcodes, kennel/
 *    affix names, dog registered names, registration/microchip numbers):
 *    pseudonymised with a length-preserving, capitalisation-preserving,
 *    word-break-preserving substitution, stable per real value.
 *  - Free text that DRIVES PAGE LAYOUT and commonly carries an embedded
 *    person's name/signature (a judge's bio, the secretary's catalogue
 *    welcome note): pseudonymised the same way (whole string, preserving
 *    length) rather than blanked, so pagination/line-wrap stays realistic.
 *  - Free text that is club-authored operational/policy prose and does not
 *    identify a person (awards description, additional notes, catering,
 *    custom statements, etc.): left verbatim — this is "club information",
 *    the thing the anonymisation spec says to keep.
 *  - Club/show/breed/class names, dates, fees, titles (CH, JW, ShCM),
 *    breed names: always kept verbatim.
 *  - Any image/logo/photo URL: dropped (set to null) — a committed fixture
 *    must never carry a live pointer into prod storage, and none of it is
 *    text the golden test's page-geometry comparison reads. The one
 *    exception is catalogue adverts, whose PIXEL DIMENSIONS (portrait vs
 *    landscape affects which page slot advert-orientation.ts uses) are
 *    captured; see placeholder-image.ts for how the loader turns that back
 *    into a real, renderable image with no network fetch.
 */
import { eq, inArray } from 'drizzle-orm';
import type { Database } from '@/server/db';
import * as schema from '@/server/db/schema';
import { publicOrgColumns } from '@/server/trpc/public-org-columns';
import {
  anonAddress,
  anonAffix,
  anonDogName,
  anonEmail,
  anonPersonName,
  anonPhone,
  anonPostcode,
  anonRegNumber,
  pseudonymiseText,
} from './anonymise';
import { probeImageDimensions } from './placeholder-image';

/** Row shapes are intentionally loose (`Record<string, unknown>`) — this
 *  module round-trips whatever the real schema returns, table by table,
 *  rather than re-declaring 30 tables' worth of insert types. The loader
 *  (src/__tests__/helpers/show-fixture.ts) is the other half of this
 *  contract and inserts each array straight into the matching Drizzle
 *  table, so a real schema change surfaces as a loud FK/column error the
 *  next time the synthetic fixture is regenerated — not a silent drift. */
type Row = Record<string, unknown>;

export interface ShowFixtureTables {
  organisations: Row[];
  venues: Row[];
  breedGroups: Row[];
  breeds: Row[];
  users: Row[];
  shows: Row[];
  classDefinitions: Row[];
  showClasses: Row[];
  showBreeds: Row[];
  dogs: Row[];
  dogOwners: Row[];
  dogTitles: Row[];
  dogSvProfile: Row[];
  judges: Row[];
  rings: Row[];
  judgeRoles: Row[];
  judgeAssignments: Row[];
  orders: Row[];
  entries: Row[];
  juniorHandlerDetails: Row[];
  entryClasses: Row[];
  results: Row[];
  achievements: Row[];
  stewardAssignments: Row[];
  sundryItems: Row[];
  sponsors: Row[];
  showSponsors: Row[];
  classSponsorships: Row[];
  /** Each row's `imageUrl` is always null here — `width`/`height` are the
   *  advert's real pixel dimensions, added fields not present on the live
   *  schema. See the file header and placeholder-image.ts. */
  catalogueAdverts: Row[];
  showDiscountGroups: Row[];
  showDonations: Row[];
  invoices: Row[];
}

export interface ShowFixture {
  version: 1;
  slug: string;
  /** Real showId this was captured from — informational only; the loader
   *  assigns nothing based on it and never needs to match it back to prod. */
  sourceShowId: string;
  capturedAt: string;
  tables: ShowFixtureTables;
}

function uniq<T>(values: Array<T | null | undefined>): T[] {
  return [...new Set(values.filter((v): v is T => v != null))];
}

/** Deep-clone-and-scrub the officials named inside `scheduleData` — the
 *  jsonb blob's own free-text fields (awardsDescription, additionalNotes,
 *  catering, etc.) are left alone; only the structured people fields and
 *  the welcome note (which usually ends in a real signature) are touched. */
function anonymiseScheduleData(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const data = raw as Record<string, unknown>;
  const out: Record<string, unknown> = { ...data };
  if (Array.isArray(data.guarantors)) {
    out.guarantors = data.guarantors.map((g) =>
      g && typeof g === 'object'
        ? { ...g, name: anonPersonName((g as Row).name as string | undefined) }
        : g,
    );
  }
  if (Array.isArray(data.officers)) {
    out.officers = data.officers.map((o) =>
      o && typeof o === 'object'
        ? { ...o, name: anonPersonName((o as Row).name as string | undefined) }
        : o,
    );
  }
  if (Array.isArray(data.firstAiders)) {
    out.firstAiders = (data.firstAiders as unknown[]).map((n) =>
      typeof n === 'string' ? anonPersonName(n) : n,
    );
  }
  if (typeof data.showManager === 'string') {
    out.showManager = anonPersonName(data.showManager);
  }
  if (typeof data.welcomeNote === 'string') {
    out.welcomeNote = pseudonymiseText(data.welcomeNote, 'welcome-note');
  }
  if (Array.isArray(data.awardSponsors)) {
    out.awardSponsors = data.awardSponsors.map((s) =>
      s && typeof s === 'object'
        ? { ...s, sponsorAffix: anonAffix((s as Row).sponsorAffix as string | undefined) }
        : s,
    );
  }
  return out;
}

export async function exportShowFixture(db: Database, showId: string, slug: string): Promise<ShowFixture> {
  const show = await db.query.shows.findFirst({ where: eq(schema.shows.id, showId) });
  if (!show) throw new Error(`Show ${showId} not found`);

  const organisation = await db.query.organisations.findFirst({
    where: eq(schema.organisations.id, show.organisationId),
    columns: publicOrgColumns,
  });
  if (!organisation) throw new Error(`Organisation ${show.organisationId} not found`);

  const venue = show.venueId
    ? await db.query.venues.findFirst({ where: eq(schema.venues.id, show.venueId) })
    : undefined;

  const showClasses = await db.query.showClasses.findMany({ where: eq(schema.showClasses.showId, showId) });
  const classDefinitionIds = uniq(showClasses.map((c) => c.classDefinitionId));
  const classDefinitions = classDefinitionIds.length
    ? await db.query.classDefinitions.findMany({ where: inArray(schema.classDefinitions.id, classDefinitionIds) })
    : [];

  const showBreeds = await db.query.showBreeds.findMany({ where: eq(schema.showBreeds.showId, showId) });

  const judgeAssignments = await db.query.judgeAssignments.findMany({ where: eq(schema.judgeAssignments.showId, showId) });
  const judgeIds = uniq(judgeAssignments.map((j) => j.judgeId));
  const judgesRaw = judgeIds.length
    ? await db.query.judges.findMany({ where: inArray(schema.judges.id, judgeIds) })
    : [];
  const judgeRoleIds = uniq(judgeAssignments.map((j) => j.judgeRoleId));
  const judgeRoles = judgeRoleIds.length
    ? await db.query.judgeRoles.findMany({ where: inArray(schema.judgeRoles.id, judgeRoleIds) })
    : [];

  const rings = await db.query.rings.findMany({ where: eq(schema.rings.showId, showId) });

  const orders = await db.query.orders.findMany({ where: eq(schema.orders.showId, showId) });

  // ALL entries regardless of status — reports/exports read the full set
  // (confirmed/withdrawn/etc.), and only some documents filter down.
  const entries = await db.query.entries.findMany({ where: eq(schema.entries.showId, showId) });
  const entryIds = entries.map((e) => e.id);
  const dogIds = uniq(entries.map((e) => e.dogId));

  const dogsRaw = dogIds.length ? await db.query.dogs.findMany({ where: inArray(schema.dogs.id, dogIds) }) : [];
  const dogOwners = dogIds.length
    ? await db.query.dogOwners.findMany({ where: inArray(schema.dogOwners.dogId, dogIds) })
    : [];
  const dogTitles = dogIds.length
    ? await db.query.dogTitles.findMany({ where: inArray(schema.dogTitles.dogId, dogIds) })
    : [];
  const dogSvProfile = dogIds.length
    ? await db.query.dogSvProfile.findMany({ where: inArray(schema.dogSvProfile.dogId, dogIds) })
    : [];

  const breedIds = uniq([
    ...showClasses.map((c) => c.breedId),
    show.breedId,
    organisation.breedId,
    ...dogsRaw.map((d) => d.breedId),
  ]);
  const breedsRaw = breedIds.length ? await db.query.breeds.findMany({ where: inArray(schema.breeds.id, breedIds) }) : [];
  const breedGroupIds = uniq(breedsRaw.map((b) => b.groupId));
  const breedGroups = breedGroupIds.length
    ? await db.query.breedGroups.findMany({ where: inArray(schema.breedGroups.id, breedGroupIds) })
    : [];

  const juniorHandlerDetails = entryIds.length
    ? await db.query.juniorHandlerDetails.findMany({ where: inArray(schema.juniorHandlerDetails.entryId, entryIds) })
    : [];
  const entryClasses = entryIds.length
    ? await db.query.entryClasses.findMany({ where: inArray(schema.entryClasses.entryId, entryIds) })
    : [];
  const entryClassIds = entryClasses.map((ec) => ec.id);
  const results = entryClassIds.length
    ? await db.query.results.findMany({ where: inArray(schema.results.entryClassId, entryClassIds) })
    : [];

  const achievements = await db.query.achievements.findMany({ where: eq(schema.achievements.showId, showId) });
  const stewardAssignments = await db.query.stewardAssignments.findMany({ where: eq(schema.stewardAssignments.showId, showId) });
  const sundryItems = await db.query.sundryItems.findMany({ where: eq(schema.sundryItems.showId, showId) });

  const showSponsors = await db.query.showSponsors.findMany({ where: eq(schema.showSponsors.showId, showId) });
  const sponsorIds = uniq(showSponsors.map((s) => s.sponsorId));
  const sponsorsRaw = sponsorIds.length
    ? await db.query.sponsors.findMany({ where: inArray(schema.sponsors.id, sponsorIds) })
    : [];
  const showClassIds = showClasses.map((c) => c.id);
  const classSponsorships = showClassIds.length
    ? await db.query.classSponsorships.findMany({ where: inArray(schema.classSponsorships.showClassId, showClassIds) })
    : [];

  const catalogueAdvertsRaw = await db.query.catalogueAdverts.findMany({ where: eq(schema.catalogueAdverts.showId, showId) });
  const catalogueAdverts: Row[] = await Promise.all(
    catalogueAdvertsRaw.map(async (ad) => {
      const dims = ad.imageUrl ? await probeImageDimensions(ad.imageUrl) : { width: 1000, height: 1400 };
      return {
        ...ad,
        imageUrl: null,
        imageStorageKey: null,
        width: dims.width,
        height: dims.height,
      };
    }),
  );

  const showDiscountGroups = await db.query.showDiscountGroups.findMany({ where: eq(schema.showDiscountGroups.showId, showId) });
  const showDonations = await db.query.showDonations.findMany({ where: eq(schema.showDonations.showId, showId) });
  const invoices = await db.query.invoices.findMany({ where: eq(schema.invoices.showId, showId) });

  // ── Gather every user id referenced anywhere in the graph ──────────────
  const userIds = uniq([
    show.secretaryUserId,
    ...dogsRaw.map((d) => d.ownerId),
    ...entries.map((e) => e.exhibitorId),
    ...entries.map((e) => e.handlerId),
    ...orders.map((o) => o.exhibitorId),
    ...dogOwners.map((o) => o.userId),
    ...stewardAssignments.map((s) => s.userId),
    ...results.map((r) => r.judgeId),
    ...results.map((r) => r.recordedBy),
    ...invoices.map((i) => i.issuedByUserId),
  ]);
  const usersRaw = userIds.length ? await db.query.users.findMany({ where: inArray(schema.users.id, userIds) }) : [];

  // ── Anonymise ────────────────────────────────────────────────────────────
  const users: Row[] = usersRaw.map((u) => ({
    ...u,
    name: anonPersonName(u.name),
    email: anonEmail(u.email),
    phone: anonPhone(u.phone),
    address: anonAddress(u.address),
    postcode: anonPostcode(u.postcode),
    kcAccountNo: anonRegNumber(u.kcAccountNo),
    image: null,
    passwordHash: null,
    preferences: null,
    stripeCustomerId: null,
  }));

  const dogs: Row[] = dogsRaw.map((d) => ({
    ...d,
    registeredName: anonDogName(d.registeredName),
    kcRegNumber: anonRegNumber(d.kcRegNumber),
    microchipNumber: anonRegNumber(d.microchipNumber),
    sireName: anonDogName(d.sireName),
    sireRegistrationNumber: anonRegNumber(d.sireRegistrationNumber),
    damName: anonDogName(d.damName),
    damRegistrationNumber: anonRegNumber(d.damRegistrationNumber),
    breederName: anonPersonName(d.breederName),
    breederCity: anonAddress(d.breederCity),
    breederPostcode: anonPostcode(d.breederPostcode),
    bio: null,
  }));

  const dogOwnersAnon: Row[] = dogOwners.map((o) => ({
    ...o,
    ownerName: anonPersonName(o.ownerName),
    ownerAddress: anonAddress(o.ownerAddress),
    ownerEmail: anonEmail(o.ownerEmail),
    ownerPhone: anonPhone(o.ownerPhone),
  }));

  const dogSvProfileAnon: Row[] = dogSvProfile.map((p) => ({
    ...p,
    breedSurveyor: anonPersonName(p.breedSurveyor),
  }));

  const judges: Row[] = judgesRaw.map((j) => ({
    ...j,
    name: anonPersonName(j.name),
    kcNumber: anonRegNumber(j.kcNumber),
    contactEmail: anonEmail(j.contactEmail),
    contactPhone: anonPhone(j.contactPhone),
    kennelClubAffix: anonAffix(j.kennelClubAffix),
    kcJudgeId: anonRegNumber(j.kcJudgeId),
    photoUrl: null,
    // Bio drives catalogue judge-bio layout — pseudonymise in place rather
    // than blank, so line-wrap/page-break behaviour stays representative.
    bio: typeof j.bio === 'string' ? pseudonymiseText(j.bio, 'judge-bio') : j.bio,
  }));

  const judgeAssignmentsAnon: Row[] = judgeAssignments.map((ja) => ({
    ...ja,
    approvalToken: null,
    approvalNote: typeof ja.approvalNote === 'string' ? pseudonymiseText(ja.approvalNote, 'approval-note') : ja.approvalNote,
  }));

  const orgAnon: Row = {
    ...organisation,
    contactEmail: anonEmail(organisation.contactEmail),
    contactPhone: anonPhone(organisation.contactPhone),
    logoUrl: null,
  };

  const venueAnon: Row | undefined = venue
    ? {
        ...venue,
        address: anonAddress(venue.address),
        postcode: anonPostcode(venue.postcode),
        imageUrl: null,
        imageStorageKey: null,
      }
    : undefined;

  const showAnon: Row = {
    ...show,
    secretaryName: anonPersonName(show.secretaryName),
    secretaryEmail: anonEmail(show.secretaryEmail),
    secretaryPhone: anonPhone(show.secretaryPhone),
    secretaryAddress: anonAddress(show.secretaryAddress),
    bannerImageUrl: null,
    bannerImageStorageKey: null,
    scheduleData: anonymiseScheduleData(show.scheduleData),
  };

  const sponsorsAnon: Row[] = sponsorsRaw.map((s) => ({
    ...s,
    contactName: anonPersonName(s.contactName),
    contactEmail: anonEmail(s.contactEmail),
    logoUrl: null,
    logoStorageKey: null,
  }));

  const showSponsorsAnon: Row[] = showSponsors.map((s) => ({
    ...s,
    adImageUrl: null,
    adImageStorageKey: null,
  }));

  const classSponsorshipsAnon: Row[] = classSponsorships.map((cs) => ({
    ...cs,
    sponsorName: anonPersonName(cs.sponsorName),
    sponsorAffix: anonAffix(cs.sponsorAffix),
    trophyName: typeof cs.trophyName === 'string' ? pseudonymiseText(cs.trophyName, 'trophy-name') : cs.trophyName,
    trophyDonor: anonPersonName(cs.trophyDonor),
    bannerImageUrl: null,
    bannerImageStorageKey: null,
  }));

  const showDonationsAnon: Row[] = showDonations.map((d) => ({
    ...d,
    donorName: anonPersonName(d.donorName),
    affix: anonAffix(d.affix),
  }));

  const juniorHandlerDetailsAnon: Row[] = juniorHandlerDetails.map((jh) => ({
    ...jh,
    handlerName: anonPersonName(jh.handlerName),
    kcNumber: anonRegNumber(jh.kcNumber),
  }));

  const entriesAnon: Row[] = entries.map((e) => ({
    ...e,
    atcNumber: anonRegNumber(e.atcNumber),
    svMembershipNumber: anonRegNumber(e.svMembershipNumber),
    paymentIntentId: null,
  }));

  const resultsAnon: Row[] = results.map((r) => ({
    ...r,
    critiqueText: typeof r.critiqueText === 'string' ? pseudonymiseText(r.critiqueText, 'critique-text') : r.critiqueText,
    winnerPhotoUrl: null,
    winnerPhotoStorageKey: null,
  }));

  const catalogueAdvertsAnon: Row[] = catalogueAdverts.map((ad) => ({
    ...ad,
    advertiserName: anonPersonName(ad.advertiserName as string | undefined),
    textContent: typeof ad.textContent === 'string' ? pseudonymiseText(ad.textContent, 'advert-text') : ad.textContent,
  }));

  return {
    version: 1,
    slug,
    sourceShowId: showId,
    capturedAt: new Date().toISOString(),
    tables: {
      organisations: [orgAnon],
      venues: venueAnon ? [venueAnon] : [],
      breedGroups,
      breeds: breedsRaw,
      users,
      shows: [showAnon],
      classDefinitions,
      showClasses,
      showBreeds,
      dogs,
      dogOwners: dogOwnersAnon,
      dogTitles,
      dogSvProfile: dogSvProfileAnon,
      judges,
      rings,
      judgeRoles,
      judgeAssignments: judgeAssignmentsAnon,
      orders,
      entries: entriesAnon,
      juniorHandlerDetails: juniorHandlerDetailsAnon,
      entryClasses,
      results: resultsAnon,
      achievements,
      stewardAssignments,
      sundryItems,
      sponsors: sponsorsAnon,
      showSponsors: showSponsorsAnon,
      classSponsorships: classSponsorshipsAnon,
      catalogueAdverts: catalogueAdvertsAnon,
      showDiscountGroups,
      showDonations: showDonationsAnon,
      invoices,
    },
  };
}
