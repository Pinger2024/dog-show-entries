import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { classTypeEnum } from './enums';
import { showClasses } from './show-classes';

export const classDefinitions = pgTable(
  'class_definitions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    type: classTypeEnum('type').notNull(),
    eligibilityRules: jsonb('eligibility_rules'),
    minAgeMonths: integer('min_age_months'),
    maxAgeMonths: integer('max_age_months'),
    maxWins: integer('max_wins'),
    sortOrder: integer('sort_order').notNull().default(0),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('class_definitions_name_idx').on(table.name),
  ]
);

export const classDefinitionsRelations = relations(
  classDefinitions,
  ({ many }) => ({
    showClasses: many(showClasses),
  })
);
