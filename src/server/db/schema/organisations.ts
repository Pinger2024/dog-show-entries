import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { subscriptionStatusEnum } from './enums';
import { shows } from './shows';
import { memberships } from './memberships';
import { plans } from './plans';

export const organisations = pgTable('organisations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  kcRegNumber: text('kc_reg_number').unique(),
  type: text('type'),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  website: text('website'),
  stripeAccountId: text('stripe_account_id'),
  stripeCustomerId: text('stripe_customer_id'),
  planId: uuid('plan_id').references(() => plans.id),
  subscriptionStatus: subscriptionStatusEnum('subscription_status')
    .notNull()
    .default('none'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  subscriptionCurrentPeriodEnd: timestamp('subscription_current_period_end', {
    withTimezone: true,
  }),
  logoUrl: text('logo_url'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const organisationsRelations = relations(
  organisations,
  ({ one, many }) => ({
    shows: many(shows),
    memberships: many(memberships),
    plan: one(plans, {
      fields: [organisations.planId],
      references: [plans.id],
    }),
  })
);
