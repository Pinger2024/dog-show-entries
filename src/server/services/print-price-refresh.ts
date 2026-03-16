/**
 * Refreshes the local print price cache from Tradeprint.
 *
 * Downloads the full price CSV for each product, stream-parses every row,
 * and stores ALL specs/quantities in the database. This gives us full
 * flexibility to offer different paper types, sizes, etc. in future.
 *
 * Run daily via cron or on-demand from admin tools.
 * Typical data: ~200K rows total across all products (trivial for Postgres).
 */

import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { printPriceCache } from '@/server/db/schema';
import { getPrintableProducts, type PrintProduct } from '@/lib/print-products';
import { getSDK, parseCSVLine } from './tradeprint';

/**
 * Build a set of allowed spec values per key from a product's presets and defaults.
 * Only rows matching these specs will be cached — dramatically reduces storage
 * for products like Perfect Bound Booklets that have millions of combinations.
 */
function buildSpecFilter(product: PrintProduct): Map<string, Set<string>> {
  const filter = new Map<string, Set<string>>();
  // Collect all spec values from default specs and all presets
  const allSpecs = [product.defaultSpecs, ...product.presets.map((p) => p.specs)];
  for (const specs of allSpecs) {
    for (const [key, value] of Object.entries(specs)) {
      if (!filter.has(key)) filter.set(key, new Set());
      filter.get(key)!.add(value);
    }
  }
  return filter;
}

/** Check if a row's specs match the allowed values (all filter keys must match) */
function matchesSpecFilter(specs: Record<string, string>, filter: Map<string, Set<string>>): boolean {
  for (const [key, allowed] of filter) {
    const value = specs[key];
    if (value === undefined || !allowed.has(value)) return false;
  }
  return true;
}

const SERVICE_LEVELS = ['Saver', 'Standard', 'Express'] as const;

/**
 * Refresh prices for all printable products across all service levels.
 */
export async function refreshAllPrintPrices(): Promise<{
  productsRefreshed: number;
  totalRows: number;
  errors: string[];
}> {
  const products = getPrintableProducts();
  let totalRows = 0;
  const errors: string[] = [];

  for (const product of products) {
    try {
      console.log(`[print-price-refresh] Fetching ${product.tradeprintProductName}...`);

      const rows = await fetchAndParseAllPrices(product.tradeprintProductName, product);

      if (rows.length === 0) {
        console.log(`[print-price-refresh] No prices found for ${product.tradeprintProductName}`);
        continue;
      }

      // Atomic swap: delete old + insert new in a single transaction
      await db.transaction(async (tx) => {
        await tx
          .delete(printPriceCache)
          .where(eq(printPriceCache.tradeprintProductName, product.tradeprintProductName));

        for (let i = 0; i < rows.length; i += 1000) {
          await tx.insert(printPriceCache).values(rows.slice(i, i + 1000));
        }
      });

      totalRows += rows.length;
      console.log(`[print-price-refresh] Cached ${rows.length} prices for ${product.tradeprintProductName}`);
    } catch (err) {
      const msg = `${product.tradeprintProductName}: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[print-price-refresh] Error: ${msg}`);
      errors.push(msg);
    }
  }

  return { productsRefreshed: products.length, totalRows, errors };
}

/**
 * Fetch the full CSV for a product and parse ALL rows into cache-ready objects.
 * Uses streaming to avoid loading the full CSV into memory.
 */
async function fetchAndParseAllPrices(
  productName: string,
  product: PrintProduct
): Promise<Array<typeof printPriceCache.$inferInsert>> {
  const specFilter = buildSpecFilter(product);
  const SDK = getSDK();
  const productService = new SDK.ProductService();
  const response = await productService
    .priceListSingleProductRequest(productName)
    .setMarkup(0)
    .setFormatCsv()
    .execute();

  if (!response?.url) {
    console.error('[print-price-refresh] No URL in response:', JSON.stringify(response).slice(0, 200));
    return [];
  }

  const resp = await fetch(response.url);
  if (!resp.ok) throw new Error(`CSV fetch failed: ${resp.status}`);
  if (!resp.body) throw new Error('No response body');

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let headersParsed = false;
  const rows: Array<typeof printPriceCache.$inferInsert> = [];
  const now = new Date();

  // Column indices (populated after header row)
  let qtyIdx = -1;
  const priceIndices: Record<string, number> = {};
  const specColumnNames: string[] = [];
  const specColumnIndices: number[] = [];
  const META_COLUMNS = new Set([
    'ProductName', 'ProductID', 'Quantity', 'Tax',
    'PriceSaver', 'PriceStandard', 'PriceExpress',
    'Production Days Saver', 'Production Days Standard', 'Production Days Express',
  ]);

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const cols = parseCSVLine(trimmed);

      if (!headersParsed) {
        const headers = cols.map((c) => c.trim());
        qtyIdx = headers.indexOf('Quantity');
        for (const level of SERVICE_LEVELS) {
          const idx = headers.indexOf(`Price${level}`);
          if (idx >= 0) priceIndices[level] = idx;
        }
        for (let i = 0; i < headers.length; i++) {
          if (!META_COLUMNS.has(headers[i])) {
            specColumnNames.push(headers[i]);
            specColumnIndices.push(i);
          }
        }
        headersParsed = true;
        continue;
      }

      processDataRow(cols, qtyIdx, specColumnNames, specColumnIndices, priceIndices, productName, now, rows, specFilter);
    }
  }

  // Process remaining buffer
  if (buffer.trim() && headersParsed) {
    processDataRow(parseCSVLine(buffer.trim()), qtyIdx, specColumnNames, specColumnIndices, priceIndices, productName, now, rows, specFilter);
  }

  return rows;
}

/** Extract price rows from a single CSV data line */
function processDataRow(
  cols: string[],
  qtyIdx: number,
  specColumnNames: string[],
  specColumnIndices: number[],
  priceIndices: Record<string, number>,
  productName: string,
  now: Date,
  rows: Array<typeof printPriceCache.$inferInsert>,
  specFilter: Map<string, Set<string>>
) {
  if (qtyIdx < 0) return;
  const qty = parseInt(cols[qtyIdx]?.trim(), 10);
  if (isNaN(qty) || qty <= 0) return;

  const specs: Record<string, string> = {};
  for (let i = 0; i < specColumnNames.length; i++) {
    const val = cols[specColumnIndices[i]];
    if (val) specs[specColumnNames[i]] = val.trim();
  }

  // Skip rows that don't match our product's configured specs
  if (!matchesSpecFilter(specs, specFilter)) return;

  for (const level of SERVICE_LEVELS) {
    const priceIdx = priceIndices[level];
    if (priceIdx === undefined) continue;

    const totalPrice = parseFloat(cols[priceIdx]?.trim());
    if (isNaN(totalPrice) || totalPrice <= 0) continue;

    rows.push({
      tradeprintProductName: productName,
      serviceLevel: level.toLowerCase(),
      quantity: qty,
      totalPricePence: Math.round(totalPrice),
      specs,
      fetchedAt: now,
    });
  }
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
