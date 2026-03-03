import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { secretaryApplicationStatusEnum, clubTypeEnum } from './enums';
import { users } from './users';
import { invitations } from './invitations';

export const secretaryApplications = pgTable(
  'secretary_applications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    organisationName: text('organisation_name').notNull(),
    clubType: clubTypeEnum('club_type').notNull(),
    breedOrGroup: text('breed_or_group'),
    kcRegNumber: text('kc_reg_number'),
    contactEmail: text('contact_email').notNull(),
    contactPhone: text('contact_phone'),
    website: text('website'),
    details: text('details'),
    status: secretaryApplicationStatusEnum('status')
      .notNull()
      .default('pending'),
    reviewedById: uuid('reviewed_by_id').references(() => users.id),
    reviewNotes: text('review_notes'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    invitationId: uuid('invitation_id').references(() => invitations.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('secretary_applications_user_id_idx').on(table.userId),
    index('secretary_applications_status_idx').on(table.status),
    index('secretary_applications_created_at_idx').on(table.createdAt),
  ]
);

export const secretaryApplicationsRelations = relations(
  secretaryApplications,
  ({ one }) => ({
    user: one(users, {
      fields: [secretaryApplications.userId],
      references: [users.id],
      relationName: 'secretaryApplications',
    }),
    reviewedBy: one(users, {
      fields: [secretaryApplications.reviewedById],
      references: [users.id],
      relationName: 'applicationsReviewed',
    }),
    invitation: one(invitations, {
      fields: [secretaryApplications.invitationId],
      references: [invitations.id],
    }),
  })
);
