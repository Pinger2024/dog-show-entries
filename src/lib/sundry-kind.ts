/**
 * What a sundry item IS — the ONE module that knows what a kind means.
 *
 * Why this exists (15 Oct 2026): a sundry's kind used to be guessed from its
 * NAME in a dozen places, and they disagreed. "Catalogue Advert" counted as a
 * catalogue purchase and unlocked the online catalogue; a bare "Catalogue"
 * was ONLINE in the reports but the enter page told the exhibitor to collect
 * a PRINTED one; "Car Park Pass" was not recognised as parking. Now the
 * secretary says what each item is (`sundry_items.kind`) and every consumer
 * reads that column through this module.
 *
 * `inferSundryKindFromName` is NOT a rule for consumers. It is used only for
 * the one-time backfill of rows that pre-date the column, for golden/legacy
 * fixtures that lack a kind, and as a SUGGESTION in the secretary's form.
 * Guarded by src/__tests__/guards/sundry-kind-one-owner.test.ts.
 */

export const SUNDRY_KINDS = [
  'printed_catalogue',
  'online_catalogue',
  'parking',
  'donation',
  'membership',
  'advert',
  'sponsorship',
  'other',
] as const;

export type SundryKind = (typeof SUNDRY_KINDS)[number];

export const DEFAULT_SUNDRY_KIND: SundryKind = 'other';

/** Plain-words labels for the secretary's "What is this?" select. */
export const SUNDRY_KIND_LABELS: Record<SundryKind, string> = {
  printed_catalogue: 'Printed catalogue',
  online_catalogue: 'Online catalogue',
  parking: 'Parking pass',
  donation: 'Donation',
  membership: 'Club membership',
  advert: 'Advert',
  sponsorship: 'Sponsorship',
  other: 'Something else',
};

export function isSundryKind(value: unknown): value is SundryKind {
  return typeof value === 'string' && (SUNDRY_KINDS as readonly string[]).includes(value);
}

/** Both catalogue kinds. Use with `inArray(sundryItems.kind, [...CATALOGUE_KINDS])`. */
export const CATALOGUE_KINDS: readonly SundryKind[] = ['printed_catalogue', 'online_catalogue'];

/**
 * Kinds that unlock the online catalogue PDF and the show-morning "your
 * catalogue is ready" email. Mandy, 15 Oct 2026: a hard copy also gets the
 * online copy as a nice touch, but we don't advertise it (otherwise people
 * share it instead of buying a hard copy). So ACCESS covers both kinds, but
 * nothing shown at purchase time may promise it - see
 * `announcesOnlineCatalogue`.
 */
export const ONLINE_CATALOGUE_ACCESS_KINDS: readonly SundryKind[] = [
  'printed_catalogue',
  'online_catalogue',
];

/**
 * Whether buying this kind may TELL the buyer they get the online catalogue
 * (order-confirmation email box, post-payment note). Online only: a printed
 * buyer still gets access (above) but is not told at purchase time.
 * Mandy, 15 Oct 2026.
 */
export function announcesOnlineCatalogue(kind: SundryKind): boolean {
  return kind === 'online_catalogue';
}

export const PARKING_KINDS: readonly SundryKind[] = ['parking'];

export function isCatalogueKind(kind: SundryKind): boolean {
  return CATALOGUE_KINDS.includes(kind);
}

export function grantsOnlineCatalogueAccess(kind: SundryKind): boolean {
  return ONLINE_CATALOGUE_ACCESS_KINDS.includes(kind);
}

export function isParkingKind(kind: SundryKind): boolean {
  return kind === 'parking';
}

export function isDonationKind(kind: SundryKind): boolean {
  return kind === 'donation';
}

/**
 * Best guess at a kind from a name. Order matters: "Catalogue Advert" is an
 * advert, "Banner" is sponsorship, and so on. A bare "Catalogue" is printed
 * (the enter page has always told people to collect one at the show).
 * Checked against every prod sundry name on 15 Oct 2026.
 */
export function inferSundryKindFromName(name: string): SundryKind {
  const n = name.trim();
  if (/\badvert/i.test(n)) return 'advert';
  if (/sponsor|banner/i.test(n)) return 'sponsorship';
  if (/\bparking\b/i.test(n) || /\bcar\s*(park\s*)?pass\b/i.test(n)) return 'parking';
  if (/catalogue/i.test(n)) {
    return /online|digital|pdf|download|e-?catalogue/i.test(n) ? 'online_catalogue' : 'printed_catalogue';
  }
  if (/donation/i.test(n)) return 'donation';
  if (/membership/i.test(n)) return 'membership';
  return 'other';
}

/**
 * What a buyer is TOLD about the catalogue they have just bought - the
 * confirmation screen and the receipt email both ask this, so the two can
 * never disagree. 'online' when they bought the online catalogue, 'printed'
 * when they bought only a printed one (collect it on the day - and nothing
 * says the online copy comes with it, Mandy 15 Oct 2026), null otherwise.
 * An unknown kind (an old saved basket) counts as nothing.
 */
export function catalogueNoteFor(
  kinds: readonly (SundryKind | null | undefined)[],
): 'online' | 'printed' | null {
  if (kinds.some((k) => k != null && announcesOnlineCatalogue(k))) return 'online';
  if (kinds.some((k) => k != null && isCatalogueKind(k))) return 'printed';
  return null;
}

/** Whether a set of bought items includes a parking pass. */
export function includesParkingPass(kinds: readonly (SundryKind | null | undefined)[]): boolean {
  return kinds.some((k) => k != null && isParkingKind(k));
}
