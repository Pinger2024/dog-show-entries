import { index, integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { entries } from './entries';
import { showClasses } from './show-classes';
import { results } from './results';

export const entryClasses = pgTable(
  'entry_classes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    showClassId: uuid('show_class_id')
      .notNull()
      .references(() => showClasses.id),
    fee: integer('fee').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('entry_classes_entry_id_idx').on(table.entryId),
    index('entry_classes_show_class_id_idx').on(table.showClassId),
  ]
);

export const entryClassesRelations = relations(entryClasses, ({ one }) => ({
  entry: one(entries, {
    fields: [entryClasses.entryId],
    references: [entries.id],
  }),
  showClass: one(showClasses, {
    fields: [entryClasses.showClassId],
    references: [showClasses.id],
  }),
  result: one(results),
}));
