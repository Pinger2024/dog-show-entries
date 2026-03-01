import {
  date,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { sexEnum } from './enums';
import { breeds } from './breeds';
import { users } from './users';
import { entries } from './entries';
import { achievements } from './achievements';
import { dogOwners } from './dog-owners';
import { dogTitles } from './dog-titles';
import { dogPhotos } from './dog-photos';

export const dogs = pgTable(
  'dogs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    registeredName: text('registered_name').notNull(),
    kcRegNumber: text('kc_reg_number').unique(),
    breedId: uuid('breed_id')
      .notNull()
      .references(() => breeds.id),
    sex: sexEnum('sex').notNull(),
    dateOfBirth: date('date_of_birth', { mode: 'string' }).notNull(),
    sireName: text('sire_name'),
    damName: text('dam_name'),
    breederName: text('breeder_name'),
    colour: text('colour'),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('dogs_breed_id_idx').on(table.breedId),
    index('dogs_owner_id_idx').on(table.ownerId),
    index('dogs_kc_reg_number_idx').on(table.kcRegNumber),
  ]
);

export const dogsRelations = relations(dogs, ({ one, many }) => ({
  breed: one(breeds, {
    fields: [dogs.breedId],
    references: [breeds.id],
  }),
  owner: one(users, {
    fields: [dogs.ownerId],
    references: [users.id],
  }),
  entries: many(entries),
  achievements: many(achievements),
  owners: many(dogOwners),
  titles: many(dogTitles),
  photos: many(dogPhotos),
}));
