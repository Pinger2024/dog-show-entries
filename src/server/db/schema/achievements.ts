import {
  date,
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { achievementTypeEnum } from './enums';
import { dogs } from './dogs';

export const achievements = pgTable(
  'achievements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    dogId: uuid('dog_id')
      .notNull()
      .references(() => dogs.id),
    type: achievementTypeEnum('type').notNull(),
    showId: uuid('show_id'),
    classId: uuid('class_id'),
    date: date('date', { mode: 'string' }).notNull(),
    judgeId: uuid('judge_id'),
    details: jsonb('details'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('achievements_dog_id_idx').on(table.dogId),
    index('achievements_type_idx').on(table.type),
  ]
);

export const achievementsRelations = relations(achievements, ({ one }) => ({
  dog: one(dogs, {
    fields: [achievements.dogId],
    references: [dogs.id],
  }),
}));
