import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { invitationStatusEnum, userRoleEnum } from './enums';
import { users } from './users';
import { organisations } from './organisations';

export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(),
    role: userRoleEnum('role').notNull(),
    organisationId: uuid('organisation_id').references(
      () => organisations.id
    ),
    token: text('token').notNull().unique(),
    status: invitationStatusEnum('status').notNull().default('pending'),
    invitedById: uuid('invited_by_id')
      .notNull()
      .references(() => users.id),
    acceptedById: uuid('accepted_by_id').references(() => users.id),
    message: text('message'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('invitations_email_idx').on(table.email),
    index('invitations_token_idx').on(table.token),
    index('invitations_status_idx').on(table.status),
  ]
);

export const invitationsRelations = relations(invitations, ({ one }) => ({
  invitedBy: one(users, {
    fields: [invitations.invitedById],
    references: [users.id],
    relationName: 'invitationsSent',
  }),
  acceptedBy: one(users, {
    fields: [invitations.acceptedById],
    references: [users.id],
    relationName: 'invitationsAccepted',
  }),
  organisation: one(organisations, {
    fields: [invitations.organisationId],
    references: [organisations.id],
  }),
}));
