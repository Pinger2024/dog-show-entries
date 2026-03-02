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
import { shows } from './shows';

export const sundryItems = pgTable(
  'sundry_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    showId: uuid('show_id')
      .notNull()
      .references(() => shows.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    priceInPence: integer('price_in_pence').notNull(),
    maxPerOrder: integer('max_per_order'), // null = unlimited, 1 = single checkbox
    sortOrder: integer('sort_order').notNull().default(0),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('sundry_items_show_id_idx').on(table.showId),
  ]
);

export const sundryItemsRelations = relations(sundryItems, ({ one }) => ({
  show: one(shows, {
    fields: [sundryItems.showId],
    references: [shows.id],
  }),
}));
