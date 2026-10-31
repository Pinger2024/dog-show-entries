import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { paymentStatusEnum, paymentTypeEnum } from './enums';
import { entries } from './entries';
import { orders } from './orders';

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entryId: uuid('entry_id').references(() => entries.id, { onDelete: 'set null' }), // nullable for order-level payments
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }),
    stripePaymentId: text('stripe_payment_id'),
    amount: integer('amount').notNull(),
    status: paymentStatusEnum('status').notNull().default('pending'),
    type: paymentTypeEnum('type').notNull().default('initial'),
    refundAmount: integer('refund_amount'),
    // Stripe's actual per-charge economics — captured from the Charge's
    // balance_transaction (never present on the PaymentIntent itself). We
    // previously only estimated fees at 1.5%; these columns hold the truth.
    // Nullable: legacy rows predate capture, and capture is deliberately
    // best-effort (see the webhook's never-block comment) so a Stripe API
    // hiccup must never leave these columns blocking anything else.
    feePence: integer('fee_pence'),
    netPence: integer('net_pence'),
    balanceTransactionId: text('balance_transaction_id'),
    cardBrand: text('card_brand'),
    cardCountry: text('card_country'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('payments_entry_id_idx').on(table.entryId),
    index('payments_order_id_idx').on(table.orderId),
    index('payments_stripe_payment_id_idx').on(table.stripePaymentId),
    index('payments_status_idx').on(table.status),
  ]
);

export const paymentsRelations = relations(payments, ({ one }) => ({
  entry: one(entries, {
    fields: [payments.entryId],
    references: [entries.id],
  }),
  order: one(orders, {
    fields: [payments.orderId],
    references: [orders.id],
  }),
}));
