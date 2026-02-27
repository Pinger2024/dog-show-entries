import {
  date,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { entries } from './entries';

export const juniorHandlerDetails = pgTable(
  'junior_handler_details',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entryId: uuid('entry_id')
      .notNull()
      .unique()
      .references(() => entries.id, { onDelete: 'cascade' }),
    handlerName: text('handler_name').notNull(),
    dateOfBirth: date('date_of_birth', { mode: 'string' }).notNull(),
    kcNumber: text('kc_number'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('junior_handler_details_entry_id_idx').on(table.entryId),
  ]
);

export const juniorHandlerDetailsRelations = relations(
  juniorHandlerDetails,
  ({ one }) => ({
    entry: one(entries, {
      fields: [juniorHandlerDetails.entryId],
      references: [entries.id],
    }),
  })
);
