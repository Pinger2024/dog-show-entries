/**
 * SV / WUSV regional entry requirements (Amanda 2026-05-28).
 *
 * A dog can't be entered at a regional show until its paperwork is complete:
 *  - EVERY dog: registration number + microchip.
 *  - Yearling class and above (Yearling, Adult, Working): hip score, elbow
 *    score, and DNA recording. Junior does NOT need the health triad
 *    (Amanda 2026-07-18 — it's Yearling onwards, not Junior).
 *  - Working class: additionally a working title.
 *
 * Returns a human-readable list of what's still missing (empty array = OK).
 * Both entry paths — secretary `entries.create` and exhibitor
 * `orders.checkout` — call this so they can't drift apart. The exhibitor
 * wizard (`enter/page.tsx`) imports this same set so client and server agree.
 */

import { hasWorkingTitle } from './sv-entry-readiness';

/** DB class-definition names from Yearling up, where health data is required. */
export const SV_HEALTH_FROM_CLASSES = new Set([
  'SV Yearling',
  'Adult',
  'Working',
]);

export interface SvEntryDog {
  kcRegNumber?: string | null;
  microchipNumber?: string | null;
}

export interface SvEntryProfile {
  hipGrade?: string | null;
  elbowGrade?: string | null;
  dna?: string | null;
  workingTitle?: string | null;
}

export function svEntryMissingRequirements(opts: {
  dog: SvEntryDog;
  svProfile?: SvEntryProfile | null;
  /** Raw class-definition names of the classes being entered. */
  classNames: string[];
}): string[] {
  const { dog, svProfile, classNames } = opts;
  const missing: string[] = [];
  const blank = (v?: string | null) => !v || !v.trim();
  // Health enums use 'not_required' as an explicit "not provided" sentinel.
  const notProvided = (v?: string | null) => !v || v === 'not_required';

  // Every dog at a regional needs identity paperwork.
  if (blank(dog.kcRegNumber)) missing.push('registration number');
  if (blank(dog.microchipNumber)) missing.push('microchip number');

  // Junior and above need the health triad.
  if (classNames.some((n) => SV_HEALTH_FROM_CLASSES.has(n))) {
    if (notProvided(svProfile?.hipGrade)) missing.push('hip score');
    if (notProvided(svProfile?.elbowGrade)) missing.push('elbow score');
    if (!svProfile?.dna) missing.push('DNA recording');
  }

  // Working class needs a working title on top of the above. `hasWorkingTitle`
  // is the shared predicate — it rejects BH / AD / WB, which are recorded
  // qualifications but not working ones, so a dog holding only those is told
  // it can't enter Working rather than being quietly admitted (Mandy
  // 2026-08-19).
  if (classNames.includes('Working') && !hasWorkingTitle(svProfile?.workingTitle)) {
    missing.push('working title');
  }

  return missing;
}

/** Friendly, exhibitor-facing message listing what's missing. */
export function svEntryBlockedMessage(dogName: string | null | undefined, missing: string[]): string {
  const name = dogName?.trim() || 'This dog';
  return `${name} can't be entered yet — please add: ${missing.join(', ')}. You can add these on the dog's profile (SV Health & Working Titles section), then try again.`;
}
