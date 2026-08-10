/**
 * Shared DB-query building blocks for reports that are served from more
 * than one route/procedure (a CSV or PDF and its new .xlsx twin, or a
 * tRPC query the Documents page uses for a client-built CSV and a report
 * route that needs the identical row set for its xlsx). Centralising the
 * WHERE clause / query here means the two consumers physically cannot
 * select a different set of rows — see report-rows.ts for the pure row
 * formatting these queries feed.
 *
 * Three "absentee-shaped" reports share the entries table but answer
 * different questions — NEVER reuse one where-clause builder for another:
 *   - paidConfirmedAbsentNonJhWhere: dogs absent on the day, PAID orders
 *     only, excludes Junior Handling — the printed/online catalogue's
 *     absentees page and its xlsx twin.
 *   - confirmedAbsentNonJhWhere: same shape, but ALL confirmed entries
 *     (not just paid) — the standalone Absentee Report CSV/xlsx.
 *   - withdrawnOrAbsentPaidWhere: withdrawn OR absent, paid orders only,
 *     INCLUDES Junior Handling — the Withdrawn & Absent CSV/xlsx.
 */
import { and, asc, eq, ilike, inArray, isNull, ne, sql } from 'drizzle-orm';
import { entries, dogOwners, orders, orderSundryItems, sundryItems, users } from '@/server/db/schema';
import type { Database } from '@/server/db';
import { CATALOGUE_NAME_PATTERN } from '@/lib/catalogue-utils';
import type { PrebookedCatalogueRow } from '@/components/reports/show-report-pdf';

// ── Absentee-shaped where clauses ────────────────────────────────────────

export function paidConfirmedAbsentNonJhWhere(showId: string, paidOrderIds: string[]) {
  return and(
    eq(entries.showId, showId),
    paidOrderIds.length > 0
      ? and(
          inArray(entries.orderId, paidOrderIds),
          eq(entries.status, 'confirmed'),
          eq(entries.absent, true),
          ne(entries.entryType, 'junior_handler'),
        )
      : sql`false`,
    isNull(entries.deletedAt),
  );
}

export function confirmedAbsentNonJhWhere(showId: string) {
  return and(
    eq(entries.showId, showId),
    eq(entries.status, 'confirmed'),
    eq(entries.absent, true),
    ne(entries.entryType, 'junior_handler'),
    isNull(entries.deletedAt),
  );
}

export function withdrawnOrAbsentPaidWhere(showId: string, paidOrderIds: string[]) {
  return and(
    eq(entries.showId, showId),
    paidOrderIds.length > 0 ? inArray(entries.orderId, paidOrderIds) : sql`false`,
    sql`(${entries.status} = 'withdrawn' OR ${entries.absent} = true)`,
    isNull(entries.deletedAt),
  );
}

/** Lean entry fetch shared by all three absentee-shaped reports — just
 *  enough relations for `buildAbsenteeRow` in report-rows.ts. The full
 *  catalogue "absentees" PDF format needs richer relations (breed group,
 *  titles, svProfile…) for its own render and keeps its own query; only
 *  the WHERE clause is shared with it via `paidConfirmedAbsentNonJhWhere`. */
export async function loadAbsenteeLikeEntries(
  db: Database,
  where: ReturnType<typeof and>,
) {
  return db.query.entries.findMany({
    where,
    with: {
      dog: {
        with: {
          breed: true,
          owners: { orderBy: [asc(dogOwners.sortOrder)] },
        },
      },
      exhibitor: true,
      entryClasses: {
        with: { showClass: { with: { classDefinition: true } } },
      },
    },
    orderBy: [asc(entries.catalogueNumber)],
  });
}

// ── Entry Report (paid orders, all statuses) — Financial Statement ──────

