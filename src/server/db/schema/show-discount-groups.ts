import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { shows } from './shows';

// Per-show named discount tiers (e.g. "Members", "Pensioners").
// Exhibitor declares one at checkout. Replaces the per-class first-entry
// fee for that exhibitor's entries, and optionally provides a different
// multi-dog package price.
export const showDiscountGroups = pgTable(
  'show_discount_groups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    showId: uuid('show_id')
      .notNull()
      .references(() => shows.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    firstEntryFeePence: integer('first_entry_fee_pence').notNull(),
    multiDogPackagePence: integer('multi_dog_package_pence'),
    displayOrder: integer('display_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('show_discount_groups_show_id_idx').on(table.showId),
  ]
);

export const showDiscountGroupsRelations = relations(
  showDiscountGroups,
  ({ one }) => ({
    show: one(shows, {
      fields: [showDiscountGroups.showId],
      references: [shows.id],
    }),
  })
);
