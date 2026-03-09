import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { backlogStatusEnum, backlogPriorityEnum } from './enums';

export const backlog = pgTable(
  'backlog',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    featureNumber: integer('feature_number').notNull().unique(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    questions: text('questions'), // questions asked to Michael & Amanda
    latestResponse: text('latest_response'), // latest response from team
    status: backlogStatusEnum('status').notNull().default('awaiting_feedback'),
    priority: backlogPriorityEnum('priority').notNull().default('medium'),
    notes: text('notes'), // developer notes
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('backlog_status_idx').on(table.status),
    index('backlog_priority_idx').on(table.priority),
    index('backlog_feature_number_idx').on(table.featureNumber),
  ]
);
