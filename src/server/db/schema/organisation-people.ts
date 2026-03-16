import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { organisations } from './organisations';

export const organisationPeople = pgTable(
  'organisation_people',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: text('position'),
    email: text('email'),
    phone: text('phone'),
    address: text('address'),
    isGuarantor: boolean('is_guarantor').notNull().default(false),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('org_people_org_id_idx').on(table.organisationId),
  ]
);

export const organisationPeopleRelations = relations(
  organisationPeople,
  ({ one }) => ({
    organisation: one(organisations, {
      fields: [organisationPeople.organisationId],
      references: [organisations.id],
    }),
  })
);
