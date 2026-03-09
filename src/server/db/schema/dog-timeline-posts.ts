import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { timelinePostTypeEnum } from './enums';
import { dogs } from './dogs';
import { users } from './users';

export const dogTimelinePosts = pgTable(
  'dog_timeline_posts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    dogId: uuid('dog_id')
      .notNull()
      .references(() => dogs.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: timelinePostTypeEnum('type').notNull().default('photo'),
    caption: text('caption'),
    imageUrl: text('image_url'),
    imageStorageKey: text('image_storage_key'),
    videoUrl: text('video_url'),
    pinned: boolean('pinned').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('timeline_posts_dog_id_idx').on(table.dogId),
    index('timeline_posts_author_id_idx').on(table.authorId),
    index('timeline_posts_created_at_idx').on(table.createdAt),
  ]
);

export const dogTimelinePostsRelations = relations(
  dogTimelinePosts,
  ({ one }) => ({
    dog: one(dogs, {
      fields: [dogTimelinePosts.dogId],
      references: [dogs.id],
    }),
    author: one(users, {
      fields: [dogTimelinePosts.authorId],
      references: [users.id],
    }),
  })
);
