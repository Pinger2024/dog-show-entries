import {
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { orders } from './orders';
import { sundryItems } from './sundry-items';

export const orderSundryItems = pgTable(
  'order_sundry_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    sundryItemId: uuid('sundry_item_id')
      .notNull()
      .references(() => sundryItems.id),
    quantity: integer('quantity').notNull().default(1),
    unitPrice: integer('unit_price').notNull(), // snapshot of price at purchase time (pence)
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('order_sundry_items_order_id_idx').on(table.orderId),
    index('order_sundry_items_sundry_item_id_idx').on(table.sundryItemId),
  ]
);

export const orderSundryItemsRelations = relations(
  orderSundryItems,
  ({ one }) => ({
    order: one(orders, {
      fields: [orderSundryItems.orderId],
      references: [orders.id],
    }),
    sundryItem: one(sundryItems, {
      fields: [orderSundryItems.sundryItemId],
      references: [sundryItems.id],
    }),
  })
);
