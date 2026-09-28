/**
 * Compute the total order fee + per-entry attribution for a set of dog
 * entries at one show, with optional discount group and multi-dog package.
 *
 * Rules locked with Amanda 2026-05-14:
 *  - "First entry fee" is per dog for its first class.
 *  - "Subsequent entry fee" is the same dog in additional classes.
 *  - JH and NFC are flat per-entry fees and never count toward multi-dog,
 *    and the multi-dog package never replaces their fees.
 *  - Discount group (e.g. "Members") replaces the first-class fee only.
 *    Extra-class fees stay on the show-wide subsequent rate.
 *  - Multi-dog package: when N distinct paying dogs are entered (N >= threshold),
 *    the sum of their first-class fees is replaced by a flat package price.
 *    Package is flat for any count >= threshold — 10 dogs pay the same package
 *    price as 3 dogs.
 *  - Discount group + multi-dog stack: a declared member gets the member package.
 *  - The package is per exhibitor per SHOW, not per basket (Mandy 2026-09-28 —
 *    the regional rule of 2026-09-16 applied to RKC packages). Dogs already
 *    entered in earlier paid baskets count toward the threshold, and what was
 *    already paid for their first classes comes off the package, so a 3rd dog
 *    entered a week later pays only what is left of it. See `prior`.
 */

/**
 * Platform handling fee the exhibitor pays on top of the club-collected
 * subtotal (entries + sundry + donation): £1 + 1%, in whole pence.
 *
 * SINGLE SOURCE OF TRUTH. The server charges exactly this at checkout
 * (`orders` router → Stripe) and the checkout preview shows exactly this,
 * so the figure the exhibitor sees before paying matches the charge to the
 * penny. `src/server/services/stripe.ts` re-exports this — do not fork it.
 * Michael is sensitive about fee accuracy; keep the two in lockstep.
 */
export function calculatePlatformFee(subtotalPence: number): number {
  return 100 + Math.round(subtotalPence * 0.01);
}

export type DogEntryInput = {
  /** Stable id used as the key in the per-entry breakdown (typically entry.id). */
  key: string;
  /** Pricing kind. JH and NFC bypass the multi-dog and discount-group rules. */
  kind: 'standard' | 'junior_handler' | 'nfc';
  /** Number of classes entered for this dog. */
  classCount: number;
  /**
   * Optional per-class override for Special Award Classes, aligned to the same
   * order the caller lists this dog's classes (so `perClassFees[i]` still lines
   * up with the caller's `classIds[i]`). Each slot is either:
   *   - a number → this class is a Special Award Class, charged this own fee,
   *     OUTSIDE the first/subsequent tier and the multi-dog package; or
   *   - null/undefined → a normal tier-priced class.
   * When omitted entirely, every class is tier-priced (unchanged behaviour).
   * A dog whose classes are ALL special isn't a "paying dog" — it pays only its
   * special fees, never a first-entry fee (Mandy 2026-07-19).
   */
  specialClassFees?: (number | null)[];
};

export type DiscountGroupConfig = {
  firstEntryFeePence: number;
  /** Package price for this group when multi-dog threshold is met. Null = use standard package. */
  multiDogPackagePence: number | null;
};

export type FeeContext = {
  firstEntryFeePence: number | null;
  subsequentEntryFeePence: number | null;
  nfcEntryFeePence: number | null;
  juniorHandlerFeePence: number | null;
  multiDogThreshold: number | null;
  multiDogPackagePence: number | null;
  /** The discount group the exhibitor declared at checkout, or null. */
  discountGroup?: DiscountGroupConfig | null;
  /**
   * This exhibitor's dogs ALREADY entered at this show in earlier paid
   * baskets: how many paying dogs, and what their first classes cost in
   * total. The package is per exhibitor per show (Mandy 2026-09-28), so these
   * count toward the threshold and come off the package price. Get it from
   * `priorPackageStanding` in server/services/package-pricing.ts — never
   * hand-roll the query. Null/undefined → nothing entered before.
   */
  prior?: PriorPackageStanding | null;
};

/** Dogs an exhibitor already has at a show, for the multi-dog package. */
export type PriorPackageStanding = {
  /** Paying dogs (a normal class, not JH / NFC / Special-Award-only). */
  payingDogCount: number;
  /** What those dogs' FIRST normal classes cost in total, in pence. */
  firstClassPaidPence: number;
};

export type EntryFeeBreakdown = {
  key: string;
  /** Total fee charged for this entry (sum of perClassFees). */
  fee: number;
  /** Fee attributed to each class index, used for the entry_classes row breakdown. */
  perClassFees: number[];
};

export type OrderFeeResult = {
  total: number;
  /** True if the multi-dog package was applied to this order. */
  multiDogApplied: boolean;
  /** Number of distinct paying dogs in THIS basket. */
  payingDogCount: number;
  /** Paying dogs at the show once this basket is added — earlier baskets'
   *  dogs plus this one's. What the threshold is tested against, and what the
   *  "you've entered N dogs" message should say. */
  showPayingDogCount: number;
  /** Pence saved vs. paying each paying dog's first-class fee individually. 0 if not applied. */
  multiDogSavings: number;
  perEntry: EntryFeeBreakdown[];
};

/** The fee for a dog's second and later normal classes — the show-wide
 *  subsequent rate, falling back to the first-entry fee. Discount groups never
 *  change it (rules above). ONE owner: the engine and `priorPackageStanding`
 *  both read it from here. */
export function subsequentClassFee(
  ctx: Pick<FeeContext, 'subsequentEntryFeePence' | 'firstEntryFeePence'>,
): number {
  return ctx.subsequentEntryFeePence ?? ctx.firstEntryFeePence ?? 0;
}

