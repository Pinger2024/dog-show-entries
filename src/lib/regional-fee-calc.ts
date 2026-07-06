/**
 * Regional (SV/WUSV) entry-fee engine — mirrors the BRG / Scottish Progressive
 * GSD Group fee structure (Mandy 2026-07-02, project_regional_fee_structure).
 *
 * Regionals price differently from RKC shows: every dog is in exactly ONE class
 * (one-dog-one-class rule), so the fee is a sliding scale on the NUMBER OF
 * DISTINCT DOGS an exhibitor enters — not first-class vs subsequent-class of the
 * same dog. Each position on the scale has a standard rate AND a member rate.
 *
 * Rules (Mandy 2026-07-02):
 *  - Tiered per-dog scale, e.g. 1st £20, 2nd £20, 3rd £16, 4th-onwards £0. The
 *    LAST tier applies to its position and every dog beyond it.
 *  - Each tier carries a member rate (e.g. £17/£17/£11/£0) applied when the
 *    exhibitor ticks "BRG/League member" (self-declared, never validated here).
 *  - First-time exhibitor: the FIRST dog is charged the flat first-time rate
 *    (BRG = £0 — "one entry free"); the remaining dogs pay their normal tier
 *    position (2nd, 3rd, …).
 *  - Junior Handler: a flat fee (BRG = £0) that does NOT consume a dog position.
 *
 * This engine computes the ENTRY-FEE subtotal only. Catalogue, sundries,
 * discretionary donation and any platform fee are layered on at checkout.
 */

export type RegionalDogEntryInput = {
  /** Stable id used as the key in the per-entry breakdown (typically entry.id). */
  key: string;
  /** Standard = a dog in a competitive class (consumes a tier position).
   *  Junior Handler = a flat-fee handler entry (does not consume a position). */
  kind: 'standard' | 'junior_handler';
};

export type RegionalFeeTier = {
  standardPence: number;
  memberPence: number;
};

export type RegionalFeeContext = {
  /** Ordered per-dog price schedule. The LAST tier applies to its own position
   *  and every dog beyond it — e.g. [t1,t2,t3,t4] means the 5th, 6th… dog all
   *  use t4. An empty schedule prices every dog at £0. */
  tiers: RegionalFeeTier[];
  /** Member rates apply — the exhibitor ticked "BRG/League member". */
  isMember: boolean;
  /** First-time exhibitor — the FIRST dog is charged firstTimeFeePence; the
   *  remaining dogs pay their normal tier position. */
  firstTimeExhibitor: boolean;
  /** The first-time exhibitor's first-dog fee. Null/undefined → £0. */
  firstTimeFeePence?: number | null;
  /** Junior Handler flat fee. Null/undefined → £0. */
  juniorHandlerFeePence?: number | null;
};

export type RegionalEntryFeeBreakdown = {
  key: string;
  /** Total fee for this entry. */
  fee: number;
  /** Per-class attribution for the entry_classes rows. Regional dogs sit in one
   *  class, so this is a single-element array. */
  perClassFees: number[];
  /** 1-based dog position on the tier scale; 0 for a Junior Handler entry. */
  position: number;
};

export type RegionalOrderFeeResult = {
  /** Entry-fee subtotal (excludes catalogue / sundries / donation / platform fee). */
  entriesTotal: number;
  perEntry: RegionalEntryFeeBreakdown[];
  /** Number of distinct paying dogs (positions consumed). */
  payingDogCount: number;
};

/** Price for the dog at 1-based `position` on the tier scale, honouring the
 *  member/standard column. The last tier applies to that position and beyond. */
function tierPrice(
  tiers: RegionalFeeTier[],
  position: number,
  isMember: boolean,
): number {
  if (tiers.length === 0) return 0;
  const idx = Math.min(position - 1, tiers.length - 1);
  const tier = tiers[idx]!;
  return isMember ? tier.memberPence : tier.standardPence;
}

export function computeRegionalOrderFees(
  entries: RegionalDogEntryInput[],
  ctx: RegionalFeeContext,
): RegionalOrderFeeResult {
  let position = 0;

  const perEntry: RegionalEntryFeeBreakdown[] = entries.map((entry) => {
    if (entry.kind === 'junior_handler') {
      const jh = ctx.juniorHandlerFeePence ?? 0;
      return { key: entry.key, fee: jh, perClassFees: [jh], position: 0 };
    }

    // Standard paying dog — consumes the next tier position.
    position += 1;
    // First-time exhibitor: only the FIRST dog gets the first-time rate; the
    // rest pay their normal tier position (Mandy 2026-07-05 — "one entry free",
    // so a first-timer with 3 dogs pays free + 2nd + 3rd, not all free).
    const fee =
      ctx.firstTimeExhibitor && position === 1
        ? ctx.firstTimeFeePence ?? 0
        : tierPrice(ctx.tiers, position, ctx.isMember);
    return { key: entry.key, fee, perClassFees: [fee], position };
  });

  const entriesTotal = perEntry.reduce((sum, e) => sum + e.fee, 0);
  return { entriesTotal, perEntry, payingDogCount: position };
}

/** The default BRG / Scottish Progressive tier schedule, in pence
 *  (Mandy 2026-07-02). Used to seed a new regional show's fee config. */
export const DEFAULT_REGIONAL_FEE_TIERS: RegionalFeeTier[] = [
  { standardPence: 2000, memberPence: 1700 }, // 1st dog
  { standardPence: 2000, memberPence: 1700 }, // 2nd dog
  { standardPence: 1600, memberPence: 1100 }, // 3rd dog
  { standardPence: 0, memberPence: 0 }, // 4th dog onwards
];
