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
import { adSizeEnum, advertDocumentEnum, advertPositionEnum } from './enums';
import { shows } from './shows';

export const catalogueAdverts = pgTable(
  'catalogue_adverts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    showId: uuid('show_id')
      .notNull()
      .references(() => shows.id, { onDelete: 'cascade' }),
    advertiserName: text('advertiser_name').notNull(),
    adType: adSizeEnum('ad_type').notNull().default('full_page'),
    /** Which document the advert slots into. */
    document: advertDocumentEnum('document').notNull().default('catalogue'),
    /** Where in the document the advert renders. */
    position: advertPositionEnum('position').notNull().default('last_page'),
    imageStorageKey: text('image_storage_key'),
    imageUrl: text('image_url'),
    textContent: text('text_content'),
    sortOrder: integer('sort_order').notNull().default(0),
    isPaid: boolean('is_paid').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('catalogue_adverts_show_id_idx').on(table.showId)]
);

export const catalogueAdvertsRelations = relations(catalogueAdverts, ({ one }) => ({
  show: one(shows, {
    fields: [catalogueAdverts.showId],
    references: [shows.id],
  }),
}));