function payingFirstClassFee(ctx: FeeContext): number {
  if (ctx.discountGroup) return ctx.discountGroup.firstEntryFeePence;
  return ctx.firstEntryFeePence ?? 0;
}

function paidPackagePence(ctx: FeeContext): number | null {
  if (ctx.multiDogThreshold == null) return null;
  if (ctx.discountGroup?.multiDogPackagePence != null) {
    return ctx.discountGroup.multiDogPackagePence;
  }
  return ctx.multiDogPackagePence;
}

export function computeOrderFees(
  entries: DogEntryInput[],
  ctx: FeeContext,
): OrderFeeResult {
  const subsequent = subsequentClassFee(ctx);
  const firstFee = payingFirstClassFee(ctx);
  const packagePence = paidPackagePence(ctx);

  // A dog counts as a "paying dog" (toward the multi-dog package + the first/
  // subsequent tier) only if it has at least one NORMAL (non-special) class.
  // A dog entered only in Special Award Classes pays just those flat fees.
  const regularClassCount = (e: DogEntryInput): number => {
    if (e.specialClassFees == null) return e.classCount;
    let n = 0;
    for (let i = 0; i < e.classCount; i++) if (e.specialClassFees[i] == null) n++;
    return n;
  };
  const payingEntries = entries.filter(
    (e) => e.kind === 'standard' && regularClassCount(e) > 0,
  );
  const payingDogCount = payingEntries.length;
  // Dogs from earlier paid baskets count toward the threshold (per exhibitor
  // per show), and what their first classes already cost comes off the
  // package.
  const priorDogs = Math.max(0, ctx.prior?.payingDogCount ?? 0);
  const priorPaid = Math.max(0, ctx.prior?.firstClassPaidPence ?? 0);
  const showPayingDogCount = priorDogs + payingDogCount;
  const multiDogApplied =
    packagePence != null &&
    ctx.multiDogThreshold != null &&
    payingDogCount > 0 &&
    showPayingDogCount >= ctx.multiDogThreshold;

  // What this basket's first classes cost between them under the package:
  // whatever is left of it after the earlier baskets, never more than the
  // dogs' normal first-class fees. With nothing entered before this is the
  // package price itself — the rule as it always was.
  const firstClassBudget =
    multiDogApplied && packagePence != null
      ? priorDogs > 0
        ? Math.min(firstFee * payingDogCount, Math.max(0, packagePence - priorPaid))
        : packagePence
      : 0;

  // Split it across the paying entries' first-class slot so the
  // entry_classes breakdown lines up. Rounding remainder lands on the last
  // paying entry so the per-entry sum exactly equals the budget.
  const packageSplits: number[] = [];
  if (multiDogApplied && payingDogCount > 0) {
    const perDog = Math.floor(firstClassBudget / payingDogCount);
    const remainder = firstClassBudget - perDog * payingDogCount;
    for (let i = 0; i < payingDogCount; i++) {
      packageSplits.push(i === payingDogCount - 1 ? perDog + remainder : perDog);
    }
  }

  let payingIdx = 0;
  const perEntry: EntryFeeBreakdown[] = entries.map((entry) => {
    if (entry.kind === 'junior_handler') {
      const jh = ctx.juniorHandlerFeePence ?? 0;
      // JH is a flat per-entry fee — attribute to the first class slot,
      // zeroes for the rest. classCount is usually 1 in practice.
      const perClassFees = entry.classCount > 0
        ? [jh, ...Array(entry.classCount - 1).fill(0)]
        : [jh];
      return { key: entry.key, fee: jh, perClassFees };
    }

    if (entry.kind === 'nfc') {
      const nfc = ctx.nfcEntryFeePence ?? 0;
      const slots = Math.max(entry.classCount, 1);
      const perClassFees = Array(slots).fill(nfc);
      const fee = nfc * slots;
      // If classCount was 0 we still attribute one class slot's worth of
      // fee — orders.ts has historically charged this way. Callers
      // creating entry_classes rows should skip the insert when
      // classCount === 0 (zero classes means no row to attribute to).
      return { key: entry.key, fee, perClassFees: entry.classCount === 0 ? [] : perClassFees };
    }

    // Standard entry. Special Award Classes are charged their own fee and sit
    // OUTSIDE the tier + package; the dog's normal classes are priced first /
    // subsequent as usual. A dog with no normal classes never pays a first fee.
    const hasRegular = regularClassCount(entry) > 0;
    const firstSlot = multiDogApplied && hasRegular ? packageSplits[payingIdx]! : firstFee;
    if (hasRegular) payingIdx++;
    let seenRegular = false;
    const perClassFees: number[] = [];
    for (let i = 0; i < entry.classCount; i++) {
      const specialFee = entry.specialClassFees?.[i];
      if (specialFee != null) {
        perClassFees.push(specialFee); // Special Award Class — its own fee
      } else if (!seenRegular) {
        seenRegular = true;
        perClassFees.push(firstSlot); // first normal class
      } else {
        perClassFees.push(subsequent); // subsequent normal class
      }
    }
    const fee = perClassFees.reduce((sum, f) => sum + f, 0);
    return { key: entry.key, fee, perClassFees };
  });

  const total = perEntry.reduce((sum, e) => sum + e.fee, 0);
  const multiDogSavings = multiDogApplied
    ? Math.max(firstFee * payingDogCount - firstClassBudget, 0)
    : 0;

  return {
    total,
    multiDogApplied,
    payingDogCount,
    showPayingDogCount,
    multiDogSavings,
    perEntry,
  };
}
