/**
 * ONE owner for "what has this exhibitor already entered at this show" for the
 * RKC multi-dog package — the standing `computeOrderFees` takes as `prior`.
 *
 * Why this exists (Mandy 2026-09-28, North Eastern GSD Club Championship): the
 * package is per EXHIBITOR PER SHOW, not per basket. Every path built the
 * engine's input from the dogs in front of it, so Ann Robinson — 3 dogs on the
 * £40 member package — was charged £18 for a 4th dog entered a week later, and
 * Claire Starkey's 3rd dog would have cost £16 instead of the £8 left of her
 * package. The regional scale was fixed for the same fault on 18 Sept
 * (`countPriorRegionalPayingDogs`); this is the RKC half, and both use the SAME
 * rule for which earlier entries count (`heldPlaceConditions`).
 *
 * Every path that prices an RKC entry MUST pass this as `prior`: checkout,
 * entries.update, secretary.createManualEntry, and the enter-page preview (via
 * entries.packagePriorStanding). Already-paid entries are never re-priced.
 */
import { and, eq, type SQL } from 'drizzle-orm';
import type { db as Database } from '@/server/db';
import { entries, entryClasses, orders, showClasses, classDefinitions } from '@/server/db/schema';
import { subsequentClassFee, type PriorPackageStanding } from '@/lib/fee-calc';
import { isSpecialAwardClass } from '@/lib/class-labels';
import { heldPlaceConditions } from './regional-pricing';

const NONE: PriorPackageStanding = { payingDogCount: 0, firstClassPaidPence: 0 };

/**
 * Paying dogs this exhibitor already has at this show, and what their FIRST
 * normal classes cost between them.
 *
 * Counted: the entries `heldPlaceConditions` says hold a place (settled or
 * order-less, not cancelled / withdrawn / deleted / junior handler), minus NFC
 * entries and dogs entered only in Special Award Classes — neither was ever a
 * paying dog for the package.
 *
 * An entry stores a fee per class, not which class took the first-class slot,
 * so the first-class cost is the dog's normal-class fees less one subsequent
 * fee for each extra normal class (a dog's extra classes are always charged at
 * the show-wide subsequent rate — `subsequentClassFee`).
 *
 * `placedBefore`: when RE-pricing an existing order (entries.update), count
 * only baskets placed before it, so the order is priced exactly as it was at
 * checkout and a LATER basket can never shift an earlier one's paid fees.
 */
export async function priorPackageStanding(
  database: typeof Database,
  params: {
    showId: string;
    exhibitorId: string;
    show: {
      multiDogThreshold: number | null;
      firstEntryFee: number | null;
      subsequentEntryFee: number | null;
    };
    /** Order being re-priced — its own entries must not count as prior. */
    excludeOrderId?: string | null;
    /** Only baskets placed before this — see `heldPlaceConditions`. */
    placedBefore?: Date | null;
  },
): Promise<PriorPackageStanding> {
  // No package at this show — nothing earlier can change a price.
  if (params.show.multiDogThreshold == null || params.show.firstEntryFee == null) return NONE;

  const conditions: SQL[] = [
    ...heldPlaceConditions(params),
    eq(entries.isNfc, false),
  ];

  const rows = await database
    .select({
      entryId: entries.id,
      fee: entryClasses.fee,
      classType: classDefinitions.type,
      className: classDefinitions.name,
    })
    .from(entries)
    .leftJoin(orders, eq(entries.orderId, orders.id))
    .innerJoin(entryClasses, eq(entryClasses.entryId, entries.id))
    .innerJoin(showClasses, eq(showClasses.id, entryClasses.showClassId))
    .leftJoin(classDefinitions, eq(classDefinitions.id, showClasses.classDefinitionId))
    .where(and(...conditions));

  // A dog's normal (tier-priced) class fees. Special Award Classes sit outside
  // the tier and the package — ONE owner: isSpecialAwardClass, the same rule
  // checkout prices them with (specialAwardClassFee).
  const normalFeesByEntry = new Map<string, number[]>();
  for (const r of rows) {
    const list = normalFeesByEntry.get(r.entryId) ?? [];
    if (!isSpecialAwardClass({ classType: r.classType, className: r.className })) list.push(r.fee);
    normalFeesByEntry.set(r.entryId, list);
  }

  const subsequent = subsequentClassFee({
    subsequentEntryFeePence: params.show.subsequentEntryFee,
    firstEntryFeePence: params.show.firstEntryFee,
  });
  let payingDogCount = 0;
  let firstClassPaidPence = 0;
  for (const fees of normalFeesByEntry.values()) {
    if (fees.length === 0) continue; // Special-Award-only dog — not a paying dog
    payingDogCount += 1;
    const normalTotal = fees.reduce((sum, f) => sum + f, 0);
    firstClassPaidPence += Math.max(0, normalTotal - (fees.length - 1) * subsequent);
  }
  return { payingDogCount, firstClassPaidPence };
}
