import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { sponsorCategoryEnum, sponsorTierEnum, adSizeEnum } from './enums';
import { organisations } from './organisations';
import { shows } from './shows';
import { showClasses } from './show-classes';

// ── Organisation-level sponsor directory ──────────────────

export const sponsors = pgTable(
  'sponsors',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id),
    name: text('name').notNull(),
    contactName: text('contact_name'),
    contactEmail: text('contact_email'),
    website: text('website'),
    logoStorageKey: text('logo_storage_key'),
    logoUrl: text('logo_url'),
    category: sponsorCategoryEnum('category'),
    notes: text('notes'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('sponsors_organisation_id_idx').on(table.organisationId),
  ]
);

export const sponsorsRelations = relations(sponsors, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [sponsors.organisationId],
    references: [organisations.id],
  }),
  showSponsors: many(showSponsors),
}));

// ── Show-level sponsor assignments ──────────────────────

export const showSponsors = pgTable(
  'show_sponsors',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    showId: uuid('show_id')
      .notNull()
      .references(() => shows.id, { onDelete: 'cascade' }),
    sponsorId: uuid('sponsor_id')
      .notNull()
      .references(() => sponsors.id),
    tier: sponsorTierEnum('tier').notNull(),
    displayOrder: integer('display_order').default(0).notNull(),
    customTitle: text('custom_title'),
    adImageStorageKey: text('ad_image_storage_key'),
    adImageUrl: text('ad_image_url'),
    adSize: adSizeEnum('ad_size'),
    specialPrizes: text('special_prizes'),
    prizeMoney: integer('prize_money'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('show_sponsors_show_id_idx').on(table.showId),
    index('show_sponsors_sponsor_id_idx').on(table.sponsorId),
    unique('show_sponsors_show_sponsor_unique').on(
      table.showId,
      table.sponsorId
    ),
  ]
);

export const showSponsorsRelations = relations(
  showSponsors,
  ({ one, many }) => ({
    show: one(shows, {
      fields: [showSponsors.showId],
      references: [shows.id],
    }),
    sponsor: one(sponsors, {
      fields: [showSponsors.sponsorId],
      references: [sponsors.id],
    }),
    classSponsorships: many(classSponsorships),
  })
);

// ── Class-level sponsorships ──────────────────────────────

export const classSponsorships = pgTable(
  'class_sponsorships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    showClassId: uuid('show_class_id')
      .notNull()
      .references(() => showClasses.id, { onDelete: 'cascade' }),
    showSponsorId: uuid('show_sponsor_id')
      .references(() => showSponsors.id, { onDelete: 'cascade' }),
    // Free-text sponsor fields — for class sponsors typed directly (not from directory)
    sponsorName: text('sponsor_name'),
    sponsorAffix: text('sponsor_affix'),
    trophyName: text('trophy_name'),
    trophyDonor: text('trophy_donor'),
    prizeMoney: integer('prize_money'),
    prizeDescription: text('prize_description'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('class_sponsorships_show_class_id_idx').on(table.showClassId),
    index('class_sponsorships_show_sponsor_id_idx').on(table.showSponsorId),
  ]
);

export const classSponsorshipsRelations = relations(
  classSponsorships,
  ({ one }) => ({
    showClass: one(showClasses, {
      fields: [classSponsorships.showClassId],
      references: [showClasses.id],
    }),
    showSponsor: one(showSponsors, {
      fields: [classSponsorships.showSponsorId],
      references: [showSponsors.id],
    }),
  })
);
