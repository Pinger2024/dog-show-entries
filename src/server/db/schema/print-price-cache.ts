import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Full Tradeprint price cache — ALL specs and quantities.
 * Refreshed daily by cron. Stores the entire price list so we have
 * full flexibility to offer different paper types, sizes, etc. in future.
 *
 * ~185K rows for booklets, ~10K for flyers, ~60 for posters.
 * Postgres handles this easily — it's just structured data, not 104MB CSV.
 */
export const printPriceCache = pgTable(
  'print_price_cache',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tradeprintProductName: text('tradeprint_product_name').notNull(),
    serviceLevel: text('service_level').notNull(), // Saver, Standard, Express
    quantity: integer('quantity').notNull(),
    totalPricePence: integer('total_price_pence').notNull(), // ex-VAT total for this quantity
    specs: jsonb('specs').notNull().$type<Record<string, string>>(), // all spec columns as key-value
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('print_price_cache_product_idx').on(table.tradeprintProductName, table.serviceLevel),
    index('print_price_cache_lookup_idx').on(table.tradeprintProductName, table.serviceLevel, table.quantity),
  ]
);
