import {
  pgTable,
  uuid,
  integer,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { organisations } from './organisations';
import { shows } from './shows';
import { users } from './users';

/**
 * Payouts from Remi's balance to a club for a specific show.
 *
 * We record each transfer as a row here with its bank reference and
 * the date it was sent, so the admin payout view can show both the
 * currently-owed balance (derived from orders minus past payouts) and
 * the full payout history. Kept deliberately simple — one row per
 * "batch" sent for one show.
 */
export const payouts = pgTable(
  'payouts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id),
    // Usually the show whose entry fees this payout covers; nullable
    // because we might one day do ad-hoc payouts not tied to a show.
    showId: uuid('show_id').references(() => shows.id),
    amountPence: integer('amount_pence').notNull(),
    // Free-form bank reference the admin copied from their BACS push —
    // helps the club reconcile and reassures Michael the payout happened.
    bankReference: text('bank_reference'),
    notes: text('notes'),
    paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
    // Whoever in admin clicked "Mark as paid" — audit trail.
    paidByUserId: uuid('paid_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('payouts_organisation_id_idx').on(table.organisationId),
    index('payouts_show_id_idx').on(table.showId),
  ]
);

export const payoutsRelations = relations(payouts, ({ one }) => ({
  organisation: one(organisations, {
    fields: [payouts.organisationId],
    references: [organisations.id],
  }),
  show: one(shows, {
    fields: [payouts.showId],
    references: [shows.id],
  }),
  paidBy: one(users, {
    fields: [payouts.paidByUserId],
    references: [users.id],
  }),
}));
