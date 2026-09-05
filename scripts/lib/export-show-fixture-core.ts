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
 *  - Live third-party identifiers (Stripe payment intent / subscription
 *    ids): always dropped (null) — never needed for rendering, and a
 *    committed fixture must never carry a live pointer into Stripe.
 *  - `scheduleData` (jsonb, free-form — secretaries can add fields we've
 *    never seen): swept by `pseudonymiseByKeyPattern`, a GENERIC walker
 *    that pseudonymises every string under a key matching
 *    /name|phone|email|address|postcode|affix/i anywhere in the structure,
 *    THEN `showManager`/`firstAiders`/`welcomeNote` are handled explicitly
 *    (their keys don't match that pattern). See `anonymiseScheduleData`'s
 *    doc comment — this is a real-incident fix (2026-09-01):
 *    `awardSponsors[].sponsorName` carried a real surname in 4 of the
 *    first 8 real-show exports.
 *
 * Per-table audit (every table in ShowFixtureTables; "—" = no PII-bearing
 * column, exported verbatim on purpose, not by omission):
 *  - organisations: `publicOrgColumns` only (never bank details/Stripe
 *    ids/plan — see `@/server/trpc/public-org-columns`); contactEmail/
 *    contactPhone anonymised, logoUrl dropped.
 *  - venues: address/postcode anonymised, imageUrl dropped. name kept
 *    (public venue name).
 *  - breedGroups, breeds, classDefinitions, showClasses, showBreeds,
 *    judgeRoles, entryClasses, stewardAssignments, showDiscountGroups: —
 *    (taxonomy/structure only, no free text or person fields).
 *  - users: name/email/phone/address/postcode/kcAccountNo anonymised;
 *    image, passwordHash, preferences, stripeCustomerId,
 *    proStripeSubscriptionId all dropped. role/id/timestamps kept.
 *  - shows: secretaryName/Email/Phone/Address anonymised, bannerImageUrl
 *    dropped, scheduleData swept (see above). name/dates/fees/kcLicenceNo
 *    kept (public show facts).
 *  - dogs: registeredName, kcRegNumber, microchipNumber, sireName,
 *    sireRegistrationNumber, damName, damRegistrationNumber, breederName,
 *    breederCity, breederPostcode anonymised; bio dropped (a social-feed
 *    field, never rendered in any exported document). colour, titles,
 *    dates, breed kept.
 *  - dogOwners: ownerName/ownerAddress/ownerEmail/ownerPhone anonymised.
 *    ownerTitle (Mr/Mrs/etc) kept — a salutation, not identity.
 *  - dogTitles: — (title enum + date + awardingBody, an institution name
 *    like "The Kennel Club", not a person).
 *  - dogSvProfile: breedSurveyor (a person's name) anonymised. Health/
 *    qualification free-text escape hatches (hipScoreOther,
 *    elbowScoreOther, otherQualifications, breedSurveyClass) kept —
 *    medical/qualification descriptors, not identity fields, and not
 *    something an exhibitor would type a stranger's name into.
 *  - judges: name, kcNumber, contactEmail, contactPhone, kennelClubAffix,
 *    kcJudgeId anonymised; bio pseudonymised whole-string (drives
 *    catalogue judge-bio layout — see the policy note above); photoUrl
 *    dropped. jepLevel kept.
 *  - rings: — (show id + ring number + day/time).
 *  - judgeAssignments: approvalToken dropped (a security token, not
 *    identity, but no reason to keep it either); approvalNote
 *    pseudonymised whole-string (free text a secretary/RKC typed, could
 *    embed a name). sex/breed/role flags kept.
 *  - orders: stripePaymentIntentId dropped; donationAffix (kennel/affix
 *    name) and regionalMembershipNumber (same-format-fake, like every
 *    other registration/membership number) anonymised. regionalMembership
 *    (a scheme LABEL like "GSDL-BRG", not a person) and referralSource (a
 *    channel name) kept, along with every fee/status/timestamp field.
 *  - entries: atcNumber, svMembershipNumber anonymised (registration-number
 *    treatment); paymentIntentId dropped. catalogueNumber, class flags,
 *    fees kept.
 *  - juniorHandlerDetails: handlerName, kcNumber anonymised.
 *  - results: critiqueText pseudonymised whole-string (a judge's free-text
 *    critique — same "preserve layout, don't leak content" treatment as a
 *    judge bio or welcome note); winnerPhotoUrl/winnerPhotoStorageKey
 *    dropped. placement/svGrade/specialAward kept.
 *  - achievements: `details` (jsonb, only ever populated by the
 *    self-reported "external result" flow, which always sets
 *    `showId: null` — so no row THIS per-show export pulls in today
 *    should ever carry one) is still swept defensively for `judgeName`/
 *    `showName`, since it's untyped jsonb and a future write path could
 *    add one to a same-show row. type/date/dogId kept.
 *  - sundryItems, invoices: — (product names/prices; invoices' `lineItems`
 *    is a computed settlement snapshot using fixed system labels like
 *    "Entry fees"/"Card processing fee", never free text a person typed —
 *    reviewed, no person-identifying field found).
 *  - sponsors: contactName, contactEmail anonymised; `notes` (free-text
 *    internal admin notes, never rendered in any document) dropped
 *    entirely; logoUrl/logoStorageKey dropped. `name` (the sponsor's
 *    business/organisation name) kept — treated as "club/organisation
 *    information", the same category as an org or club name, not a
 *    private individual (a sole-trader sponsor's business name is
 *    functionally public marketing material, same as their logo would be).
 *  - showSponsors: image fields dropped. customTitle, specialPrizes kept —
 *    both echo the sponsor's own (kept-verbatim) business identity/prize
 *    offer, not a private individual's.
 *  - classSponsorships: sponsorName, sponsorAffix, trophyName, trophyDonor
 *    anonymised (all commonly carry a person's or family's name — "the
 *    Smith Memorial Trophy", "donated by Mrs Jones"); bannerImage* dropped.
 *    prizeDescription kept (a prize's contents, e.g. "Rosette + £10", not
 *    a person).
 *  - catalogueAdverts: advertiserName anonymised; textContent
 *    pseudonymised whole-string (ad copy can include a contact name/
 *    number); imageUrl replaced with {width, height} — see the image
 *    policy note above.
 *  - showDonations: donorName, affix anonymised.
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

/**
 * Generic PII safety net: recursively walk any JSON-shaped value and
 * pseudonymise (length-preserving) every STRING whose OWN key matches
 * /name|phone|email|address|postcode|affix/i, wherever it sits in the
 * structure. Written for `scheduleData` specifically (a free-form jsonb
 * blob where secretaries can and do add new fields we've never seen), but
 * deliberately generic — not hand-listing `guarantors[].name`,
 * `officers[].name`, `awardSponsors[].sponsorName`,
 * `awardSponsors[].sponsorAffix`, `awardSponsors[].trophyName`,
 * `sponsorships[].sponsorName`, etc. one at a time means a FUTURE
 * schedule-data field shaped like one of these can never leak just because
 * nobody remembered to add a case for it here.
 *
 * Real incident this exists for (2026-09-01): `awardSponsors[].sponsorName`
 * carried a real surname in 4 of the first 8 real-show exports — the old
 * version of this function only touched `sponsorAffix` on that array, not
 * `sponsorName`, and had no fallback for the sibling `sponsorships` array
 * at all.
 *
 * Does NOT catch `showManager` or `firstAiders` (neither key contains any
 * of the pattern's words) or free-text fields whose key doesn't look like
 * an identity field at all (`welcomeNote`) — those are handled explicitly
 * in `anonymiseScheduleData` below.
 */
const SCHEDULE_DATA_PII_KEY = /name|phone|email|address|postcode|affix/i;

function pseudonymiseByKeyPattern(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => pseudonymiseByKeyPattern(v));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === 'string' && SCHEDULE_DATA_PII_KEY.test(k)) {
        out[k] = pseudonymiseText(v, `schedule-data:${k}`);
      } else {
        out[k] = pseudonymiseByKeyPattern(v);
      }
    }
    return out;
  }
  return value;
}

