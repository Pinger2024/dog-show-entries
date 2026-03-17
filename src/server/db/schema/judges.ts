import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { judgeAssignments } from './judge-assignments';
import { judgeContracts } from './judge-contracts';

export const judges = pgTable('judges', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  kcNumber: text('kc_number').unique(),
  contactEmail: text('contact_email'),
  jepLevel: integer('jep_level'), // RKC Judges Education Programme level 1-6
  bio: text('bio'), // Optional biography for catalogue display
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
  contracts: many(judgeContracts),
}));
