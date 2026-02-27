import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { catalogueFormatEnum, catalogueStatusEnum } from './enums';
import { shows } from './shows';

export const catalogues = pgTable(
  'catalogues',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    showId: uuid('show_id')
      .notNull()
      .references(() => shows.id, { onDelete: 'cascade' }),
    format: catalogueFormatEnum('format').notNull().default('standard'),
    status: catalogueStatusEnum('status').notNull().default('draft'),
    config: jsonb('config'),
    generatedUrl: text('generated_url'),
    generatedAt: timestamp('generated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('catalogues_show_id_idx').on(table.showId),
  ]
);

export const cataloguesRelations = relations(catalogues, ({ one }) => ({
  show: one(shows, {
    fields: [catalogues.showId],
    references: [shows.id],
  }),
}));
