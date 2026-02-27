import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { clubTypeEnum, serviceTierEnum } from './enums';
import { organisations } from './organisations';

export const plans = pgTable('plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  clubType: clubTypeEnum('club_type').notNull(),
  serviceTier: serviceTierEnum('service_tier').notNull(),
  annualFeePence: integer('annual_fee_pence').notNull(),
  perShowFeePence: integer('per_show_fee_pence').notNull(),
  perEntryFeePence: integer('per_entry_fee_pence').notNull(),
  description: text('description'),
  features: jsonb('features').$type<string[]>().default([]),
  stripePriceId: text('stripe_price_id'),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const plansRelations = relations(plans, ({ many }) => ({
  organisations: many(organisations),
}));
