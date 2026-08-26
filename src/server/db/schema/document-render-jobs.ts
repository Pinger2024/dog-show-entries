import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { shows } from './shows';
import { users } from './users';

/**
 * Background PDF render jobs — catalogue generation moved off the web
 * request process (2026-08-26) after a heavy render OOM-killed the single
 * prod web instance mid-entries. A job captures a closed-show snapshot at
 * enqueue time; a separate worker process renders it and uploads the
 * result, so a render that blows memory takes down the worker, never the
 * app serving exhibitors.
 *
 * `documentType`/`format`/`status` are plain `text`, not pgEnum — only one
 * document type exists today and the set of formats/statuses is expected to
 * grow before it stabilises; a text column with app-level validation avoids
 * an `ALTER TYPE ... ADD VALUE` migration for every new one.
 */
export const documentRenderJobs = pgTable(
  'document_render_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    showId: uuid('show_id')
      .notNull()
      .references(() => shows.id, { onDelete: 'cascade' }),
    documentType: text('document_type').notNull(), // 'catalogue' only today
    format: text('format').notNull(), // 'standard' | 'by-class' | 'judging' | 'absentees' | 'marked'
    status: text('status').notNull().default('queued'), // 'queued' | 'running' | 'done' | 'failed'
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    error: text('error'),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    // Closed-show snapshot — the data the render is built from, captured at
    // enqueue time so the artefact can't drift from what was on screen when
    // it was requested. See src/server/services/catalogue-snapshot.ts.
    snapshot: jsonb('snapshot').notNull(),
    snapshotHash: text('snapshot_hash').notNull(),

    // Result
    fileSha256: text('file_sha256'),
    storageKey: text('storage_key'),
    pageCount: integer('page_count'),
    fileBytes: integer('file_bytes'),
    preflight: jsonb('preflight'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    index('document_render_jobs_status_created_idx').on(table.status, table.createdAt),
    index('document_render_jobs_show_format_hash_idx').on(
      table.showId,
      table.format,
      table.snapshotHash,
    ),
  ],
);

export const documentRenderJobsRelations = relations(documentRenderJobs, ({ one }) => ({
  show: one(shows, {
    fields: [documentRenderJobs.showId],
    references: [shows.id],
  }),
  requestedBy: one(users, {
    fields: [documentRenderJobs.requestedByUserId],
    references: [users.id],
  }),
}));

export type DocumentRenderJobStatus = 'queued' | 'running' | 'done' | 'failed';
export type DocumentRenderJobFormat = 'standard' | 'by-class' | 'judging' | 'absentees' | 'marked';
