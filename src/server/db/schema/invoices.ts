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
 * A line item as rendered on the invoice PDF — captured verbatim at issue
 * time so the PDF route never recomputes anything, it only renders this
 * snapshot.
 */
export type InvoiceLineItem = {
  label: string;
  amountPence: number;
  /** True for the discount row, rendered negative/green on the PDF. */
  isCredit?: boolean;
  /** True for a bold subtotal/total row (Total income, Total card fee due, TOTAL FEE DUE). */
  isTotal?: boolean;
  sub?: string;
};

/**
 * Club invoices — what Remi deducts from a show's Stripe-collected entry
 * fees before BACSing the remainder to the club: card processing fees
 * (net of Remi's per-transaction discount) plus the agreed package fee.
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

    // ── Figures (pence), all snapshots at issue time ──
    incomeCollectedByUsPence: integer('income_collected_by_us_pence').notNull(),
    incomePaidDirectPence: integer('income_paid_direct_pence').notNull(),
    totalIncomePence: integer('total_income_pence').notNull(),
    cardFeeTotalPence: integer('card_fee_total_pence').notNull(),
    /** Count of fee-bearing charge rows the discount was multiplied against. */
    feeBearingChargeCount: integer('fee_bearing_charge_count').notNull(),
    /** Pence per fee-bearing charge — an input, not a global constant (the Stripe deal can change). */
    perTransactionDiscountPence: integer('per_transaction_discount_pence').notNull(),
    discountTotalPence: integer('discount_total_pence').notNull(),
    cardFeeDueTotalPence: integer('card_fee_due_total_pence').notNull(),
    packageFeePence: integer('package_fee_pence').notNull(),
    packageFeeDescription: text('package_fee_description').notNull(),
    totalFeeDuePence: integer('total_fee_due_pence').notNull(),
    /** Payments succeeded/partially_refunded with fee_pence still NULL at issue time — figures may be incomplete. */
    captureGapCount: integer('capture_gap_count').notNull().default(0),

    /** Full ordered snapshot of every row the PDF renders, incl. labels. */
    lineItems: jsonb('line_items').notNull().$type<InvoiceLineItem[]>(),

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
