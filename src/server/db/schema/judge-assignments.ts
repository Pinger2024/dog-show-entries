import { index, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { shows } from './shows';
import { judges } from './judges';
import { breeds } from './breeds';
import { rings } from './rings';

export const judgeAssignments = pgTable(
  'judge_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    showId: uuid('show_id')
      .notNull()
      .references(() => shows.id, { onDelete: 'cascade' }),
    judgeId: uuid('judge_id')
      .notNull()
      .references(() => judges.id),
    breedId: uuid('breed_id').references(() => breeds.id),
    ringId: uuid('ring_id').references(() => rings.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('judge_assignments_show_id_idx').on(table.showId),
    index('judge_assignments_judge_id_idx').on(table.judgeId),
  ]
);

export const judgeAssignmentsRelations = relations(
  judgeAssignments,
  ({ one }) => ({
    show: one(shows, {
      fields: [judgeAssignments.showId],
      references: [shows.id],
    }),
    judge: one(judges, {
      fields: [judgeAssignments.judgeId],
      references: [judges.id],
    }),
    breed: one(breeds, {
      fields: [judgeAssignments.breedId],
      references: [breeds.id],
    }),
    ring: one(rings, {
      fields: [judgeAssignments.ringId],
      references: [rings.id],
    }),
  })
);
