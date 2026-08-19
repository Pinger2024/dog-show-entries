/**
 * SV/WUSV entry readiness rules (Mandy 2026-06-26). Single source of truth for
 * "is this dog ready to enter an SV class", so the enter page can show ONE
 * consolidated warning and block the entry until everything that applies to the
 * dog's age/class is complete — instead of scattering separate coat-type and
 * health-test warnings the exhibitor has to scroll around to find.
 */

/**
 * The two SV over-24-month classes are split by working qualification, and a
 * dog belongs in exactly one of them:
 *  - Working (Gebrauchshundklasse) is ONLY for dogs WITH a working title.
 *  - Adult is ONLY for dogs WITHOUT one — a titled dog competes in Working,
 *    not Adult, so Adult must not be offered to it (Mandy 2026-06-26; the
 *    Adult-hidden-for-titled-dogs half added 2026-07-12 after she saw a
 *    titled dog offered both).
 * Every other age class (Baby Puppy … Yearling) is unaffected.
 */
export function svAgeClassAllowed(className: string, dogHasWorkingTitle: boolean): boolean {
  const name = className.trim().toLowerCase();
  if (name === 'working') return dogHasWorkingTitle;
  if (name === 'adult') return !dogHasWorkingTitle;
  return true;
}

export type SvHealthProfile = {
  hipGrade?: string | null;
  elbowGrade?: string | null;
  dna?: string | null;
} | null | undefined;

/** The dog's pedigree fields the SV catalogue/pedigree needs in full (Mandy
 *  2026-06-26): sire + dam name AND registration number, and the breeder line
 *  the catalogue prints (name, town, postcode). */
export type SvPedigree = {
  sireName?: string | null;
  sireRegistrationNumber?: string | null;
  damName?: string | null;
  damRegistrationNumber?: string | null;
  breederName?: string | null;
  breederCity?: string | null;
  breederPostcode?: string | null;
} | null | undefined;

/** True when a required string field is empty/whitespace. Exported so the dog
 *  form's regional validation reuses the same predicate the entry gate uses. */
export const blank = (v: string | null | undefined) => !v || !v.trim();

/**
 * The things still missing before this dog can be entered into its SV classes,
 * as human labels for the consolidated warning.
 * - Coat type is always required for a competitive SV standard entry (we need it
 *   to put the dog in the right Standard / Long Coat class).
 * - Sire / dam (name + reg number) and the breeder line are always required for
 *   these shows — the catalogue/pedigree needs them in full (Mandy 2026-06-26).
 * - Hip / elbow / DNA are required only when entering a health-gated class
 *   (SV Yearling / Adult / Working), per SV/WUSV rules.
 */
export function svMissingRequirements(opts: {
  coatType: string | null | undefined;
  healthRequired: boolean;
  profile: SvHealthProfile;
  pedigree?: SvPedigree;
  /** The dog's OWN registration number. When provided (any value, incl. an
   *  empty string) it is required for SV / regional entry — Mandy 2026-07-07:
   *  "make the registration number mandatory for SV shows". Omit (undefined)
   *  to skip the check for back-compat. */
  ownRegistrationNumber?: string | null;
}): string[] {
  const missing: string[] = [];
  if (!opts.coatType) missing.push('Coat type (Standard or Long Coat)');
  if (opts.ownRegistrationNumber !== undefined && blank(opts.ownRegistrationNumber)) {
    missing.push('Registration number');
  }

  const p = opts.pedigree;
  if (p) {
    if (blank(p.sireName) || blank(p.sireRegistrationNumber)) {
      missing.push("Sire's name and registration number");
    }
    if (blank(p.damName) || blank(p.damRegistrationNumber)) {
      missing.push("Dam's name and registration number");
    }
    if (blank(p.breederName) || blank(p.breederCity) || blank(p.breederPostcode)) {
      missing.push('Breeder details (name, town and postcode)');
    }
  }

  if (opts.healthRequired) {
    const isEmpty = (v: string | null | undefined) => !v || v === 'not_required';
    if (isEmpty(opts.profile?.hipGrade)) missing.push('Hip score');
    if (isEmpty(opts.profile?.elbowGrade)) missing.push('Elbow score');
    if (!opts.profile?.dna) missing.push('DNA recording');
  }
  return missing;
}

/** The dog's baseline pedigree fields every catalogue (not just SV) needs. */
export type BaselinePedigree = {
  sireName?: string | null;
  damName?: string | null;
  breederName?: string | null;
  colour?: string | null;
} | null | undefined;

/**
 * The baseline pedigree fields still missing before this dog can be entered
 * into ANY show — sire, dam, breeder and colour all print in the catalogue,
 * regardless of whether the show is SV/WUSV. The SV-specific gate above is
 * stricter (it also wants registration numbers and breeder town/postcode)
 * and stays unchanged; this is the floor every entry must clear.
 */
export function pedigreeMissingForEntry(dog: BaselinePedigree): string[] {
  const missing: string[] = [];
  if (blank(dog?.sireName)) missing.push("the sire's name");
  if (blank(dog?.damName)) missing.push("the dam's name");
  if (blank(dog?.breederName)) missing.push("the breeder's name");
  if (blank(dog?.colour)) missing.push('the colour');
  return missing;
}

/**
 * Marks that are NOT working qualifications, however an exhibitor typed them.
 *
 * SV's own Prüfungsordnung says it outright — *"Das Kennzeichen 'AD' ist kein
 * Ausbildungskennzeichen im Sinne der Zucht- und Zuchtschauordnung"* — AD is a
 * Körung prerequisite, not a title. BH (Begleithundeprüfung, written BH/VT) is
 * the gateway test that unlocks the working-title ladder rather than a title in
 * its own right, and WB (Wesensbeurteilung) is a character assessment.
 *
 * These have their own fields on the SV profile now, but the working-title box
 * is free text, and until they did an exhibitor holding a BH or an AD had
 * nowhere else to put them. Typing one here offered the dog the Working class
 * and HID Adult — the class it actually belongs in (Mandy 2026-08-19: "guard
 * the routing rules as these should NOT drive the entry into the working
 * class").
 */
const NON_WORKING_TITLE_MARKS = new Set(['BH', 'BHVT', 'VT', 'AD', 'WB']);

/**
 * True when the dog holds a genuine working qualification.
 *
 * Splits on anything non-alphanumeric so every way of writing it lands the
 * same — "BH, AD", "BH/VT", "bh ad" all resolve to marks alone and return
 * false, while "IGP1 BH" still counts because of the IGP1.
 */
export function hasWorkingTitle(workingTitle: string | null | undefined): boolean {
  const marks = (workingTitle ?? '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  return marks.some((mark) => !NON_WORKING_TITLE_MARKS.has(mark));
}