export async function loadEntryReportEntries(db: Database, showId: string, paidOrderIds: string[]) {
  if (paidOrderIds.length === 0) return [];
  return db.query.entries.findMany({
    where: and(eq(entries.showId, showId), inArray(entries.orderId, paidOrderIds), isNull(entries.deletedAt)),
    with: {
      dog: {
        with: {
          breed: { with: { group: true } },
          owners: true,
        },
      },
      exhibitor: true,
      entryClasses: {
        with: {
          showClass: { with: { classDefinition: true, breed: true } },
        },
      },
      payments: true,
      // What the exhibitor claimed at checkout to unlock a member rate —
      // the regional membership option + number they gave, or the RKC
      // discount group they picked. The Entry Report shows it so the
      // membership secretary can verify claims (Mandy 2026-08-10).
      order: {
        columns: { regionalMembership: true, regionalMembershipNumber: true },
        with: { discountGroup: { columns: { label: true } } },
      },
    },
    orderBy: [asc(entries.entryDate)],
  });
}

// ── Catalogue orders (printed/online split with email) ───────────────────

export interface CatalogueOrderBuyer {
  name: string;
  email: string;
  quantity: number;
}

export async function loadCatalogueOrdersSplit(
  db: Database,
  showId: string,
): Promise<{ printed: CatalogueOrderBuyer[]; online: CatalogueOrderBuyer[] }> {
  const catalogueItems = await db
    .select({ id: sundryItems.id, name: sundryItems.name })
    .from(sundryItems)
    .where(and(eq(sundryItems.showId, showId), ilike(sundryItems.name, CATALOGUE_NAME_PATTERN)));

  if (catalogueItems.length === 0) return { printed: [], online: [] };
  const catalogueItemIds = catalogueItems.map((i) => i.id);

  const catalogueOrders = await db
    .select({
      itemName: sundryItems.name,
      quantity: orderSundryItems.quantity,
      exhibitorName: users.name,
      exhibitorEmail: users.email,
    })
    .from(orderSundryItems)
    .innerJoin(sundryItems, eq(orderSundryItems.sundryItemId, sundryItems.id))
    .innerJoin(orders, eq(orderSundryItems.orderId, orders.id))
    .innerJoin(users, eq(orders.exhibitorId, users.id))
    .where(and(inArray(orderSundryItems.sundryItemId, catalogueItemIds), eq(orders.status, 'paid')));

  const printed: CatalogueOrderBuyer[] = [];
  const online: CatalogueOrderBuyer[] = [];
  for (const row of catalogueOrders) {
    const entry = { name: row.exhibitorName ?? '—', email: row.exhibitorEmail, quantity: row.quantity };
    if (row.itemName.toLowerCase().includes('print')) printed.push(entry);
    else online.push(entry);
  }
  return { printed, online };
}

// ── Pre-booked Catalogues report (name + type + quantity, no email) ─────

/** The "Pre-booked Catalogues" PDF's own row shape — who ordered/paid for a
 *  catalogue (printed or online). Deliberately separate from
 *  `loadCatalogueOrdersSplit` above (which the Financial Statement and the
 *  "Catalogue Order List (CSV)" use) — same underlying purchases, but this
 *  report doesn't carry email and groups by name only. */
export async function loadPrebookedCatalogueRows(db: Database, showId: string): Promise<PrebookedCatalogueRow[]> {
  const catalogueItems = await db
    .select({ id: sundryItems.id, name: sundryItems.name })
    .from(sundryItems)
    .where(and(eq(sundryItems.showId, showId), ilike(sundryItems.name, CATALOGUE_NAME_PATTERN)));

  const rows: PrebookedCatalogueRow[] = [];
  if (catalogueItems.length === 0) return rows;

  const ids = catalogueItems.map((i) => i.id);
  const cats = await db
    .select({
      itemName: sundryItems.name,
      quantity: orderSundryItems.quantity,
      exhibitorName: users.name,
    })
    .from(orderSundryItems)
    .innerJoin(sundryItems, eq(orderSundryItems.sundryItemId, sundryItems.id))
    .innerJoin(orders, eq(orderSundryItems.orderId, orders.id))
    .innerJoin(users, eq(orders.exhibitorId, users.id))
    .where(and(inArray(orderSundryItems.sundryItemId, ids), eq(orders.status, 'paid')));

  for (const o of cats) {
    rows.push({
      name: o.exhibitorName ?? '—',
      type: o.itemName.toLowerCase().includes('print') ? 'Printed' : 'Online',
      quantity: o.quantity,
    });
  }
  return rows;
}
