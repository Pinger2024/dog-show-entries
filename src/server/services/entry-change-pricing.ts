/**
 * ONE owner for "what does changing the classes on an existing entry cost."
 *
 * Before this, `entries.update` (src/server/trpc/routers/entries.ts) priced a
 * class change properly — the RKC first/subsequent engine (`computeOrderFees`)
 * or the regional scale (`computeRegionalOrderFees` with
 * `countPriorRegionalPayingDogs`), Special Award Class fees via
 * `specialAwardClassFee`, sibling entries in the same order, the discount
 * group, the multi-dog package — while the edit page
 * (src/app/(shows)/shows/[id]/entries/[entryId]/edit/page.tsx) computed its
 * own `newTotal` as a raw SUM of each selected class's `entryFee`. That raw
 * sum is wrong whenever first/subsequent fees, the regional scale, a package
 * or a discount applies (`show_classes.entryFee` is seeded to
 * `firstEntryFee`, so 3 classes read as 3x first fee instead of first + 2x
 * subsequent) — and the top-up payment screen showed that wrong client
 * figure while Stripe charged the correct server figure.
 *
 * This function is the READ-ONLY pricing half of that computation — every
 * query and every branch `entries.update` used to price a class change,
 * moved out verbatim. It performs NO writes. `entries.update` calls it and
 * then does the writes (apply the class change, sibling re-slot, payment
 * intent, refund, audit log); `entries.previewUpdate` calls it and returns
 * the numbers with no writes at all. Do not hand-roll a third computation —
 * see CLAUDE.md "One owner per rule".
 */
import { TRPCError } from '@trpc/server';
import { and, eq, isNull, inArray } from 'drizzle-orm';
import type { db as Database } from '@/server/db';
import {
  entries,
  showClasses,
  orders,
  showDiscountGroups,
} from '@/server/db/schema';
import { countPriorRegionalPayingDogs } from '@/server/services/regional-pricing';
import { priorPackageStanding } from '@/server/services/package-pricing';
import {
  computeOrderFees,
  type DogEntryInput,
  type FeeContext,
} from '@/lib/fee-calc';
import {
  computeRegionalOrderFees,
  regionalClassFlatFee,
  type RegionalDogEntryInput,
  type RegionalFeeContext,
} from '@/lib/regional-fee-calc';
import { specialAwardClassFee } from '@/lib/class-labels';
import { entryClassChangeBlock, ENTRY_CLASS_CHANGE_MESSAGES } from '@/lib/entry-edit-rules';

export type EntryChangePricing = {
  /** The entry as loaded (show, entryClasses, payments) — reuse, don't re-fetch. */
  entry: NonNullable<Awaited<ReturnType<typeof loadEntry>>>;
  newClasses: Awaited<ReturnType<typeof loadNewClasses>>;
  oldFee: number;
  newFee: number;
  feeDiff: number;
  perClassFees: number[];
  requiresPayment: boolean;
  /**
   * RKC-order siblings whose fee re-slots alongside this edit (multi-dog
   * package rounding). Empty for regional shows (siblings are deliberately
   * left untouched there — the edited entry absorbs the whole order delta)
   * and for a deferred upgrade (siblings must not move until the top-up is
   * paid). `entries.update` applies these; `entries.previewUpdate` must not.
   */
  siblingFeeUpdates: { id: string; fee: number }[];
};

async function loadEntry(database: typeof Database, entryId: string) {
  return database.query.entries.findFirst({
    where: and(eq(entries.id, entryId), isNull(entries.deletedAt)),
    with: {
      show: true,
      entryClasses: true,
      payments: true,
    },
  });
}

async function loadNewClasses(database: typeof Database, classIds: string[], showId: string) {
  return database.query.showClasses.findMany({
    where: and(inArray(showClasses.id, classIds), eq(showClasses.showId, showId)),
    with: { classDefinition: { columns: { type: true, name: true } } },
  });
}

/**
 * Price a class change on an existing entry. Throws the same authorisation /
 * validation errors `entries.update` always threw — `previewUpdate` must
 * surface identical errors, so those checks live here rather than being
 * re-typed at each call site.
 */
