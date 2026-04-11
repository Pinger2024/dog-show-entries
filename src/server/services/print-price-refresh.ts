/**
 * Print price accessors — thin adapters over the Mixam service.
 *
 * The `getCached*` naming is historical: under Tradeprint these read
 * from a `printPriceCache` Postgres table that was bulk-refreshed
 * from a CSV endpoint. Mixam has no bulk price endpoint, so every
 * call goes live to `src/server/services/mixam.ts`. The names are
 * kept only to avoid a cascading rename across print-orders.ts.
 */

import { getTradePrice } from './mixam';
import { PRINT_PRODUCTS } from '@/lib/print-products';

/** Returns TOTAL price in pence (ex-VAT), or null if no offer. */
export async function getCachedTotalPrice(
  productName: string,
  specs: Record<string, string>,
  quantity: number,
): Promise<number | null> {
  return getTradePrice(productName, specs, quantity);
}

/**
 * Return distinct values a spec key can take for a given product.
 * Derived from the product's static presets + defaultSpecs — this
 * limits the UI to spec combinations the product was configured with
 * (which is what we want — every other combination would need a
 * bespoke Mixam spec translation).
 */
export function getDistinctSpecValues(
  productName: string,
  specKey: string,
): string[] {
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
