/**
 * Print price cache — read-only accessors.
 *
 * This file used to also contain a refresh job that downloaded the
 * full price CSV from Tradeprint and stored every quantity × spec
 * combination in the `printPriceCache` table. That approach doesn't
 * translate to Mixam: Mixam's /api/public/offers endpoint is per-
 * quantity, per-spec — there's no bulk CSV endpoint to scrape.
 *
 * When we switched from Tradeprint to Mixam on 2026-04-11 (backlog
 * #99), the refresh job was neutralised. The read-only functions
 * below still work against whatever's in the cache table, but new
 * pricing is fetched live from Mixam via `getTradePrice` in
 * `src/server/services/mixam.ts`. The cache table can be retired
 * entirely once we're confident the live-fetch path is performant
 * enough; for now we leave it in place so that any stale data the
 * Print Shop UI reads is visibly out-of-date rather than mysteriously
 * missing.
 */

import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { printPriceCache } from '@/server/db/schema';

/**
 * Neutralised — Mixam's pricing model is per-quantity, not bulk
 * CSV, so there's nothing to refresh. Returns an empty result with
 * a single warning so anyone who calls this (cron job, admin tool)
 * gets a clear signal rather than a silent no-op.
 */
export async function refreshAllPrintPrices(): Promise<{
  productsRefreshed: number;
  totalRows: number;
  errors: string[];
}> {
  const warning =
    'refreshAllPrintPrices is a no-op under Mixam — pricing is fetched live per-quantity via getTradePrice in mixam.ts. Remove this cron job from your scheduler.';
  console.warn(`[print-price-refresh] ${warning}`);
  return { productsRefreshed: 0, totalRows: 0, errors: [warning] };
}

/**
 * Get a cached trade price for specific specs + quantity.
 * Returns the TOTAL price in pence (ex-VAT) for the given quantity, or null if not cached.
 * Callers should compute unit price by dividing after markup to avoid premature rounding.
 */
export async function getCachedTotalPrice(
  productName: string,
  specs: Record<string, string>,
  quantity: number,
  serviceLevel: string = 'standard'
): Promise<number | null> {
  const rows = await db
    .select({ totalPricePence: printPriceCache.totalPricePence })
    .from(printPriceCache)
    .where(
      and(
        eq(printPriceCache.tradeprintProductName, productName),
        eq(printPriceCache.serviceLevel, serviceLevel.toLowerCase()),
        eq(printPriceCache.quantity, quantity),
        sql`${printPriceCache.specs} @> ${JSON.stringify(specs)}::jsonb`
      )
    )
    .limit(1);

  if (rows.length === 0) return null;
  return rows[0].totalPricePence;
}

/**
 * Get all available quantities for specific specs from cache.
 */
export async function getCachedQuantities(
  productName: string,
  specs: Record<string, string>,
  serviceLevel: string = 'standard'
): Promise<number[]> {
  const rows = await db
    .select({ quantity: printPriceCache.quantity })
    .from(printPriceCache)
    .where(
      and(
        eq(printPriceCache.tradeprintProductName, productName),
        eq(printPriceCache.serviceLevel, serviceLevel.toLowerCase()),
        sql`${printPriceCache.specs} @> ${JSON.stringify(specs)}::jsonb`
      )
    )
    .orderBy(printPriceCache.quantity);

  return rows.map((r) => r.quantity);
}

/**
 * Check if the cache has been populated.
 */
export async function isCachePopulated(): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(printPriceCache);
  return Number(row?.count ?? 0) > 0;
}

/**
 * Get distinct values for a specific spec key, optionally filtered by other specs.
 * Powers the configurator dropdowns — shows only compatible options.
 */
export async function getDistinctSpecValues(
  productName: string,
  specKey: string,
  serviceLevel: string = 'standard',
  filterSpecs?: Record<string, string>
): Promise<string[]> {
  const conditions = [
    eq(printPriceCache.tradeprintProductName, productName),
    eq(printPriceCache.serviceLevel, serviceLevel.toLowerCase()),
  ];

  if (filterSpecs && Object.keys(filterSpecs).length > 0) {
    conditions.push(sql`${printPriceCache.specs} @> ${JSON.stringify(filterSpecs)}::jsonb`);
  }

  const rows = await db
    .selectDistinct({
      value: sql<string>`${printPriceCache.specs}->>${specKey}`,
    })
    .from(printPriceCache)
    .where(and(...conditions));

  return rows
    .map((r) => r.value)
    .filter((v): v is string => v !== null && v !== '')
    .sort();
}
