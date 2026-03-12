import {
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { shows } from './shows';
import { organisations } from './organisations';

export const venues = pgTable('venues', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  address: text('address'),
  postcode: text('postcode'),
  lat: numeric('lat', { precision: 10, scale: 7 }),
  lng: numeric('lng', { precision: 10, scale: 7 }),
  indoorOutdoor: text('indoor_outdoor'),
  capacity: integer('capacity'),
  organisationId: uuid('organisation_id').references(() => organisations.id),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const venuesRelations = relations(venues, ({ one, many }) => ({
  shows: many(shows),
  organisation: one(organisations, {
    fields: [venues.organisationId],
    references: [organisations.id],
  }),
}));
