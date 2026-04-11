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

import {
  getTradePrice,
  getAvailableQuantities,
} from './mixam';
import { PRINT_PRODUCTS } from '@/lib/print-products';

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
 * Legacy-shaped accessor that the tRPC print-orders router still
 * imports. Under Tradeprint this read from a local cache populated
 * by the refresh job; under Mixam we fetch live per-quantity via
 * the /offers endpoint and scale to the total.
 *
 * Returns TOTAL price in pence (ex-VAT), or null if no offer.
 */
export async function getCachedTotalPrice(
  productName: string,
  specs: Record<string, string>,
  quantity: number,
  serviceLevel: string = 'standard',
): Promise<number | null> {
  const unitPence = await getTradePrice(productName, specs, quantity, serviceLevel);
  if (unitPence == null) return null;
  return unitPence * quantity;
}

/**
 * Legacy-shaped accessor — returns the canonical list of quantities
 * the Print Shop UI offers. Under Tradeprint this was filtered from
 * the cached CSV; under Mixam there's no bulk list so we use the
 * same canonical quantity set that mixam.ts exposes.
 */
export async function getCachedQuantities(
  productName: string,
  _specs: Record<string, string>,
  serviceLevel: string = 'standard',
): Promise<number[]> {
  return getAvailableQuantities(productName, _specs, serviceLevel);
}

/**
 * Legacy-shaped accessor — returns distinct values a spec key can
 * take for a given product. Under Tradeprint this filtered the
 * cached CSV; under Mixam we derive it from the product's static
 * presets + defaultSpecs in print-products.ts. This limits the UI
 * to the same set of spec combinations the product was configured
 * with (which is what we want — every other combination would
 * require a bespoke Mixam spec translation anyway).
 */
export async function getDistinctSpecValues(
  productName: string,
  specKey: string,
  _serviceLevel: string = 'standard',
  _filterSpecs?: Record<string, string>,
): Promise<string[]> {
  const product = PRINT_PRODUCTS.find(
    (p) => p.tradeprintProductName === productName,
  );
  if (!product) return [];
  const values = new Set<string>();
  const defaultValue = product.defaultSpecs[specKey];
  if (defaultValue) values.add(defaultValue);
  for (const preset of product.presets) {
    const v = preset.specs[specKey];
    if (v) values.add(v);
  }
  return Array.from(values);
}

// (Old Tradeprint DB-cache accessors lived here — deleted as part of
// the Mixam swap. The Mixam-backed replacements are above, near the
// top of the file.)
