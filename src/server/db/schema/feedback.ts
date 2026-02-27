import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { feedbackStatusEnum } from './enums';

export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    resendEmailId: text('resend_email_id').unique().notNull(),
    fromEmail: text('from_email').notNull(),
    fromName: text('from_name'),
    subject: text('subject'),
    textBody: text('text_body'),
    htmlBody: text('html_body'),
    inReplyToSubject: text('in_reply_to_subject'),
    status: feedbackStatusEnum('status').notNull().default('pending'),
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
    index('feedback_status_idx').on(table.status),
    index('feedback_from_email_idx').on(table.fromEmail),
    index('feedback_created_at_idx').on(table.createdAt),
  ]
);
