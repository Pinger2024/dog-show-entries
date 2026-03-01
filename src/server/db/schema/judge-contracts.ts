import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { shows } from './shows';
import { judges } from './judges';

export const contractStageEnum = pgEnum('contract_stage', [
  'offer_sent',
  'offer_accepted',
  'confirmed',
  'declined',
]);

export const judgeContracts = pgTable(
  'judge_contracts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    showId: uuid('show_id')
      .notNull()
      .references(() => shows.id, { onDelete: 'cascade' }),
    judgeId: uuid('judge_id')
      .notNull()
      .references(() => judges.id),
    judgeName: text('judge_name').notNull(),
    judgeEmail: text('judge_email').notNull(),
    stage: contractStageEnum('stage').notNull().default('offer_sent'),
    offerSentAt: timestamp('offer_sent_at', { withTimezone: true }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    declinedAt: timestamp('declined_at', { withTimezone: true }),
    offerToken: uuid('offer_token').defaultRandom().notNull().unique(),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('judge_contracts_show_id_idx').on(table.showId),
    index('judge_contracts_judge_id_idx').on(table.judgeId),
    index('judge_contracts_offer_token_idx').on(table.offerToken),
  ]
);

export const judgeContractsRelations = relations(
  judgeContracts,
  ({ one }) => ({
    show: one(shows, {
      fields: [judgeContracts.showId],
      references: [shows.id],
    }),
    judge: one(judges, {
      fields: [judgeContracts.judgeId],
      references: [judges.id],
    }),
  })
);
