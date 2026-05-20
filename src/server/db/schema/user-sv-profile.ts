import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { wusvClubEnum } from './enums';
import { users } from './users';

export const userSvProfile = pgTable('user_sv_profile', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  wusvClub: wusvClubEnum('wusv_club'),
  wusvMembershipNumber: text('wusv_membership_number'),
  wusvClubOther: text('wusv_club_other'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const userSvProfileRelations = relations(userSvProfile, ({ one }) => ({
  user: one(users, {
    fields: [userSvProfile.userId],
    references: [users.id],
  }),
}));
