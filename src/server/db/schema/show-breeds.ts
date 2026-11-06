import {
  boolean,
  index,
  integer,
  pgTable,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { shows } from './shows';
import { breeds } from './breeds';

// One row per breed scheduled at a show — the home for per-breed, per-show
// config that single-breed shows never needed. Most importantly: whether
// Challenge Certificates are on offer for THIS breed at THIS show. The RKC
// allocates CCs per breed, so at an all-breed show some breeds have CCs and
// some don't (e.g. National Dog Show: Akita has CCs, Canaan Dog doesn't).
//
// Until now breeds were only *implicit* at a show via showClasses.breedId,
// leaving nowhere to hang per-breed settings. Future per-breed config —
// Stud Book band, Category-3 flag, per-breed fee, breed judge — lives here too.
export const showBreeds = pgTable(
  'show_breeds',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    showId: uuid('show_id')
      .notNull()
      .references(() => shows.id, { onDelete: 'cascade' }),
    breedId: uuid('breed_id')
      .notNull()
      .references(() => breeds.id),
    /** Are Challenge Certificates on offer for this breed at this show?
     *  Only meaningful for championship-level shows. */
    ccOffered: boolean('cc_offered').notNull().default(false),
    /** Ordering within the breed's group (group order is fixed by RKC). */
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
    index('show_breeds_show_id_idx').on(table.showId),
    unique('show_breeds_show_breed_key').on(table.showId, table.breedId),
  ]
);

export const showBreedsRelations = relations(showBreeds, ({ one }) => ({
  show: one(shows, {
    fields: [showBreeds.showId],
    references: [shows.id],
  }),
  breed: one(breeds, {
    fields: [showBreeds.breedId],
    references: [breeds.id],
  }),
}));
