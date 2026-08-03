/**
 * "Check before print" data-quality checks for the catalogue.
 *
 * Pure, DB-free rules run over owner name/address text so the secretary
 * catalogue page can surface a glance-list of records worth a second look
 * BEFORE printing — never a gate at entry time (Mandy: no new friction).
 *
 * Origin: a real exhibitor entered only her first name in the name field and
 * put her surname + street in the address field. Both catalogue render paths
 * print `ownerName` + `ownerAddress` verbatim, so it went to print as
 * "Karen" living at "Smith, 4 The Lane, Trowbridge" — the surname read as
 * part of the address, not the owner.
 *
 * These rules are deliberately dumb: false positives are fine (a secretary
 * skims a short list and either fixes the record or ignores it), false
 * negatives just mean the list didn't catch everything. Don't add "clever"
 * heuristics (initials detection, name dictionaries, address parsing) —
 * that's gate-shaped complexity this feature explicitly avoids.
 */

export type OwnerCheckIssue =
  | 'single_word_name'
  | 'name_like_address_start'
  | 'missing_name'
  | 'missing_address';

export interface OwnerCheckInput {
  ownerName: string | null;
  ownerAddress: string | null;
  /**
   * True when the entry this owner came from has opted out of catalogue
   * publication (`entries.withholdFromPublication`). The catalogue render
   * substitutes "address withheld" for these — the address never prints —
   * so `missing_address` and `name_like_address_start` (both address-shaped
   * checks) are skipped. The owner NAME still prints, so `missing_name` and
   * `single_word_name` still apply.
   */
  addressWithheld?: boolean;
}

/** A single whitespace-delimited alphabetic word, apostrophes/hyphens allowed
 *  (e.g. "O'Brien", "Smith-Jones"). No digits — that's what tells "Smith" (a
 *  surname) apart from "4" or "12a" (a house number/name). */
const SINGLE_ALPHA_WORD = /^[a-z'-]+$/i;

function tokenCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

export function checkOwnerRecord(input: OwnerCheckInput): OwnerCheckIssue[] {
  const issues: OwnerCheckIssue[] = [];

  const name = (input.ownerName ?? '').trim();
  const address = (input.ownerAddress ?? '').trim();
  const addressWithheld = input.addressWithheld ?? false;

  // ── Name checks — the owner name always prints, withheld or not ──
  if (!name) {
    issues.push('missing_name');
  } else if (tokenCount(name) === 1) {
    // Exactly one token: "Karen", or an honorific alone like "Mrs". Two or
    // more tokens ("Mrs Smith", "Karen Smith") pass — we don't try to be
    // clever about initials ("J Smith" is fine, two tokens).
    issues.push('single_word_name');
  }

  // ── Address checks — skipped entirely when the address is withheld,
  //     since a withheld address never reaches the printed catalogue ──
  if (addressWithheld) return issues;

  if (!address) {
    issues.push('missing_address');
    return issues;
  }

  // First segment of the address: everything before the first comma or
  // newline (or the whole string if there's neither). "Smith, 4 The Lane" →
  // "Smith". "4 The Lane" (no comma) → "4 The Lane" itself.
  const firstSegment = address.split(/[,\n]/)[0].trim();
  const segmentTokens = firstSegment.split(/\s+/).filter(Boolean);
  if (segmentTokens.length === 1 && SINGLE_ALPHA_WORD.test(segmentTokens[0])) {
    // A single alphabetic word before the first comma reads as a surname,
    // not a house name/number. "Rose Cottage, ..." (two words) and
    // "4 The Lane" (digits) are left alone.
    issues.push('name_like_address_start');
  }

  return issues;
}
