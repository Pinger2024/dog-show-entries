import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { shows } from './shows';
import { judges } from './judges';
import { users } from './users';

export const critiqueDocStatusEnum = pgEnum('critique_doc_status', [
  'invited',
  'submitted',
  'published',
]);

// One block per parsed critique, unmatched header/orphan chunk, or the
// judge's overview preamble — see src/lib/critique-parse.ts and
// src/lib/critique-match.ts (parse attaches matchedShowClassId; match
// attaches everything from matchedEntryClassId down). Declared locally
// (not imported from the lib layer) so this schema file stays
// self-contained, matching the rest of this directory.
export type CritiqueBlockConfidence = 'exact' | 'check' | 'unmatched';

export type CritiqueParsedBlock = {
  kind: 'critique' | 'overview' | 'unmatched';
  classNameRaw: string | null;
  position: number | null;
  ownersRaw: string | null;
  dogRaw: string | null;
  dogNameCleaned: string | null;
  pedigreeRaw: string | null;
  critiqueText: string;
  matchedShowClassId: string | null;
  matchedEntryClassId: string | null;
  confidence: CritiqueBlockConfidence;
  conflict: { existingText: string } | null;
  resolution: 'document' | 'existing' | null;
  include: boolean;
  hints: string[];
};

export type CritiqueParsedJson = {
  v: 1;
  blocks: CritiqueParsedBlock[];
};

// One row per (show, judge). Judge critiques uploaded via a token-gated
// magic link, parsed + matched against the show's results, reviewed by the
// judge then the secretary, and published to results.critique_text.
export const critiqueDocuments = pgTable(
  'critique_documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    showId: uuid('show_id')
      .notNull()
      .references(() => shows.id, { onDelete: 'cascade' }),
    judgeId: uuid('judge_id')
      .notNull()
      .references(() => judges.id),
    // Re-invite reuses the row: fresh token, status back to 'invited'.
    uploadToken: uuid('upload_token').defaultRandom().notNull().unique(),
    status: critiqueDocStatusEnum('status').notNull().default('invited'),
    invitedEmail: text('invited_email'),
    invitedAt: timestamp('invited_at', { withTimezone: true }),
    // Original .docx kept in R2 for provenance.
    originalFilename: text('original_filename'),
    storageKey: text('storage_key'),
    rawText: text('raw_text'),
    parsedJson: jsonb('parsed_json').$type<CritiqueParsedJson>(),
    // Unmatched preamble text approved for display on the results page.
    overviewText: text('overview_text'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedBy: uuid('published_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('critique_documents_show_judge_uniq').on(table.showId, table.judgeId),
    index('critique_documents_upload_token_idx').on(table.uploadToken),
  ]
);

export const critiqueDocumentsRelations = relations(critiqueDocuments, ({ one }) => ({
  show: one(shows, {
    fields: [critiqueDocuments.showId],
    references: [shows.id],
  }),
  judge: one(judges, {
    fields: [critiqueDocuments.judgeId],
    references: [judges.id],
  }),
  publisher: one(users, {
    fields: [critiqueDocuments.publishedBy],
    references: [users.id],
  }),
}));
