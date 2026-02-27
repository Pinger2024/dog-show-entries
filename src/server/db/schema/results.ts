import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { entryClasses } from './entry-classes';

export const results = pgTable(
  'results',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entryClassId: uuid('entry_class_id')
      .notNull()
      .references(() => entryClasses.id),
    placement: integer('placement'),
    specialAward: text('special_award'),
    judgeId: uuid('judge_id'),
    critiqueText: text('critique_text'),
    recordedBy: uuid('recorded_by'),
    recordedAt: timestamp('recorded_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('results_entry_class_id_idx').on(table.entryClassId),
    index('results_judge_id_idx').on(table.judgeId),
    uniqueIndex('results_entry_class_id_uniq').on(table.entryClassId),
  ]
);

export const resultsRelations = relations(results, ({ one }) => ({
  entryClass: one(entryClasses, {
    fields: [results.entryClassId],
    references: [entryClasses.id],
  }),
}));
