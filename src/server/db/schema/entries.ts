import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { asc, relations, sql, type SQL } from 'drizzle-orm';
import { entryStatusEnum, entryTypeEnum } from './enums';
import { shows } from './shows';
import { dogs } from './dogs';
import { users } from './users';
import { orders } from './orders';
import { entryClasses } from './entry-classes';
import { payments } from './payments';
import { entryAuditLog } from './entry-audit-log';
import { juniorHandlerDetails } from './junior-handler-details';

export const entries = pgTable(
  'entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    showId: uuid('show_id')
      .notNull()
      .references(() => shows.id, { onDelete: 'cascade' }),
    dogId: uuid('dog_id').references(() => dogs.id, { onDelete: 'set null' }), // nullable for JH entries
    exhibitorId: uuid('exhibitor_id')
      .notNull()
      .references(() => users.id),
    handlerId: uuid('handler_id').references(() => users.id, { onDelete: 'set null' }),
    orderId: uuid('order_id'), // FK added via orders table to avoid circular ref
    entryType: entryTypeEnum('entry_type').notNull().default('standard'),
    isNfc: boolean('is_nfc').notNull().default(false),
    status: entryStatusEnum('status').notNull().default('pending'),
    paymentIntentId: text('payment_intent_id'),
    entryDate: timestamp('entry_date', { withTimezone: true })
      .defaultNow()
      .notNull(),
    catalogueNumber: text('catalogue_number'),
    catalogueRequested: boolean('catalogue_requested').notNull().default(false),
    /** RKC F(1).11.b.(6) / (8) — exhibitors have the right to have their name
     *  and address withheld from the catalogue. When true, catalogue rendering
     *  displays "Owner withheld" in place of owner name/address. */
    withholdFromPublication: boolean('withhold_from_publication').notNull().default(false),
    /** RKC registration flags printed after the dog's name — NAF "name applied
     *  for", TAF "transfer applied for", CNAF "change of name applied for".
     *  Any combination may apply at once, hence independent booleans.
     *  Deliberately PER ENTRY, not on the dog (Mandy 2026-08-09): the RKC
     *  judges the status as at the entry closing date, and an exhibitor would
     *  never go back and clear a flag set on their dog, so it would haunt
     *  every later catalogue. Formatting lives in `lib/registration-flags.ts`. */
    naf: boolean('naf').notNull().default(false),
    taf: boolean('taf').notNull().default(false),
    cnaf: boolean('cnaf').notNull().default(false),
    /** Authority to Compete number for a dog resident outside the UK
     *  (e.g. "ATC01234SWE") — required before an overseas dog can be entered
     *  in RKC events, and printed after its name. Granted rather than pending,
     *  so unlike the three above it carries a number. Kept alongside them per
     *  show at Mandy's request (2026-08-10). */
    atcNumber: text('atc_number'),
    absent: boolean('absent').notNull().default(false),
    svMembershipNumber: text('sv_membership_number'),
    totalFee: integer('total_fee').notNull(),
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
    index('entries_show_id_idx').on(table.showId),
    index('entries_dog_id_idx').on(table.dogId),
    index('entries_exhibitor_id_idx').on(table.exhibitorId),
    index('entries_status_idx').on(table.status),
    index('entries_order_id_idx').on(table.orderId),
  ]
);

export const entriesRelations = relations(entries, ({ one, many }) => ({
  show: one(shows, {
    fields: [entries.showId],
    references: [shows.id],
  }),
  dog: one(dogs, {
    fields: [entries.dogId],
    references: [dogs.id],
  }),
  exhibitor: one(users, {
    fields: [entries.exhibitorId],
    references: [users.id],
    relationName: 'exhibitorEntries',
  }),
  handler: one(users, {
    fields: [entries.handlerId],
    references: [users.id],
    relationName: 'handlerEntries',
  }),
  order: one(orders, {
    fields: [entries.orderId],
    references: [orders.id],
    relationName: 'orderEntries',
  }),
  entryClasses: many(entryClasses),
  payments: many(payments),
  auditLog: many(entryAuditLog),
  juniorHandlerDetails: one(juniorHandlerDetails, {
    fields: [entries.id],
    references: [juniorHandlerDetails.entryId],
  }),
}));

/** Numeric-safe `ORDER BY catalogue_number ASC`.
 *
 * `catalogueNumber` is `text`, not `integer` (see the column above) — so a
 * bare `asc(entries.catalogueNumber)` sorts lexicographically: 1, 12, 15,
 * 18, 2, 20, 3 … instead of 1, 2, 3 … 12, 15, 18, 20. Real bug, spotted by
 * Mandy on BAGSD's absentee list (coordinator's review, 2026-09-02):
 * the Cat. column ran 12, 15, 18 … 48, 5, 51.
 *
 * Every catalogue number is always a plain positive-integer string
 * (`assignNumbers` in catalogue-numbering.ts does `String(next++)`, never
 * anything with letters or padding), so casting to `int` for the ORDER BY
 * comparison is always safe. Use this everywhere the query orders
 * `entries` by catalogue number — it was reimplemented as a bare `asc()`
 * independently at half a dozen call sites, each carrying the same bug. */
export function catalogueNumberAsc(): SQL {
  return asc(sql`(${entries.catalogueNumber})::int`);
}
