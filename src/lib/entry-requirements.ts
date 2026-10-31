/**
 * What an entry needs — the ONE declaration.
 *
 * Until 2026-09-11 this was written down three times and the copies disagreed:
 *
 *   - `svEntryMissingRequirements` (sv-entry-validation.ts) ran on the SERVER
 *     and demanded registration number, microchip, the health triad from
 *     Yearling up, and a working title for the Working class.
 *   - `svMissingRequirements` (sv-entry-readiness.ts) ran ONLY in the
 *     exhibitor wizard and additionally demanded coat type, registration body,
 *     breeder town and postcode, and the sire's and dam's registration
 *     numbers — six fields that were therefore required by a button and by
 *     nothing else. A secretary's manual entry never ran it at all.
 *   - A third array inside `dog-form.tsx` listed roughly the same fields again
 *     for dog creation.
 *
 * Mandy has already paid for that gap: 15 dogs reached the NE Regional with
 * registration body unset and the SV results spreadsheet's column came out
 * blank (2026-08-24). The fix at the time added the field to the client list —
 * the one the secretary's path does not run.
 *
 * This module composes the existing predicates rather than restating them, so
 * there is still exactly one place that knows what "blank" means for each
 * field. Callers decide what to DO about a missing item:
 *
 *   - Exhibitors online REFUSE (orders.checkout, entries.create). They are
 *     already stopped at the wizard's Next button, so closing the server side
 *     costs no real exhibitor an entry — it shuts the direct-API hole.
 *   - A secretary recording a postal or phone entry is WARNED and may save
 *     anyway (Michael 2026-09-11, "a warning for now"): the entry is in her
 *     hand and often already paid for, and refusing it strands her. Provisional
 *     — Mandy may want it the other way once she has used it, which is one
 *     boolean here rather than another copy of the rules.
 */
import {
  svMissingRequirements,
  hasWorkingTitle,
  blank,
  SV_ENTRY_DOG_FIELDS,
  type SvHealthProfile,
} from './sv-entry-readiness';
import {
  SV_HEALTH_FROM_CLASSES,
  SV_WB_REQUIRED_CLASSES,
  SV_WB_BORN_ON_OR_AFTER,
} from './sv-entry-validation';
import { londonCalendarDateStr } from './date-utils';
import { PEDIGREE_FIELDS } from './dog-pedigree';

export type EntryRequirementDog = {
  registeredName?: string | null;
  kcRegNumber?: string | null;
  registrationBody?: string | null;
  microchipNumber?: string | null;
  coatType?: string | null;
  sireName?: string | null;
  damName?: string | null;
  breederName?: string | null;
  colour?: string | null;
  breederCity?: string | null;
  breederPostcode?: string | null;
  sireRegistrationNumber?: string | null;
  damRegistrationNumber?: string | null;
  /** REQUIRED (null allowed): the character-assessment rule turns on the birth
   *  date, so a caller that forgot to pass it must fail to compile rather than
   *  silently skip the rule. */
  dateOfBirth: string | Date | null;
};

export type EntryRequirementProfile = SvHealthProfile & {
  workingTitle?: string | null;
  /** Character assessment (WB) ticked on the dog's SV health card. */
  wb?: boolean | null;
};

export type EntryRequirements = {
  /** Catalogue pedigree gaps (sire, dam, breeder, colour) — every standard
   *  entry on every show, NFC included: NFC dogs still print. */
  pedigree: string[];
  /** SV/WUSV gaps — only a competitive (non-NFC) standard entry on a regional
   *  show. Includes the sire, dam and breeder lines in their stricter SV form. */
  sv: string[];
  /** The pedigree gaps the SV list does not already cover, so nothing is said
   *  twice: on a regional entry the SV lines cover sire, dam and breeder, and
   *  only the colour is left. Equals `pedigree` whenever `sv` doesn't apply. */
  pedigreeNotInSv: string[];
  /** Everything, each gap once — what the manual entry warns about and the
   *  entries list shows as "Still needed". */
  all: string[];
};

/** Dates of birth are date-only values. Reduce to the London calendar day as a
 *  YYYY-MM-DD string (the same normalisation formatDobKC uses), then compare as
 *  strings — a dog born 1 Jan 2025 is "on or after" it in UTC and in London. */
function bornOnOrAfter(dob: string | Date | null | undefined, isoDate: string): boolean {
  if (!dob) return false;
  const day =
    typeof dob === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dob) ? dob : londonCalendarDateStr(new Date(dob));
  return day >= isoDate;
}

