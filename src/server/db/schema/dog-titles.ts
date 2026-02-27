import {
  date,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { dogTitleTypeEnum } from './enums';
import { dogs } from './dogs';

export const dogTitles = pgTable(
  'dog_titles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    dogId: uuid('dog_id')
      .notNull()
      .references(() => dogs.id, { onDelete: 'cascade' }),
    title: dogTitleTypeEnum('title').notNull(),
    dateAwarded: date('date_awarded', { mode: 'string' }),
    awardingBody: text('awarding_body'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('dog_titles_dog_id_idx').on(table.dogId),
  ]
);

export const dogTitlesRelations = relations(dogTitles, ({ one }) => ({
  dog: one(dogs, {
    fields: [dogTitles.dogId],
    references: [dogs.id],
  }),
}));
