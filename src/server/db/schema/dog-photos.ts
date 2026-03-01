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
import { dogs } from './dogs';

export const dogPhotos = pgTable(
  'dog_photos',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    dogId: uuid('dog_id')
      .notNull()
      .references(() => dogs.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull(),
    url: text('url').notNull(),
    caption: text('caption'),
    isPrimary: boolean('is_primary').default(false).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('dog_photos_dog_id_idx').on(table.dogId),
  ]
);

export const dogPhotosRelations = relations(dogPhotos, ({ one }) => ({
  dog: one(dogs, {
    fields: [dogPhotos.dogId],
    references: [dogs.id],
  }),
}));
