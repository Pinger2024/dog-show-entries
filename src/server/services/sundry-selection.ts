/**
 * ONE owner for "is this a valid sundry-item selection" — extracted from
 * `orders.checkout` (src/server/trpc/routers/orders.ts), which used to be
 * the only place any of these rules were enforced.
 *
 * Before this file, `secretary.createManualEntry`
 * (src/server/trpc/routers/secretary.ts) had its OWN, smaller copy of the
 * same lookup: it checked existence / show membership / enabled, but never
 * aggregated duplicate lines and never checked `maxPerOrder` at all — so the
 * per-order cap that stops an exhibitor over-buying online (bug hunt #27, see
 * `sundry-cap.test.ts`) was simply absent on the manual-entry path. That is a
 * rule written down twice, disagreeing with itself, per CLAUDE.md's "One
 * owner per rule".
 *
 * This function performs every check checkout performs today, unchanged, and
 * returns a structured result instead of throwing — the caller decides what
 * to do with each violation kind:
 *  - `orders.checkout` throws on ANY violation (not_found/wrong_show/disabled
 *    collapse into one message, exactly as before; over_max gets its own).
 *  - `secretary.createManualEntry` throws on not_found/wrong_show/disabled
 *    (its existing behaviour) but does NOT enforce `over_max` — see the
 *    comment at its call site for why.
 */
import { and, eq, inArray } from 'drizzle-orm';
import type { db as Database } from '@/server/db';
import { sundryItems } from '@/server/db/schema';

export type SundrySelectionInput = {
  sundryItemId: string;
  quantity: number;
};

export type ValidatedSundryItem = {
  sundryItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
};

export type SundryViolation = {
  sundryItemId: string;
  /** Item name, when known — absent for `not_found` (we have no row). */
  name?: string;
  kind: 'not_found' | 'disabled' | 'wrong_show' | 'over_max';
  requested: number;
  max?: number;
};

export type SundrySelectionResult = {
  items: ValidatedSundryItem[];
  violations: SundryViolation[];
};

/**
 * Validate a requested set of sundry-item lines against one show's catalogue.
 *
 * Quantities are aggregated per `sundryItemId` BEFORE the `maxPerOrder` check,
 * exactly as checkout has done since bug hunt #27 — so the cap cannot be
 * bypassed by splitting one quantity across duplicate cart lines (e.g. two
 * lines of 2 when the cap is 2).
 *
 * Existence, show-membership and enabled are all resolved from ONE query
 * scoped to `(id IN requested, showId = showId, enabled = true)`: a row that
 * does not come back is either unknown, disabled, or belongs to another show,
 * and this function reports which (`not_found` only when the id is not a
 * sundry item at all; `wrong_show` / `disabled` when a row for that id exists
 * but was excluded by one of those conditions) — callers that used to collapse
 * all three into one message (checkout) can keep doing so; callers that want
 * to tell them apart now can.
 */
export async function validateSundrySelection(
  database: typeof Database,
  params: {
    showId: string;
    items: SundrySelectionInput[];
  },
): Promise<SundrySelectionResult> {
  const { showId, items } = params;

  if (items.length === 0) {
    return { items: [], violations: [] };
  }

  const requestedIds = items.map((i) => i.sundryItemId);

  // Aggregate quantities per item before validating — see bug hunt #27 in the
  // doc comment above.
  const qtyByItem = new Map<string, number>();
  for (const requested of items) {
    qtyByItem.set(
      requested.sundryItemId,
      (qtyByItem.get(requested.sundryItemId) ?? 0) + requested.quantity,
    );
  }

  // One query resolves existence + show-membership + enabled together, same
  // as checkout always has.
  const availableItems = await database.query.sundryItems.findMany({
    where: and(
      inArray(sundryItems.id, requestedIds),
      eq(sundryItems.showId, showId),
      eq(sundryItems.enabled, true),
    ),
  });
  const availableMap = new Map(availableItems.map((i) => [i.id, i]));

  // Only needed to tell not_found apart from wrong_show/disabled for callers
  // that care (checkout does not; it reports one message for all three).
  let anyByIdMap: Map<string, { id: string; name: string; showId: string; enabled: boolean }> | null = null;
  async function anyById(id: string) {
    if (anyByIdMap == null) {
      const rows = await database.query.sundryItems.findMany({
        where: inArray(sundryItems.id, requestedIds),
      });
      anyByIdMap = new Map(rows.map((r) => [r.id, r]));
    }
    return anyByIdMap.get(id);
  }

  const validated: ValidatedSundryItem[] = [];
  const violations: SundryViolation[] = [];

  for (const [sundryItemId, quantity] of qtyByItem) {
    const item = availableMap.get(sundryItemId);
    if (!item) {
      const anyRow = await anyById(sundryItemId);
      if (!anyRow) {
        violations.push({ sundryItemId, kind: 'not_found', requested: quantity });
      } else if (anyRow.showId !== showId) {
        violations.push({ sundryItemId, name: anyRow.name, kind: 'wrong_show', requested: quantity });
      } else {
        violations.push({ sundryItemId, name: anyRow.name, kind: 'disabled', requested: quantity });
      }
      continue;
    }

    if (item.maxPerOrder != null && quantity > item.maxPerOrder) {
      violations.push({
        sundryItemId,
        name: item.name,
        kind: 'over_max',
        requested: quantity,
        max: item.maxPerOrder,
      });
    }

    validated.push({
      sundryItemId: item.id,
      name: item.name,
      quantity,
      unitPrice: item.priceInPence,
    });
  }

  return { items: validated, violations };
}
