import { boolean, index, integer, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
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
    /** Attendance is per CLASS, not per entry (Mandy 2026-08-12): a dog can be
     *  absent from her breed class but shown — and placed — in a Special
     *  Award class at the same show. This is the authoritative flag; the
     *  legacy `entries.absent` becomes a roll-up kept in sync by
     *  steward.markAbsent (true only when EVERY one of the entry's classes
     *  is absent), so whole-show readers (financial counts, refund UIs, the
     *  marked-catalogue-wide RKC SH01 dog count) keep today's meaning. */
    absent: boolean('absent').notNull().default(false),
    /** Set when the dog was catalogued in THIS class but judged in another
     *  (entered in the wrong class — routine at real shows). The catalogue
     *  keeps her here as printed; the marked catalogue prints
     *  "Transferred to <class>" against her name, and her result lives on a
     *  separate entry_classes row in the class she was actually judged in
     *  (Mandy 2026-08-12, Trimika's Japan, South Western). Soft reference to
     *  show_classes.id — no FK constraint, matching entries.order_id. */
    transferredToShowClassId: uuid('transferred_to_show_class_id'),
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
    uniqueIndex('entry_classes_entry_show_class_uniq').on(table.entryId, table.showClassId),
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
