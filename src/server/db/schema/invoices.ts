import {
  pgTable,
  uuid,
  integer,
  text,
  timestamp,
  index,
  uniqueIndex,
  jsonb,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { organisations } from './organisations';
import { shows } from './shows';
import { users } from './users';

/**
 * A single row within a settlement section (Money collected by Remi / Paid
 * direct to the club / Entries taken free of charge / Less Remi costs).
 * Captured verbatim at issue time so the PDF route never recomputes
 * anything, it only renders this snapshot. See
 * src/server/services/settlement-itemisation.ts for how these are built.
 */
export type SettlementLine = {
  label: string;
  amountPence: number;
  /** True for a discount/refund row, rendered negative/green on the PDF. */
  isCredit?: boolean;
  sub?: string;
};

export type SettlementSection = {
  title: string;
  lines: SettlementLine[];
  totalLabel: string;
  totalPence: number;
};

/**
 * The full settlement statement snapshot — everything the PDF renders,
 * frozen at issue time. See src/server/services/settlement-itemisation.ts.
 */
export type SettlementSnapshot = {
  viaRemi: SettlementSection;
  direct: SettlementSection;
  free: SettlementSection;
  /** e.g. "87 via Remi + 7 direct = 94 (including 4 junior handlers and 4 not-for-competition)" */
  totalEntriesLine: string;
  costs: SettlementSection;
};

/** Back-compat alias — older imports referenced this name for a single row. */
export type InvoiceLineItem = SettlementLine;

/**
 * Club settlement statements — what Remi deducts from a show's Stripe-
 * collected entry fees before BACSing the remainder to the club: card
 * processing fees (net of Remi's discount) plus the agreed package fee.
 * This ALSO serves as the club's invoice — the two used to be separate
 * documents, they are now one (Michael 2026-07-29, replacing the old
 * simple "income / card fee / package fee" invoice layout).
 *
 * ⚠️⚠️⚠️ EVERY FIGURE + LINE ITEM BELOW IS AN IMMUTABLE SNAPSHOT. ⚠️⚠️⚠️
 * Computed once inside `admin-invoices.issue`, frozen forever. The
 * underlying orders/payments/fee data WILL change later (refunds,
 * corrections, re-categorisation) — an issued invoice must never move.
 * NEVER add an `update` procedure or mutate a row here after issue.
 * A correction is a NEW invoice via `admin-invoices.supersede`, which
 * issues the replacement and sets `supersededById` on the old row in one
 * transaction. See src/server/trpc/routers/admin-invoices.ts.
 */
export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id),
    showId: uuid('show_id')
      .notNull()
      .references(() => shows.id),
    // "INV-<CLUBSLUG>-NNNN" — globally unique, human-readable BACS reference.
    invoiceNumber: text('invoice_number').notNull().unique(),
    // Snapshot of organisations.name at issue time (uppercased, alnum,
    // hyphen-collapsed) — the number stays stable even if the club renames.
    clubSlug: text('club_slug').notNull(),
    // Per-organisation running number — see organisations.nextInvoiceSequence.
    sequenceNumber: integer('sequence_number').notNull(),

    // ── Headline settlement figures (pence), snapshots at issue time —
    // duplicated out of `lineItems` as scalar columns purely so the
    // ledger/list view and tests can read them without parsing jsonb. The
    // PDF renders `lineItems` ONLY; these never drive rendering. ──
    viaRemiTotalPence: integer('via_remi_total_pence').notNull(),
    directTotalPence: integer('direct_total_pence').notNull(),
    freeEntriesCount: integer('free_entries_count').notNull().default(0),
    cardFeeTotalPence: integer('card_fee_total_pence').notNull(),
    /** Count of fee-bearing charge rows the discount was computed against. */
    feeBearingChargeCount: integer('fee_bearing_charge_count').notNull(),
    /** Discount config snapshot — an input, not a global constant (the Stripe deal can change). */
    discountMode: text('discount_mode').notNull(),
    discountValue: integer('discount_value').notNull(),
    discountLabel: text('discount_label').notNull(),
    discountTotalPence: integer('discount_total_pence').notNull(),
    packageFeePence: integer('package_fee_pence').notNull(),
    packageFeeDescription: text('package_fee_description').notNull(),
    costsTotalPence: integer('costs_total_pence').notNull(),
    netToClubPence: integer('net_to_club_pence').notNull(),
    /** Payments succeeded/partially_refunded with fee_pence still NULL at issue time — figures may be incomplete. */
    captureGapCount: integer('capture_gap_count').notNull().default(0),

    /** Full ordered snapshot of every section the PDF renders, incl. labels. */
    lineItems: jsonb('line_items').notNull().$type<SettlementSnapshot>(),

    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    issuedByUserId: uuid('issued_by_user_id')
      .notNull()
      .references(() => users.id),
    // Set on the OLD invoice once a correction has been issued for it via
    // `supersede`. Self-referencing FK — declared with AnyPgColumn so
    // drizzle-kit doesn't choke on the table referencing itself.
    supersededById: uuid('superseded_by_id').references((): AnyPgColumn => invoices.id),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('invoices_organisation_id_idx').on(table.organisationId),
    index('invoices_show_id_idx').on(table.showId),
    // Enforces the counter-based numbering scheme: one sequence number per
    // club, never reused.
    uniqueIndex('invoices_org_sequence_idx').on(table.organisationId, table.sequenceNumber),
  ]
);

export const invoicesRelations = relations(invoices, ({ one }) => ({
  organisation: one(organisations, {
    fields: [invoices.organisationId],
    references: [organisations.id],
  }),
  show: one(shows, {
    fields: [invoices.showId],
    references: [shows.id],
  }),
  issuedBy: one(users, {
    fields: [invoices.issuedByUserId],
    references: [users.id],
  }),
  supersededBy: one(invoices, {
    fields: [invoices.supersededById],
    references: [invoices.id],
    relationName: 'invoiceSupersession',
  }),
}));
