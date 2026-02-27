import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { entryAuditActionEnum } from './enums';
import { entries } from './entries';
import { users } from './users';

export const entryAuditLog = pgTable(
  'entry_audit_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    action: entryAuditActionEnum('action').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    changes: jsonb('changes'),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('entry_audit_log_entry_id_idx').on(table.entryId),
    index('entry_audit_log_user_id_idx').on(table.userId),
  ]
);

export const entryAuditLogRelations = relations(entryAuditLog, ({ one }) => ({
  entry: one(entries, {
    fields: [entryAuditLog.entryId],
    references: [entries.id],
  }),
  user: one(users, {
    fields: [entryAuditLog.userId],
    references: [users.id],
  }),
}));
