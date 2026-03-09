import { date, index, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { stewardAssignments } from './steward-assignments';
import { breeds } from './breeds';

/**
 * Per-day breed assignments for stewards.
 * When a steward has breed assignments, they only see classes for those breeds.
 * If no breed assignments exist, they see all classes (backward-compatible).
 */
export const stewardBreedAssignments = pgTable(
  'steward_breed_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    stewardAssignmentId: uuid('steward_assignment_id')
      .notNull()
      .references(() => stewardAssignments.id, { onDelete: 'cascade' }),
    breedId: uuid('breed_id')
      .notNull()
      .references(() => breeds.id),
    showDate: date('show_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('steward_breed_assignments_steward_idx').on(table.stewardAssignmentId),
    unique('steward_breed_assignments_unique').on(
      table.stewardAssignmentId,
      table.breedId,
      table.showDate
    ),
  ]
);

export const stewardBreedAssignmentsRelations = relations(
  stewardBreedAssignments,
  ({ one }) => ({
    stewardAssignment: one(stewardAssignments, {
      fields: [stewardBreedAssignments.stewardAssignmentId],
      references: [stewardAssignments.id],
    }),
    breed: one(breeds, {
      fields: [stewardBreedAssignments.breedId],
      references: [breeds.id],
    }),
  })
);
