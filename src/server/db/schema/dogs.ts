import {
  boolean,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { sexEnum, coatTypeEnum, registrationBodyEnum } from './enums';
import { breeds } from './breeds';
import { users } from './users';
import { entries } from './entries';
import { achievements } from './achievements';
import { dogOwners } from './dog-owners';
import { dogTitles } from './dog-titles';
import { dogPhotos } from './dog-photos';
import { dogSvProfile } from './dog-sv-profile';

export const dogs = pgTable(
  'dogs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    registeredName: text('registered_name').notNull(),
    kcRegNumber: text('kc_reg_number').unique(),
    registrationBody: registrationBodyEnum('registration_body'),
    registrationBodyOther: text('registration_body_other'),
    breedId: uuid('breed_id')
      .notNull()
      .references(() => breeds.id),
    sex: sexEnum('sex').notNull(),
    dateOfBirth: date('date_of_birth', { mode: 'string' }).notNull(),
    coatType: coatTypeEnum('coat_type'),
    microchipNumber: text('microchip_number'),
    sireName: text('sire_name'),
    sireRegistrationBody: registrationBodyEnum('sire_registration_body'),
    sireRegistrationNumber: text('sire_registration_number'),
    damName: text('dam_name'),
    damRegistrationBody: registrationBodyEnum('dam_registration_body'),
    damRegistrationNumber: text('dam_registration_number'),
    breederName: text('breeder_name'),
    breederCountry: text('breeder_country'),
    breederCity: text('breeder_city'),
    breederPostcode: text('breeder_postcode'),
    colour: text('colour'),
    registrationStatus: text('registration_status'), // null=registered, 'naf', 'taf', 'cnaf'
    bio: text('bio'),
    feedPrivate: boolean('feed_private').default(false).notNull(),
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
  svProfile: one(dogSvProfile, {
    fields: [dogs.id],
    references: [dogSvProfile.dogId],
  }),
}));
