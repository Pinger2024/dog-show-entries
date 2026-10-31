import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { shows } from './shows';
import { users } from './users';

/**
 * Every tap of a share button on a show page. Lets us show social proof
 * ("shared 24 times this week") and measure which channels actually get
 * used. Distinct from `orders.referralSource` — that tracks CONVERSIONS
 * from share links; this tracks the SHARES themselves.
 *
 * Write path is fire-and-forget from the client — never block the share
 * UX on DB latency. No user FK requirement (anonymous shares are fine).
 */
export const shareEvents = pgTable(
  'share_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    showId: uuid('show_id')
      .notNull()
      .references(() => shows.id),
    channel: text('channel').notNull(), // whatsapp | facebook | instagram | copy | hero
    userId: uuid('user_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('share_events_show_id_idx').on(table.showId),
    index('share_events_channel_idx').on(table.channel),
    index('share_events_created_at_idx').on(table.createdAt),
  ]
);

export const shareEventsRelations = relations(shareEvents, ({ one }) => ({
  show: one(shows, {
    fields: [shareEvents.showId],
    references: [shows.id],
  }),
  user: one(users, {
    fields: [shareEvents.userId],
    references: [users.id],
  }),
}));