export async function priceEntryClassChange(
  database: typeof Database,
  params: { entryId: string; classIds: string[]; userId: string },
): Promise<EntryChangePricing> {
  const { entryId, classIds, userId } = params;

  const entry = await loadEntry(database, entryId);

  if (!entry) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Entry not found' });
  }

  if (entry.exhibitorId !== userId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your entry' });
  }

  // ONE owner for who may change classes: entryClassChangeBlock
  // (lib/entry-edit-rules.ts) — a PAID entry, on a show whose window is still
  // open by entryWindowOpen (status AND close date; entry-change-preview.test.ts
  // case (f)). 'pending' used to be allowed: an unpaid entry could then be
  // confirmed and numbered by paying only a class top-up (bug hunt 2026-09-22).
  const block = entryClassChangeBlock(entry, entry.show);
  if (block) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: ENTRY_CLASS_CHANGE_MESSAGES[block] });
  }

  // Validate new classes
  const newClasses = await loadNewClasses(database, classIds, entry.showId);

  if (newClasses.length !== classIds.length) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'One or more classes are invalid',
    });
  }

  const oldFee = entry.totalFee;

  // Recompute fees via the shared service. When this entry is part of
  // an order we also load the order's discount-group + sibling entries
  // so the multi-dog package re-slots correctly. Without an order we
  // still use the service — it cleanly handles the simple single-entry
  // ladder case.
  const orderId = entry.orderId;
  let newFee: number;
  let perClassFees: number[];
  let siblingFeeUpdates: { id: string; fee: number }[] = [];

  const regionalCfg =
    entry.show.showRuleset === 'wusv' ? entry.show.regionalFeeConfig : null;

  if (regionalCfg != null) {
    // Regional (SV/WUSV) edit — price on the per-dog tier scale, NOT the raw
    // class fee (Mandy 2026-07-02). Checkout runs this engine but edits used
    // to fall through to the legacy per-class sum, so swapping a class
    // demanded a bogus top-up (a 3rd dog priced £16 jumped to £20). We
    // recompute the WHOLE order with the new class and let the edited entry
    // absorb the order-total delta, leaving siblings untouched: regional
    // per-dog attribution is order-arbitrary, so a swap that doesn't change
    // the order total costs nothing and moves no other dog's fee.
    const membershipOptions = regionalCfg.memberships ?? [
      { label: 'BRG/League member' },
    ];

    type RegSib = {
      id: string;
      entryType: string;
      totalFee: number;
      entryClasses: {
        showClass?: {
          entryFee: number;
          classDefinition?: { name: string | null; type: string | null } | null;
        } | null;
      }[];
    };

    // Reconstruct the exact context checkout used: the order's declared
    // membership + first-time status (persisted on the order) and every
    // sibling entry so the scale total is computed across the full order.
    let regionalMembershipLabel: string | null = null;
    let regionalFirstTime = false;
    // When this order was placed — only baskets placed before it count.
    let regionalPlacedAt: Date = entry.createdAt;
    let siblingEntries: RegSib[] = [
      {
        id: entryId,
        entryType: entry.entryType,
        totalFee: entry.totalFee,
        entryClasses: [],
      },
    ];

    if (orderId) {
      const [orderRow, dbSiblings] = await Promise.all([
        database.query.orders.findFirst({
          where: eq(orders.id, orderId),
          columns: {
            regionalMembership: true,
            regionalFirstTimeExhibitor: true,
            createdAt: true,
          },
        }),
        database.query.entries.findMany({
          where: and(eq(entries.orderId, orderId), isNull(entries.deletedAt)),
          with: {
            entryClasses: {
              columns: { id: true },
              with: {
                showClass: {
                  columns: { entryFee: true },
                  with: { classDefinition: { columns: { name: true, type: true } } },
                },
              },
            },
          },
        }),
      ]);
      regionalMembershipLabel = orderRow?.regionalMembership ?? null;
      regionalFirstTime = !!orderRow?.regionalFirstTimeExhibitor;
      siblingEntries = dbSiblings as RegSib[];
      if (orderRow?.createdAt) regionalPlacedAt = orderRow.createdAt;
    }

    const declared = regionalMembershipLabel
      ? membershipOptions.find((m) => m.label === regionalMembershipLabel)
      : undefined;
    const regionalCtx: RegionalFeeContext = {
      tiers: declared?.tiers ?? regionalCfg.tiers,
      isMember: !!declared && !declared.tiers,
      firstTimeExhibitor: regionalFirstTime && !!regionalCfg.firstTimeEnabled,
      firstTimeFeePence: regionalCfg.firstTimeFeePence ?? 0,
      juniorHandlerFeePence: entry.show.juniorHandlerFee ?? 0,
      // Dogs this exhibitor had at the show BEFORE this order keep their
      // scale positions while it is re-priced (Mandy 2026-09-16); a later
      // basket never counts, so the order prices exactly as it was charged.
      // The siblings below are this order's own dogs, so exclude it.
      priorPayingDogCount: await countPriorRegionalPayingDogs(database, {
        showId: entry.showId,
        exhibitorId: entry.exhibitorId,
        excludeOrderId: orderId,
        placedBefore: regionalPlacedAt,
      }),
    };

    // Regional dogs sit in one class. Use the NEW class for the edited entry,
    // each sibling's existing class for the rest. Flat detection uses the
    // config tiers exactly as checkout does (`resolveClassFlatFee`).
    const regionalEntries: RegionalDogEntryInput[] = siblingEntries.map((sib) => {
      const isEdited = sib.id === entryId;
      const cls = isEdited
        ? {
            name: newClasses[0]?.classDefinition?.name,
            type: newClasses[0]?.classDefinition?.type,
            entryFee: newClasses[0]?.entryFee,
          }
        : {
            name: sib.entryClasses[0]?.showClass?.classDefinition?.name,
            type: sib.entryClasses[0]?.showClass?.classDefinition?.type,
            entryFee: sib.entryClasses[0]?.showClass?.entryFee,
          };
      return {
        key: sib.id,
        kind:
          (isEdited ? entry.entryType : sib.entryType) === 'junior_handler'
            ? 'junior_handler'
            : 'standard',
        flatFeePence: regionalClassFlatFee(
          { className: cls.name, classType: cls.type, entryFee: cls.entryFee ?? null },
          regionalCfg.tiers,
        ),
      };
    });

    const regionalResult = computeRegionalOrderFees(regionalEntries, regionalCtx);
    const newOrderTotal = regionalResult.entriesTotal;
    const oldOrderTotal = siblingEntries.reduce((sum, s) => sum + s.totalFee, 0);
    // The edited entry absorbs the whole order delta; siblings stay put. So
    // feeDiff (= newFee − oldFee, below) is exactly the order-level change,
    // and the existing upgrade/downgrade + refund path handles it unchanged.
    newFee = oldFee + (newOrderTotal - oldOrderTotal);
    // Regional entries carry one fee per dog — attribute it to the first
    // class slot (0 for any extra NFC classes) so the rows sum to newFee.
    perClassFees = newClasses.map((_, i) => (i === 0 ? newFee : 0));
  } else if (entry.show.firstEntryFee != null) {
    const entryKind = entry.entryType === 'junior_handler'
      ? 'junior_handler'
      : entry.isNfc
        ? 'nfc'
        : 'standard';

    let discountGroup: FeeContext['discountGroup'] = null;
    // When this order was placed — earlier baskets count toward the package,
    // later ones never re-price it (see priorPackageStanding).
    let placedAt: Date = entry.createdAt;
    type SiblingClass = { id: string; showClass?: { entryFee: number; classDefinition?: { type: string; name: string } | null } | null };
    let siblingEntries: { id: string; entryType: string; isNfc: boolean; entryClasses: SiblingClass[]; totalFee: number }[] = [
      {
        id: entryId,
        entryType: entry.entryType,
        isNfc: entry.isNfc,
        entryClasses: newClasses.map((_, i) => ({ id: `c${i}` })),
        totalFee: entry.totalFee,
      },
    ];

    if (orderId) {
      const [orderRow, dbSiblings] = await Promise.all([
        database.query.orders.findFirst({
          where: eq(orders.id, orderId),
          columns: { discountGroupId: true, createdAt: true },
        }),
        database.query.entries.findMany({
          where: and(eq(entries.orderId, orderId), isNull(entries.deletedAt)),
          with: {
            entryClasses: {
              columns: { id: true },
              with: { showClass: { columns: { entryFee: true }, with: { classDefinition: { columns: { type: true, name: true } } } } },
            },
          },
        }),
      ]);
      siblingEntries = dbSiblings;
      if (orderRow?.createdAt) placedAt = orderRow.createdAt;

      if (orderRow?.discountGroupId) {
        const dg = await database.query.showDiscountGroups.findFirst({
          where: eq(showDiscountGroups.id, orderRow.discountGroupId),
        });
        if (dg) {
          discountGroup = {
            firstEntryFeePence: dg.firstEntryFeePence,
            multiDogPackagePence: dg.multiDogPackagePence,
          };
        }
      }
    }

    const feeCtx: FeeContext = {
      firstEntryFeePence: entry.show.firstEntryFee,
      subsequentEntryFeePence: entry.show.subsequentEntryFee,
      nfcEntryFeePence: entry.show.nfcEntryFee,
      juniorHandlerFeePence: entry.show.juniorHandlerFee,
      multiDogThreshold: entry.show.multiDogThreshold,
      multiDogPackagePence: entry.show.multiDogPackagePence,
      discountGroup,
      // The exhibitor's dogs from baskets placed BEFORE this one count toward
      // the multi-dog package (per exhibitor per show, Mandy 2026-09-28), so
      // the order re-prices exactly as it was charged and a later basket never
      // shifts it. ONE owner: priorPackageStanding.
      prior: await priorPackageStanding(database, {
        showId: entry.showId,
        exhibitorId: entry.exhibitorId,
        show: entry.show,
        excludeOrderId: orderId,
        placedBefore: placedAt,
      }),
    };

    // Special Award Classes charge their own fee, not the tier (Mandy
    // 2026-07-19). ONE owner: specialAwardClassFee. The edited entry's
    // specials come from newClasses; each sibling's from its loaded show
    // classes.
    const specialFeesFor = (e: (typeof siblingEntries)[number]): (number | null)[] =>
      e.id === entryId
        ? newClasses.map((sc) => specialAwardClassFee(sc))
        : e.entryClasses.map((ec) =>
            ec.showClass ? specialAwardClassFee(ec.showClass) : null,
          );
    const dogEntries: DogEntryInput[] = siblingEntries.map((e) => ({
      key: e.id,
      kind: (e.id === entryId ? entryKind : e.entryType === 'junior_handler'
        ? 'junior_handler'
        : e.isNfc
          ? 'nfc'
          : 'standard'),
      classCount: e.id === entryId ? newClasses.length : e.entryClasses.length,
      specialClassFees: specialFeesFor(e),
    }));

    const result = computeOrderFees(dogEntries, feeCtx);
    const myBreak = result.perEntry.find((b) => b.key === entryId)!;
    newFee = myBreak.fee;
    perClassFees = myBreak.perClassFees;

    // Re-slot sibling fees only when an order exists — the multi-dog
    // package may have shifted across rounding. Skip for a deferred upgrade
    // (newFee > oldFee): siblings must not move until the adjustment is paid.
    // Computed here, APPLIED by the caller (entries.update) — this function
    // performs no writes.
    if (orderId && newFee <= oldFee) {
      for (const sib of siblingEntries) {
        if (sib.id === entryId) continue;
        const sibBreak = result.perEntry.find((b) => b.key === sib.id);
        if (sibBreak && sibBreak.fee !== sib.totalFee) {
          siblingFeeUpdates.push({ id: sib.id, fee: sibBreak.fee });
        }
      }
    }
  } else {
    // Legacy per-class fallback for shows that never set show-level fees.
    newFee = newClasses.reduce((sum, sc) => sum + sc.entryFee, 0);
    perClassFees = newClasses.map((sc) => sc.entryFee);
  }

  const feeDiff = newFee - oldFee;

  return {
    entry,
    newClasses,
    oldFee,
    newFee,
    feeDiff,
    perClassFees,
    requiresPayment: feeDiff > 0,
    siblingFeeUpdates,
  };
}
