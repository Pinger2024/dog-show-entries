/**
 * RKC registration flags — NAF / TAF / CNAF.
 *
 * Printed immediately after a dog's name wherever a show document names it:
 * "JOTOLEMAR SHOW STOPPER NAF TAF".
 *
 * - **NAF** — Name Applied For: registration applied for but not confirmed by
 *   the entry closing date; the dog is entered under its first-choice name.
 * - **TAF** — Transfer Applied For: ownership transfer applied for, not yet
 *   confirmed.
 * - **CNAF** — Change of Name Applied For.
 *
 * The RKC explicitly allows more than one at once ("write NAF or TAF or both
 * after it"), so these are independent booleans rather than a single status.
 *
 * They live on the ENTRY, not the dog — the status is judged as at the entry
 * closing date, so it is a per-show fact. See `entries.naf/taf/cnaf`.
 *
 * This module is the ONE place the suffix is built. Every render site must go
 * through it so the catalogue, the secretary's preview and the paperwork
 * exports can never disagree.
 */

export type RegistrationFlags = {
  naf?: boolean | null;
  taf?: boolean | null;
  cnaf?: boolean | null;
};

/** Fixed print order — NAF, then TAF, then CNAF. */
const FLAG_ORDER: ReadonlyArray<[keyof RegistrationFlags, string]> = [
  ['naf', 'NAF'],
  ['taf', 'TAF'],
  ['cnaf', 'CNAF'],
];

/**
 * The suffix to print after a dog's name, INCLUDING its leading space —
 * `" NAF TAF"` — or an empty string when no flag is set, so callers can
 * concatenate unconditionally without risking a trailing space.
 */
export function registrationFlagSuffix(
  flags: RegistrationFlags | null | undefined
): string {
  if (!flags) return '';
  const set = FLAG_ORDER.filter(([key]) => flags[key] === true).map(([, label]) => label);
  return set.length > 0 ? ` ${set.join(' ')}` : '';
}

/**
 * Append the registration flags to an already-formatted dog name.
 * Safe with an empty/nullish name (returns it unchanged) so catalogue rows for
 * a missing dog don't turn into a bare " NAF".
 */
export function appendRegistrationFlags(
  name: string | null | undefined,
  flags: RegistrationFlags | null | undefined
): string | null {
  if (name === null || name === undefined) return null;
  if (name === '') return '';
  return `${name}${registrationFlagSuffix(flags)}`;
}
