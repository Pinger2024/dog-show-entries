import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { judgeAssignments } from './judge-assignments';
import { judgeContracts } from './judge-contracts';

export const judges = pgTable('judges', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  kcNumber: text('kc_number').unique(),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  jepLevel: integer('jep_level'), // RKC Judges Education Programme level 1-6
  bio: text('bio'), // Optional biography for catalogue display
  photoUrl: text('photo_url'), // Judge portrait photo URL for catalogue
  kennelClubAffix: text('kennel_club_affix'), // e.g., "Sadira" — displayed on schedule after judge name
  kcJudgeId: text('kc_judge_id'), // RKC internal UUID — cached to avoid repeated Firecrawl scrapes
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
