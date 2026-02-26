import {
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { shows } from './shows';
import { judgeAssignments } from './judge-assignments';

export const rings = pgTable(
  'rings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    showId: uuid('show_id')
      .notNull()
      .references(() => shows.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    showDay: integer('show_day'),
    startTime: text('start_time'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  }
);

export const ringsRelations = relations(rings, ({ one, many }) => ({
  show: one(shows, {
    fields: [rings.showId],
    references: [shows.id],
  }),
  judgeAssignments: many(judgeAssignments),
}));
