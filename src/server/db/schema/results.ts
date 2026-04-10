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
import { users } from './users';

export const results = pgTable(
  'results',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entryClassId: uuid('entry_class_id')
      .notNull()
      .references(() => entryClasses.id, { onDelete: 'cascade' }),
    placement: integer('placement'),
    /**
     * For entries that aren't placed numerically. Mutually exclusive
     * with `placement` — when this is set, `placement` should be null.
     * Possible values: 'withheld' (judge withheld the placement, no
     * dog was good enough) or 'unplaced' (entry was judged but didn't
     * make the placements). Null means "no decision recorded yet" —
     * different from 'unplaced' which is an explicit "judged, didn't
     * place".
     */
    placementStatus: text('placement_status'),
    specialAward: text('special_award'),
    judgeId: uuid('judge_id').references(() => users.id, { onDelete: 'set null' }),
    critiqueText: text('critique_text'),
    winnerPhotoUrl: text('winner_photo_url'),
    winnerPhotoStorageKey: text('winner_photo_storage_key'),
    recordedBy: uuid('recorded_by').references(() => users.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
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
