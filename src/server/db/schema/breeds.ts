import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { breedGroups } from './breed-groups';
import { dogs } from './dogs';
import { showClasses } from './show-classes';

export const breeds = pgTable(
  'breeds',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => breedGroups.id),
    kcBreedCode: text('kc_breed_code').unique(),
    variety: text('variety'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('breeds_group_id_idx').on(table.groupId)]
);

export const breedsRelations = relations(breeds, ({ one, many }) => ({
  group: one(breedGroups, {
    fields: [breeds.groupId],
    references: [breedGroups.id],
  }),
  dogs: many(dogs),
  showClasses: many(showClasses),
}));
