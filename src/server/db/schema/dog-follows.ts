import { index, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { dogs } from './dogs';
import { users } from './users';

export const dogFollows = pgTable(
  'dog_follows',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    dogId: uuid('dog_id')
      .notNull()
      .references(() => dogs.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('dog_follows_user_dog_unique').on(table.userId, table.dogId),
    index('dog_follows_user_id_idx').on(table.userId),
    index('dog_follows_dog_id_idx').on(table.dogId),
  ]
);

export const dogFollowsRelations = relations(dogFollows, ({ one }) => ({
  user: one(users, {
    fields: [dogFollows.userId],
    references: [users.id],
  }),
  dog: one(dogs, {
    fields: [dogFollows.dogId],
    references: [dogs.id],
  }),
}));
