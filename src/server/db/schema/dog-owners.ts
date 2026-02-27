import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { dogs } from './dogs';
import { users } from './users';

export const dogOwners = pgTable(
  'dog_owners',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    dogId: uuid('dog_id')
      .notNull()
      .references(() => dogs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id),
    ownerName: text('owner_name').notNull(),
    ownerAddress: text('owner_address').notNull(),
    ownerEmail: text('owner_email').notNull(),
    ownerPhone: text('owner_phone'),
    sortOrder: integer('sort_order').notNull().default(0),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('dog_owners_dog_id_idx').on(table.dogId),
    index('dog_owners_user_id_idx').on(table.userId),
  ]
);

export const dogOwnersRelations = relations(dogOwners, ({ one }) => ({
  dog: one(dogs, {
    fields: [dogOwners.dogId],
    references: [dogs.id],
  }),
  user: one(users, {
    fields: [dogOwners.userId],
    references: [users.id],
  }),
}));
