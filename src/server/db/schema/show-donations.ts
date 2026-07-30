import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { shows } from './shows';

// Plain donations toward a show — people who gave a donation rather than
// sponsoring a class (Mandy, BAGSD 2026-06-17). Acknowledgment-only: a donor
// name and an optional kennel affix, deliberately NO amount. Rendered as a
// "with thanks to the following for their kind donations" list in the
// catalogue, separate from the class/show sponsors who get prizes/trophies.
export const showDonations = pgTable(
  'show_donations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    showId: uuid('show_id')
      .notNull()
      .references(() => shows.id, { onDelete: 'cascade' }),
    /** Donor's name as it should read in the catalogue thanks list. */
    donorName: text('donor_name').notNull(),
    /** Optional kennel affix (e.g. "Hundark"). */
    affix: text('affix'),
    /** Manual ordering within the donations list. */
    displayOrder: integer('display_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('show_donations_show_id_idx').on(table.showId),
  ]
);

export const showDonationsRelations = relations(showDonations, ({ one }) => ({
  show: one(shows, {
    fields: [showDonations.showId],
    references: [shows.id],
  }),
}));
