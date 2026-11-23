/**
 * Show-setup requirements shared by the secretary checklist and the
 * phase-blocker gate.
 *
 * Both `getChecklistAutoDetect` and `getPhaseBlockers`
 * (src/server/trpc/routers/secretary.ts) used to hand-type these same two
 * rules independently:
 *
 *  1. How many guarantors a show needs before entries can open — 6 for a
 *     championship show, 3 otherwise, waived entirely for SV/WUSV regional
 *     shows (Amanda 2026-05-19/20: SV shows aren't licensed under the RKC
 *     F-rules framework that requires guarantors).
 *  2. Whether the show's entry fees are considered "set" — a regional show
 *     prices via `regionalFeeConfig.tiers`, not `firstEntryFee` (Mandy
 *     2026-07-05).
 *
 * ONE owner per rule (CLAUDE.md): both procedures now call these.
 */

interface ShowGuarantorFields {
  showType: string;
  showRuleset: 'rkc' | 'wusv';
}

interface ShowFeesFields {
  firstEntryFee: number | null;
  regionalFeeConfig?: { tiers?: unknown[] | null } | null;
}

/**
 * The number of guarantors a show needs before entries can open. Returns 0
 * for an SV/WUSV regional show — the guarantor requirement is an RKC
 * F-regulations concept that doesn't apply to those shows at all, not a
 * lowered minimum.
 */
export function requiredGuarantorCount(show: ShowGuarantorFields): number {
  if (show.showRuleset === 'wusv') return 0;
  return show.showType === 'championship' ? 6 : 3;
}

/** Does this show have enough guarantors recorded? */
export function hasEnoughGuarantors(show: ShowGuarantorFields, count: number): boolean {
  return count >= requiredGuarantorCount(show);
}

/**
 * Are this show's entry fees configured? True for a regional show with at
 * least one priced tier, or an RKC show with a positive first-entry fee.
 */
export function showFeesConfigured(show: ShowFeesFields): boolean {
  const regionalFeesSet = !!(show.regionalFeeConfig?.tiers?.length);
  return regionalFeesSet || (show.firstEntryFee != null && show.firstEntryFee > 0);
}

// ── Secretary contact details ───────────────────────────────────────────────
//
// Mandy, 28 Oct 2026 (GSD Club of Scotland draft show): the setup wizard
// ticked "Fees & Setup" with only the secretary's name and email, while the
// lifecycle banner said "Secretary contact details incomplete" because it
// wanted all four. Two hand-typed copies of one rule. The rule is: the
// schedule and the entry form print the secretary's name, postal address,
// email and phone, so entries cannot open until all four are there.

/**
 * The secretary fields a show must carry before entries open, in the order
 * the forms show them. The labels are the words the secretary reads — the
 * form and the "still needed" hint both take them from here.
 */
export const SECRETARY_DETAIL_FIELDS = [
  { key: 'secretaryName', label: 'Name' },
  { key: 'secretaryEmail', label: 'Email' },
  { key: 'secretaryPhone', label: 'Phone' },
  { key: 'secretaryAddress', label: 'Postal address' },
] as const;

export type SecretaryDetailKey = (typeof SECRETARY_DETAIL_FIELDS)[number]['key'];

type SecretaryDetailFields = Partial<Record<SecretaryDetailKey, string | null | undefined>>;

/**
 * Which of the required secretary details are still blank (labels, in form
 * order). Whitespace counts as blank — a space typed to get past a required
 * box is not an address.
 */
export function missingSecretaryDetails(show: SecretaryDetailFields): string[] {
  return SECRETARY_DETAIL_FIELDS.filter((f) => !show[f.key]?.trim()).map((f) => f.label);
}

/**
 * Are the secretary's contact details complete? THE owner of that question:
 * the checklist auto-detect, the entries-open blocker and the setup wizard
 * all call this, so they cannot disagree again.
 */
export function secretaryDetailsComplete(show: SecretaryDetailFields): boolean {
  return missingSecretaryDetails(show).length === 0;
}
