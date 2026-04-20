import { pgTable, text, timestamp, uuid, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { subscriptionStatusEnum, stripeAccountStatusEnum } from './enums';
import { shows } from './shows';
import { memberships } from './memberships';
import { plans } from './plans';
import { sponsors } from './sponsors';
import { venues } from './venues';
import { breeds } from './breeds';

export const organisations = pgTable('organisations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  kcRegNumber: text('kc_reg_number').unique(),
  type: text('type'),
  /** For single-breed clubs: the one breed this club runs shows for. Populates show defaults. */
  breedId: uuid('breed_id').references(() => breeds.id),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  website: text('website'),
  // Where we BACS exhibitor entry fees on to. Remi is merchant of record;
  // these are the only bank details a club needs to give us.
  payoutAccountName: text('payout_account_name'),
  payoutSortCode: text('payout_sort_code'),
  payoutAccountNumber: text('payout_account_number'),

  // Legacy Stripe Connect columns — unused, kept to avoid a disruptive
  // drop. Safe to remove once prod migrations can tolerate it.
  stripeAccountId: text('stripe_account_id'),
  stripeAccountStatus: stripeAccountStatusEnum('stripe_account_status')
    .notNull()
    .default('not_started'),
  stripeDetailsSubmitted: boolean('stripe_details_submitted')
    .notNull()
    .default(false),
  stripeChargesEnabled: boolean('stripe_charges_enabled')
    .notNull()
    .default(false),
  stripePayoutsEnabled: boolean('stripe_payouts_enabled')
    .notNull()
    .default(false),
  stripeOnboardingCompletedAt: timestamp('stripe_onboarding_completed_at', {
    withTimezone: true,
  }),

  // ── Stripe Billing (club subscribing to Remi) ──
  // This is the club-as-customer side — completely separate from Connect.
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
    breed: one(breeds, {
      fields: [organisations.breedId],
      references: [breeds.id],
    }),
    sponsors: many(sponsors),
    venues: many(venues),
  })
);
