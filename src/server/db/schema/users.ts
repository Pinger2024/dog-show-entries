import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { userRoleEnum, subscriptionStatusEnum } from './enums';
import { dogs } from './dogs';
import { entries } from './entries';
import { memberships } from './memberships';
import { dogOwners } from './dog-owners';
import { orders } from './orders';
import { stewardAssignments } from './steward-assignments';
import { invitations } from './invitations';

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull().unique(),
    emailVerified: timestamp('email_verified', { mode: 'date' }),
    name: text('name').default(''),
    image: text('image'),
    address: text('address'),
    phone: text('phone'),
    postcode: text('postcode'),
    kcAccountNo: text('kc_account_no'),
    role: userRoleEnum('role').notNull().default('exhibitor'),
    onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
    stripeCustomerId: text('stripe_customer_id'),
    proSubscriptionStatus: subscriptionStatusEnum('pro_subscription_status').notNull().default('none'),
    proStripeSubscriptionId: text('pro_stripe_subscription_id'),
    proCurrentPeriodEnd: timestamp('pro_current_period_end', { withTimezone: true }),
    preferences: jsonb('preferences'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    passwordHash: text('password_hash'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('users_email_idx').on(table.email),
    index('users_kc_account_no_idx').on(table.kcAccountNo),
  ]
);

export const usersRelations = relations(users, ({ many }) => ({
  dogs: many(dogs),
  entries: many(entries),
  memberships: many(memberships),
  dogOwnerships: many(dogOwners),
  orders: many(orders),
  stewardAssignments: many(stewardAssignments),
  invitationsSent: many(invitations, { relationName: 'invitationsSent' }),
  invitationsAccepted: many(invitations, { relationName: 'invitationsAccepted' }),
}));
