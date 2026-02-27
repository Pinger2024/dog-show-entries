import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { userRoleEnum } from './enums';
import { dogs } from './dogs';
import { entries } from './entries';
import { memberships } from './memberships';
import { dogOwners } from './dog-owners';
import { orders } from './orders';
import { stewardAssignments } from './steward-assignments';

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull().unique(),
    emailVerified: timestamp('email_verified', { mode: 'date' }),
    name: text('name').notNull(),
    image: text('image'),
    address: text('address'),
    phone: text('phone'),
    postcode: text('postcode'),
    kcAccountNo: text('kc_account_no'),
    role: userRoleEnum('role').notNull().default('exhibitor'),
    stripeCustomerId: text('stripe_customer_id'),
    preferences: jsonb('preferences'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
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
}));
