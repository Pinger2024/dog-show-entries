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
  pedigreeMissingForEntry,
  hasWorkingTitle,
  type SvHealthProfile,
  type SvPedigree,
} from './sv-entry-readiness';
import { SV_HEALTH_FROM_CLASSES } from './sv-entry-validation';

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
};

export type EntryRequirementProfile = SvHealthProfile & {
  workingTitle?: string | null;
};

/**
 * Everything this dog is missing before it may be entered into these classes.
 * Empty array means it is ready.
 *
 * `showRuleset` gates the SV/WUSV half — a standard RKC show needs only the
 * baseline pedigree the catalogue prints.
 */
export function entryRequirementsMissing(opts: {
  dog: EntryRequirementDog;
  svProfile?: EntryRequirementProfile | null;
  /** Raw class-definition names being entered. */
  classNames: string[];
  showRuleset?: string | null;
}): string[] {
  const { dog, svProfile, classNames, showRuleset } = opts;

  // Every show: sire, dam, breeder and colour all print in the catalogue.
  const missing = [...pedigreeMissingForEntry(dog)];

  if (showRuleset !== 'wusv') return missing;

  // Health is demanded from the Yearling class up — the same rule
  // svEntryMissingRequirements applied via SV_HEALTH_FROM_CLASSES, expressed
  // once here and handed to svMissingRequirements as `healthRequired`.
  const healthRequired = classNames.some((n) => SV_HEALTH_FROM_CLASSES.has(n));

  const pedigree: SvPedigree = {
    sireName: dog.sireName,
    sireRegistrationNumber: dog.sireRegistrationNumber,
    damName: dog.damName,
    damRegistrationNumber: dog.damRegistrationNumber,
    breederName: dog.breederName,
    breederCity: dog.breederCity,
    breederPostcode: dog.breederPostcode,
  };

  missing.push(
    ...svMissingRequirements({
      coatType: dog.coatType,
      healthRequired,
      profile: svProfile ?? {},
      pedigree,
      ownRegistrationNumber: dog.kcRegNumber ?? '',
      registrationBody: dog.registrationBody ?? '',
      microchipNumber: dog.microchipNumber ?? '',
    })
  );

  // The Working class wants a working title on top. `hasWorkingTitle` rejects
  // BH / AD / WB — recorded qualifications, but not working ones — so a dog
  // holding only those is told it cannot enter Working rather than being
  // quietly admitted (Mandy 2026-08-19).
  if (classNames.includes('Working') && !hasWorkingTitle(svProfile?.workingTitle)) {
    missing.push('Working title');
  }

  // svMissingRequirements and pedigreeMissingForEntry overlap on the sire and
  // dam (one wants the name, the other the name AND registration number), so
  // the same dog can produce two lines about one field. De-duplicate on the
  // exact text; the SV wording is the more specific of the two and both are
  // kept only when they genuinely differ.
  return [...new Set(missing)];
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