/** Scrub `scheduleData` before it's ever serialised. Order: the generic
 *  key-pattern sweep runs first (catches guarantors/officers names+
 *  addresses, award/class sponsor names+affixes+trophy names, sponsorship
 *  sponsor names — see pseudonymiseByKeyPattern's doc comment), then the
 *  fields the pattern can't reach (their key doesn't contain name/phone/
 *  email/address/postcode/affix) get explicit handling: `firstAiders`
 *  (person names), `showManager` (a person name), and `welcomeNote` (free
 *  text that usually ends in a real signature — pseudonymised whole-string
 *  rather than blanked so its LENGTH, and therefore catalogue line-wrap,
 *  stays representative). Everything else — awardsDescription,
 *  additionalNotes, catering, customStatements, futureShowDates, etc. — is
 *  club-authored operational/policy prose with no key matching the pattern
 *  and no person identity in it; left verbatim, per the file-level policy
 *  comment's "club information" carve-out. */
function anonymiseScheduleData(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const swept = pseudonymiseByKeyPattern(raw) as Record<string, unknown>;
  const data = raw as Record<string, unknown>;
  const out: Record<string, unknown> = { ...swept };
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
  return out;
}

/** Self-reported "external result" achievements (dogs.ts's addExternalResult
 *  tRPC procedure) store a free-text `judgeName`/`showName` inside this
 *  jsonb blob rather than a proper FK — a real person's name an exhibitor
 *  typed by hand. Every achievement THIS export pulls in is scoped to
 *  `achievements.showId = <the show being exported>`, and external results
 *  always have `showId: null` (so today's export can never actually reach
 *  one) — but `details` is untyped jsonb, so a future same-show write path
 *  could add a `judgeName` here too. Scrubbed defensively regardless. */
function anonymiseAchievementDetails(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const data = raw as Record<string, unknown>;
  const out: Record<string, unknown> = { ...data };
  if (typeof data.judgeName === 'string') out.judgeName = anonPersonName(data.judgeName);
  if (typeof data.showName === 'string') out.showName = pseudonymiseText(data.showName, 'achievement-show-name');
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
    proStripeSubscriptionId: null,
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
    // Free-text internal admin notes about a sponsor contact — never
    // rendered in any document, so nulling costs nothing and there's no
    // reason to risk a real person's name/comment surviving in it.
    notes: null,
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

  const ordersAnon: Row[] = orders.map((o) => ({
    ...o,
    // Stripe payment intent id — never needed for rendering, and a live
    // Stripe identifier has no place in a committed fixture.
    stripePaymentIntentId: null,
    // Kennel affix the donor wants thanked for in the catalogue — same
    // "kennel/affix names" category as showDonations.affix/judges'
    // kennelClubAffix.
    donationAffix: anonAffix(o.donationAffix as string | undefined),
    // A self-declared regional membership NUMBER — same-format-fake
    // treatment as every other registration/membership number.
    regionalMembershipNumber: anonRegNumber(o.regionalMembershipNumber as string | undefined),
  }));

  const achievementsAnon: Row[] = achievements.map((a) => ({
    ...a,
    details: anonymiseAchievementDetails(a.details),
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
      orders: ordersAnon,
      entries: entriesAnon,
      juniorHandlerDetails: juniorHandlerDetailsAnon,
      entryClasses,
      results: resultsAnon,
      achievements: achievementsAnon,
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
