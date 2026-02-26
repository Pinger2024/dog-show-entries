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
import { entryStatusEnum } from './enums';
import { shows } from './shows';
import { dogs } from './dogs';
import { users } from './users';
import { entryClasses } from './entry-classes';
import { payments } from './payments';

export const entries = pgTable(
  'entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    showId: uuid('show_id')
      .notNull()
      .references(() => shows.id),
    dogId: uuid('dog_id')
      .notNull()
      .references(() => dogs.id),
    exhibitorId: uuid('exhibitor_id')
      .notNull()
      .references(() => users.id),
    handlerId: uuid('handler_id').references(() => users.id),
    isNfc: boolean('is_nfc').notNull().default(false),
    status: entryStatusEnum('status').notNull().default('pending'),
    paymentIntentId: text('payment_intent_id'),
    entryDate: timestamp('entry_date', { withTimezone: true })
      .defaultNow()
      .notNull(),
    catalogueNumber: text('catalogue_number'),
    totalFee: integer('total_fee').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('entries_show_id_idx').on(table.showId),
    index('entries_dog_id_idx').on(table.dogId),
    index('entries_exhibitor_id_idx').on(table.exhibitorId),
    index('entries_status_idx').on(table.status),
  ]
);

export const entriesRelations = relations(entries, ({ one, many }) => ({
  show: one(shows, {
    fields: [entries.showId],
    references: [shows.id],
  }),
  dog: one(dogs, {
    fields: [entries.dogId],
    references: [dogs.id],
  }),
  exhibitor: one(users, {
    fields: [entries.exhibitorId],
    references: [users.id],
    relationName: 'exhibitorEntries',
  }),
  handler: one(users, {
    fields: [entries.handlerId],
    references: [users.id],
    relationName: 'handlerEntries',
  }),
  entryClasses: many(entryClasses),
  payments: many(payments),
}));
