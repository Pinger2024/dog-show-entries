import {
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
    totalAmount: integer('total_amount').notNull().default(0),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
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
  entries: many(entries),
  payments: many(payments),
}));
