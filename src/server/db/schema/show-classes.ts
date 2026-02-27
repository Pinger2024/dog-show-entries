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
import { sexEnum } from './enums';
import { shows } from './shows';
import { breeds } from './breeds';
import { classDefinitions } from './class-definitions';
import { entryClasses } from './entry-classes';

export const showClasses = pgTable(
  'show_classes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    showId: uuid('show_id')
      .notNull()
      .references(() => shows.id, { onDelete: 'cascade' }),
    breedId: uuid('breed_id').references(() => breeds.id),
    classDefinitionId: uuid('class_definition_id')
      .notNull()
      .references(() => classDefinitions.id),
    sex: sexEnum('sex'),
    entryFee: integer('entry_fee').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    classGroup: text('class_group'),
    classNumber: integer('class_number'),
    isBreedSpecific: boolean('is_breed_specific').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('show_classes_show_id_idx').on(table.showId),
    index('show_classes_breed_id_idx').on(table.breedId),
    index('show_classes_class_definition_id_idx').on(table.classDefinitionId),
  ]
);

export const showClassesRelations = relations(showClasses, ({ one, many }) => ({
  show: one(shows, {
    fields: [showClasses.showId],
    references: [shows.id],
  }),
  breed: one(breeds, {
    fields: [showClasses.breedId],
    references: [breeds.id],
  }),
  classDefinition: one(classDefinitions, {
    fields: [showClasses.classDefinitionId],
    references: [classDefinitions.id],
  }),
  entryClasses: many(entryClasses),
}));
