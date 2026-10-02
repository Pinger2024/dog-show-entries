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
 * The dog-record fields a competitive regional (SV/WUSV) entry needs — the ONE
 * declaration. `svMissingRequirements` summarises them for the entry gates and
 * the exhibitor wizard; the dog form reads `field` + `formMessage` to flag the
 * exact input. `group` is the summary line a field belongs to (the sire's name
 * and number are one line, the breeder's name, town and postcode another), in
 * the order the summary lists them.
 *
 * Coat type decides the Standard / Long Coat class; registration number, body
 * and microchip print on the grading card and the SV results sheet (Mandy
 * 2026-07-07, 2026-08-24 — 15 NE Regional dogs had no registration body and
 * the sheet's column came out blank); the SV catalogue needs the full sire,
 * dam and breeder lines (Mandy 2026-06-26). Health and the working title are
 * decided by the classes entered, not the dog record, and live below.
 */
export const SV_ENTRY_DOG_FIELDS = [
  { field: 'coatType', group: 'coat', formMessage: 'Coat type is required for regional shows' },
  { field: 'kcRegNumber', group: 'registrationNumber', formMessage: "Your dog's registration number is required for regional shows" },
  { field: 'registrationBody', group: 'registrationBody', formMessage: 'The registration body (RKC, SV…) is required for regional shows' },
  { field: 'microchipNumber', group: 'microchip', formMessage: 'The microchip number is required for regional shows' },
  { field: 'sireName', group: 'sire', formMessage: "The sire's name is required for regional shows" },
  { field: 'sireRegistrationNumber', group: 'sire', formMessage: "The sire's registration number is required for regional shows" },
  { field: 'damName', group: 'dam', formMessage: "The dam's name is required for regional shows" },
  { field: 'damRegistrationNumber', group: 'dam', formMessage: "The dam's registration number is required for regional shows" },
  { field: 'breederName', group: 'breeder', formMessage: "The breeder's name is required for regional shows" },
  { field: 'breederCity', group: 'breeder', formMessage: 'Breeder town/city is required for regional shows' },
  { field: 'breederPostcode', group: 'breeder', formMessage: 'Breeder postcode is required for regional shows' },
] as const;

export type SvEntryDogField = (typeof SV_ENTRY_DOG_FIELDS)[number]['field'];
type SvEntryGroup = (typeof SV_ENTRY_DOG_FIELDS)[number]['group'];

/** The summary line each group shows in the wizard's warning and the gates. */
const SV_GROUP_LABELS: Record<SvEntryGroup, string> = {
  coat: 'Coat type (Standard or Long Coat)',
  registrationNumber: 'Registration number',
  registrationBody: 'Registration body (RKC, SV…)',
  microchip: 'Microchip number',
  sire: "Sire's name and registration number",
  dam: "Dam's name and registration number",
  breeder: 'Breeder details (name, town and postcode)',
};

/**
 * The things still missing before this dog can be entered into its SV classes,
 * as human labels for the consolidated warning — the SV_ENTRY_DOG_FIELDS
 * groups with a blank field, then the health triad when the classes need it.
 * Hip / elbow / DNA are required only when entering a health-gated class (SV
 * Yearling / Adult / Working), per SV/WUSV rules.
 *
 * Callers normally reach this through `entryRequirements`
 * (lib/entry-requirements.ts), which decides whether the SV half applies.
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
  /** Registration body (RKC / SV / IKC…) — same undefined-skips contract.
   *  Deliberately NOT required when first registering a dog in general —
   *  only for a regional entry (and the dog form's regional mode). */
  registrationBody?: string | null;
  /** Microchip — prints on the grading card and the catalogue's entry line;
   *  GSDL CAS lookups key on reg + chip. Same undefined-skips contract. */
  microchipNumber?: string | null;
}): string[] {
  const values: Partial<Record<SvEntryDogField, string | null | undefined>> = {
    coatType: opts.coatType,
    kcRegNumber: opts.ownRegistrationNumber,
    registrationBody: opts.registrationBody,
    microchipNumber: opts.microchipNumber,
    ...(opts.pedigree ?? {}),
  };
  // Which fields this caller asked about: coat type always; the three
  // identity fields when passed (undefined skips); the pedigree lines when a
  // pedigree was given at all.
  const checked = (field: SvEntryDogField): boolean => {
    if (field === 'coatType') return true;
    if (field === 'kcRegNumber') return opts.ownRegistrationNumber !== undefined;
    if (field === 'registrationBody') return opts.registrationBody !== undefined;
    if (field === 'microchipNumber') return opts.microchipNumber !== undefined;
    return opts.pedigree != null;
  };

  const groups: SvEntryGroup[] = [];
  for (const f of SV_ENTRY_DOG_FIELDS) {
    if (checked(f.field) && blank(values[f.field]) && !groups.includes(f.group)) groups.push(f.group);
  }
  const missing: string[] = groups.map((g) => SV_GROUP_LABELS[g]);

  if (opts.healthRequired) {
    const isEmpty = (v: string | null | undefined) => !v || v === 'not_required';
    if (isEmpty(opts.profile?.hipGrade)) missing.push('Hip score');
    if (isEmpty(opts.profile?.elbowGrade)) missing.push('Elbow score');
    if (!opts.profile?.dna) missing.push('DNA recording');
  }
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