/** The catalogue pedigree gaps alone — every show, every standard entry. */
export function pedigreeRequirementsMissing(dog: EntryRequirementDog): string[] {
  return PEDIGREE_FIELDS.filter((f) => blank(dog[f.key])).map((f) => f.label);
}

/**
 * What this entry is missing before it may be entered into these classes —
 * the ONE place that decides which rules apply to which entry. Callers choose
 * only what to DO about it (refuse, warn, or show it on a card).
 *
 *   - A Junior Handler entry has no dog: nothing applies.
 *   - Every standard entry needs the catalogue pedigree.
 *   - A competitive standard entry on a regional (wusv) show also needs the
 *     SV fields (SV_ENTRY_DOG_FIELDS), the health triad from SV Yearling up,
 *     and a working title for the Working class. NFC is not competing and is
 *     exempt from that half.
 */
export function entryRequirements(opts: {
  dog: EntryRequirementDog;
  svProfile?: EntryRequirementProfile | null;
  /** Raw class-definition names being entered. */
  classNames: string[];
  showRuleset?: string | null;
  entryType: string;
  isNfc: boolean;
}): EntryRequirements {
  const { dog, svProfile, classNames, showRuleset, entryType, isNfc } = opts;
  if (entryType !== 'standard') return { pedigree: [], sv: [], pedigreeNotInSv: [], all: [] };

  const pedigree = pedigreeRequirementsMissing(dog);
  const svApplies = showRuleset === 'wusv' && !isNfc;
  if (!svApplies) return { pedigree, sv: [], pedigreeNotInSv: pedigree, all: pedigree };

  const sv = svMissingRequirements({
    coatType: dog.coatType,
    // Health is demanded from the Yearling class up.
    healthRequired: classNames.some((n) => SV_HEALTH_FROM_CLASSES.has(n)),
    profile: svProfile ?? {},
    pedigree: {
      sireName: dog.sireName,
      sireRegistrationNumber: dog.sireRegistrationNumber,
      damName: dog.damName,
      damRegistrationNumber: dog.damRegistrationNumber,
      breederName: dog.breederName,
      breederCity: dog.breederCity,
      breederPostcode: dog.breederPostcode,
    },
    ownRegistrationNumber: dog.kcRegNumber ?? '',
    registrationBody: dog.registrationBody ?? '',
    microchipNumber: dog.microchipNumber ?? '',
  });

  // The Working class wants a working title on top. `hasWorkingTitle` rejects
  // BH / AD / WB — recorded qualifications, but not working ones — so a dog
  // holding only those is told it cannot enter Working rather than being
  // quietly admitted (Mandy 2026-08-19).
  if (classNames.includes('Working') && !hasWorkingTitle(svProfile?.workingTitle)) {
    sv.push('Working title');
  }

  // Character assessment (WB) for young Adult and Working dogs (Mandy 2026-10-09, BRG rule —
  // see SV_WB_REQUIRED_CLASSES). The label matches the "Character Assessment"
  // tick on the dog's SV health card, where the owner sets it. A missing date
  // of birth is not guessed at; the dog form requires one anyway.
  if (
    classNames.some((n) => SV_WB_REQUIRED_CLASSES.includes(n)) &&
    bornOnOrAfter(dog.dateOfBirth, SV_WB_BORN_ON_OR_AFTER) &&
    !svProfile?.wb
  ) {
    sv.push('Character Assessment (WB)');
  }

  // A pedigree field the SV declaration also checks is already on an SV line.
  const svFields = new Set<string>(SV_ENTRY_DOG_FIELDS.map((f) => f.field));
  const pedigreeNotInSv = PEDIGREE_FIELDS.filter((f) => blank(dog[f.key]) && !svFields.has(f.key)).map(
    (f) => f.label,
  );
  return { pedigree, sv, pedigreeNotInSv, all: [...sv, ...pedigreeNotInSv] };
}

/** The refusal shown to an exhibitor. */
export function entryBlockedMessage(
  dogName: string | null | undefined,
  missing: string[]
): string {
  return `${dogName ?? 'This dog'} can't be entered yet — still needed: ${missing.join(', ')}.`;
}

/** The softer wording a secretary sees when she has saved anyway. */
export function entryIncompleteMessage(
  dogName: string | null | undefined,
  missing: string[]
): string {
  return `Saved, but ${dogName ?? 'this dog'} is missing ${missing.join(', ')}. It will print blank in the catalogue until that is filled in.`;
}
