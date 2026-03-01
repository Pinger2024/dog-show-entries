import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { shows } from './shows';
import { users } from './users';
import { fileUploads } from './file-uploads';

export const checklistPhaseEnum = pgEnum('checklist_phase', [
  'pre_planning',
  'planning',
  'pre_show',
  'final_prep',
  'show_day',
  'post_show',
]);

export const checklistItemStatusEnum = pgEnum('checklist_item_status', [
  'not_started',
  'in_progress',
  'complete',
  'not_applicable',
]);

export const showChecklistItems = pgTable(
  'show_checklist_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    showId: uuid('show_id')
      .notNull()
      .references(() => shows.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    phase: checklistPhaseEnum('phase').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    status: checklistItemStatusEnum('status').notNull().default('not_started'),
    dueDate: date('due_date', { mode: 'string' }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    completedByUserId: uuid('completed_by_user_id').references(() => users.id),
    assignedToName: text('assigned_to_name'),
    notes: text('notes'),
    // For auto-detection: a key that maps to a check function
    autoDetectKey: text('auto_detect_key'),
    autoDetected: boolean('auto_detected').notNull().default(false),
    // Whether this is a championship-only item
    championshipOnly: boolean('championship_only').notNull().default(false),
    // Relative due days from show date (positive = before, negative = after)
    relativeDueDays: integer('relative_due_days'),
    // Document tracking — for items that need evidence (insurance cert, KC licence, etc.)
    fileUploadId: uuid('file_upload_id').references(() => fileUploads.id),
    documentExpiryDate: date('document_expiry_date', { mode: 'string' }),
    // For per-entity items (e.g. one per judge): the entity type and display name
    entityType: text('entity_type'), // 'judge' | 'steward' | null
    entityId: uuid('entity_id'),
    entityName: text('entity_name'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('show_checklist_items_show_id_idx').on(table.showId),
    index('show_checklist_items_phase_idx').on(table.phase),
    index('show_checklist_items_due_date_idx').on(table.dueDate),
  ]
);

export const showChecklistItemsRelations = relations(
  showChecklistItems,
  ({ one }) => ({
    show: one(shows, {
      fields: [showChecklistItems.showId],
      references: [shows.id],
    }),
    completedBy: one(users, {
      fields: [showChecklistItems.completedByUserId],
      references: [users.id],
    }),
    fileUpload: one(fileUploads, {
      fields: [showChecklistItems.fileUploadId],
      references: [fileUploads.id],
    }),
  })
);
