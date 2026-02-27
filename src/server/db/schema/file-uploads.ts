import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

export const fileUploads = pgTable(
  'file_uploads',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    storageKey: text('storage_key').notNull(),
    publicUrl: text('public_url'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('file_uploads_uploaded_by_idx').on(table.uploadedBy),
    index('file_uploads_storage_key_idx').on(table.storageKey),
  ]
);

export const fileUploadsRelations = relations(fileUploads, ({ one }) => ({
  uploader: one(users, {
    fields: [fileUploads.uploadedBy],
    references: [users.id],
  }),
}));
