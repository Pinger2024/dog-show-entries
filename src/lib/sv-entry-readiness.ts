/**
 * SV/WUSV entry readiness rules (Mandy 2026-06-26). Single source of truth for
 * "is this dog ready to enter an SV class", so the enter page can show ONE
 * consolidated warning and block the entry until everything that applies to the
 * dog's age/class is complete — instead of scattering separate coat-type and
 * health-test warnings the exhibitor has to scroll around to find.
 */

/**
 * The SV "Working" class (Gebrauchshundklasse) is only for dogs with a working
 * qualification. A dog with no working title recorded should not be offered it —
 * an adult without a title enters the Adult class instead (Mandy 2026-06-26).
 */
export function svWorkingClassAllowed(className: string, dogHasWorkingTitle: boolean): boolean {
  return className.trim().toLowerCase() !== 'working' || dogHasWorkingTitle;
}

export type SvHealthProfile = {
  hipGrade?: string | null;
  elbowGrade?: string | null;
  dna?: string | null;
} | null | undefined;

/** The dog's own fields an SV/WUSV regional entry needs in full. Sire + dam name
 *  AND registration number, and the breeder line the catalogue prints (Mandy
 *  2026-06-26). Extended 2026-07-02 with the rest of Mandy's definitive
 *  regional-mandatory list: the dog's own registration number, microchip, and
 *  the breeder's country (imports are common on SV regionals). */
export type SvPedigree = {
  registrationNumber?: string | null;
  microchipNumber?: string | null;
  sireName?: string | null;
  sireRegistrationNumber?: string | null;
  damName?: string | null;
  damRegistrationNumber?: string | null;
  breederName?: string | null;
  breederCountry?: string | null;
  breederCity?: string | null;
  breederPostcode?: string | null;
} | null | undefined;

const blank = (v: string | null | undefined) => !v || !v.trim();

/**
 * The things still missing before this dog can be entered into its SV classes,
 * as human labels for the consolidated warning.
 * - Coat type is always required for a competitive SV standard entry (we need it
 *   to put the dog in the right Standard / Long Coat class).
 * - The dog's own registration number and microchip are mandatory on every
 *   regional dog (Mandy 2026-07-02).
 * - Sire / dam (name + reg number) and the breeder line are always required for
 *   these shows — the catalogue/pedigree needs them in full (Mandy 2026-06-26,
 *   breeder country added 2026-07-02).
 * - Hip / elbow / DNA are required only when entering a health-gated class
 *   (SV Yearling / Adult / Working), per SV/WUSV rules.
 */
export function svMissingRequirements(opts: {
  coatType: string | null | undefined;
  healthRequired: boolean;
  profile: SvHealthProfile;
  pedigree?: SvPedigree;
}): string[] {
  const missing: string[] = [];
  if (!opts.coatType) missing.push('Coat type (Standard or Long Coat)');

  const p = opts.pedigree;
  if (p) {
    if (blank(p.registrationNumber)) missing.push('Registration number');
    if (blank(p.microchipNumber)) missing.push('Microchip number');
    if (blank(p.sireName) || blank(p.sireRegistrationNumber)) {
      missing.push("Sire's name and registration number");
    }
    if (blank(p.damName) || blank(p.damRegistrationNumber)) {
      missing.push("Dam's name and registration number");
    }
    if (
      blank(p.breederName) ||
      blank(p.breederCountry) ||
      blank(p.breederCity) ||
      blank(p.breederPostcode)
    ) {
      missing.push('Breeder details (name, country, town and postcode)');
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

/** Has the dog got a (non-blank) working title recorded? */
export function hasWorkingTitle(workingTitle: string | null | undefined): boolean {
  return !!(workingTitle ?? '').trim();
}
