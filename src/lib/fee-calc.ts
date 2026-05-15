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
 */

export type DogEntryInput = {
  /** Stable id used as the key in the per-entry breakdown (typically entry.id). */
  key: string;
  /** Pricing kind. JH and NFC bypass the multi-dog and discount-group rules. */
  kind: 'standard' | 'junior_handler' | 'nfc';
  /** Number of classes entered for this dog. */
  classCount: number;
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
  /** Number of distinct paying dogs (used for threshold and on-screen messaging). */
  payingDogCount: number;
  /** Pence saved vs. paying each paying dog's first-class fee individually. 0 if not applied. */
  multiDogSavings: number;
  perEntry: EntryFeeBreakdown[];
};

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
  const subsequent = ctx.subsequentEntryFeePence ?? ctx.firstEntryFeePence ?? 0;
  const firstFee = payingFirstClassFee(ctx);
  const packagePence = paidPackagePence(ctx);

  const payingEntries = entries.filter((e) => e.kind === 'standard');
  const payingDogCount = payingEntries.length;
  const multiDogApplied =
    packagePence != null &&
    ctx.multiDogThreshold != null &&
    payingDogCount >= ctx.multiDogThreshold;

  // Pre-compute the package split for the paying entries' first-class slot
  // so the entry_classes breakdown lines up. Rounding remainder lands on
  // the last paying entry so the per-entry sum exactly equals the package.
  const packageSplits: number[] = [];
  if (multiDogApplied && packagePence != null && payingDogCount > 0) {
    const perDog = Math.floor(packagePence / payingDogCount);
    const remainder = packagePence - perDog * payingDogCount;
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

    // Standard paying entry
    const firstSlot = multiDogApplied ? packageSplits[payingIdx]! : firstFee;
    payingIdx++;
    const extras = Math.max(entry.classCount - 1, 0);
    const perClassFees: number[] = [];
    if (entry.classCount > 0) perClassFees.push(firstSlot);
    for (let i = 0; i < extras; i++) perClassFees.push(subsequent);
    const fee = firstSlot + subsequent * extras;
    return { key: entry.key, fee, perClassFees };
  });

  const total = perEntry.reduce((sum, e) => sum + e.fee, 0);
  const multiDogSavings = multiDogApplied
    ? Math.max(firstFee * payingDogCount - (packagePence ?? 0), 0)
    : 0;

  return {
    total,
    multiDogApplied,
    payingDogCount,
    multiDogSavings,
    perEntry,
  };
}
