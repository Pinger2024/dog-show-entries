import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { judgeAssignments } from './judge-assignments';

export const judges = pgTable('judges', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  kcNumber: text('kc_number').unique(),
  contactEmail: text('contact_email'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const judgesRelations = relations(judges, ({ many }) => ({
  assignments: many(judgeAssignments),
}));
