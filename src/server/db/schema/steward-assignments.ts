import { index, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { shows } from './shows';
import { users } from './users';
import { rings } from './rings';

export const stewardAssignments = pgTable(
  'steward_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    showId: uuid('show_id')
      .notNull()
      .references(() => shows.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
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
    index('steward_assignments_show_id_idx').on(table.showId),
    index('steward_assignments_user_id_idx').on(table.userId),
  ]
);

export const stewardAssignmentsRelations = relations(
  stewardAssignments,
  ({ one }) => ({
    show: one(shows, {
      fields: [stewardAssignments.showId],
      references: [shows.id],
    }),
    user: one(users, {
      fields: [stewardAssignments.userId],
      references: [users.id],
    }),
    ring: one(rings, {
      fields: [stewardAssignments.ringId],
      references: [rings.id],
    }),
  })
);
