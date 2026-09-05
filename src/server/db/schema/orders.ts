import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { orderStatusEnum } from './enums';
import { shows } from './shows';
import { users } from './users';
import { entries } from './entries';
import { payments } from './payments';
import { orderSundryItems } from './order-sundry-items';
import { showDiscountGroups } from './show-discount-groups';

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    showId: uuid('show_id')
      .notNull()
      .references(() => shows.id),
    exhibitorId: uuid('exhibitor_id')
      .notNull()
      .references(() => users.id),
    status: orderStatusEnum('status').notNull().default('draft'),
    // Discount group the exhibitor declared at checkout (e.g. "Members").
    // Null when the exhibitor is paying the standard rate. The order's
    // totalAmount is already locked at checkout — this just records the
    // declaration for the secretary's entry list and for any later refund
    // recalculation.
    discountGroupId: uuid('discount_group_id').references(
      () => showDiscountGroups.id,
      { onDelete: 'set null' },
    ),
    // Amount the CLUB receives — entry + sundry subtotal, in pence. The
    // exhibitor is charged totalAmount + platformFeePence at Stripe; the
    // fee is routed to Remi via application_fee_amount and the rest goes
    // to the club's connected Standard account.
    totalAmount: integer('total_amount').notNull().default(0),
    // Remi's handling fee for this order: £1 flat + 1% of totalAmount.
    // Persisted for receipts + reconciliation — NOT derived on the fly
    // because the formula could change and historical orders need their
    // original fee preserved.
    platformFeePence: integer('platform_fee_pence').notNull().default(0),
    // Discretionary donation collected at checkout (pence), part of totalAmount.
    // Regional shows can offer this; the club receives it (Mandy 2026-07-05).
    donationPence: integer('donation_pence').notNull().default(0),
    // Kennel affix the donor wants thanked in the catalogue (optional). Captured
    // now; the catalogue "thanks" rendering is a later pass.
    donationAffix: text('donation_affix'),
    // Regional (SV/WUSV) checkout declarations — self-declared, taken on trust.
    // regionalMembership = the membership label the exhibitor ticked (unlocks the
    // member rate), regionalMembershipNumber = the number they gave (not
    // validated). regionalFirstTimeExhibitor = they claimed the first-time rate.
    regionalMembership: text('regional_membership'),
    regionalMembershipNumber: text('regional_membership_number'),
    regionalFirstTimeExhibitor: boolean('regional_first_time_exhibitor')
      .notNull()
      .default(false),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    // Attribution: which channel drove this entry? Populated from the ?src=
    // query param on the share URL (whatsapp/facebook/instagram/…). Null when
    // the exhibitor came in directly. Kept free-form on purpose so new share
    // channels don't need a schema change.
    referralSource: text('referral_source'),
    // Show-morning "your catalogue is ready" notification (Amanda 2026-05-28).
    // Stamped by the cron the first time it sends the email for this order
    // so subsequent cron ticks don't double-send.
    catalogueReadyEmailedAt: timestamp('catalogue_ready_emailed_at', {
      withTimezone: true,
    }),
    // Pre-paid parking pass "here's your pass" notification (Mandy
    // 2026-08-04). Stamped by the cron the first time it sends the
    // parking-pass email for this order so subsequent cron ticks don't
    // double-send — same shape as catalogueReadyEmailedAt above.
    parkingPassEmailedAt: timestamp('parking_pass_emailed_at', {
      withTimezone: true,
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('orders_show_id_idx').on(table.showId),
    index('orders_exhibitor_id_idx').on(table.exhibitorId),
    index('orders_status_idx').on(table.status),
    index('orders_referral_source_idx').on(table.referralSource),
  ]
);

export const ordersRelations = relations(orders, ({ one, many }) => ({
  show: one(shows, {
    fields: [orders.showId],
    references: [shows.id],
  }),
  exhibitor: one(users, {
    fields: [orders.exhibitorId],
    references: [users.id],
  }),
  discountGroup: one(showDiscountGroups, {
    fields: [orders.discountGroupId],
    references: [showDiscountGroups.id],
  }),
  entries: many(entries, { relationName: 'orderEntries' }),
  payments: many(payments),
  orderSundryItems: many(orderSundryItems),
}));
