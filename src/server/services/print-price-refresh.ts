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
import { getPrintableProducts } from '@/lib/print-products';
import { capitaliseServiceLevel, getSDK } from './tradeprint';

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

      const rows = await fetchAndParseAllPrices(product.tradeprintProductName);

      if (rows.length === 0) {
        console.log(`[print-price-refresh] No prices found for ${product.tradeprintProductName}`);
        continue;
      }

      // Delete old rows for this product
      await db
        .delete(printPriceCache)
        .where(eq(printPriceCache.tradeprintProductName, product.tradeprintProductName));

      // Insert in batches of 1000
      for (let i = 0; i < rows.length; i += 1000) {
        const batch = rows.slice(i, i + 1000);
        await db.insert(printPriceCache).values(batch);
      }

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
  productName: string
): Promise<Array<typeof printPriceCache.$inferInsert>> {
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
  let headers: string[] = [];
  const rows: Array<typeof printPriceCache.$inferInsert> = [];
  const now = new Date();

  // Indices for key columns
  let qtyIdx = -1;
  const priceIndices: Record<string, number> = {}; // 'Saver' → colIdx, etc.
  const specColumnNames: string[] = []; // columns that are spec values (not qty/price/meta)
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
        headers = cols.map((c) => c.trim());
        qtyIdx = headers.indexOf('Quantity');
        for (const level of SERVICE_LEVELS) {
          const idx = headers.indexOf(`Price${level}`);
          if (idx >= 0) priceIndices[level] = idx;
        }
        // Everything that isn't a meta column is a spec
        for (let i = 0; i < headers.length; i++) {
          if (!META_COLUMNS.has(headers[i])) specColumnNames.push(headers[i]);
        }
        headersParsed = true;
        continue;
      }

      if (qtyIdx < 0) continue;

      const qty = parseInt(cols[qtyIdx]?.trim(), 10);
      if (isNaN(qty) || qty <= 0) continue;

      // Build specs object from non-meta columns
      const specs: Record<string, string> = {};
      for (const specName of specColumnNames) {
        const idx = headers.indexOf(specName);
        if (idx >= 0 && cols[idx]) specs[specName] = cols[idx].trim();
      }

      // One row per service level
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
  }

  // Process remaining buffer
  if (buffer.trim() && headersParsed) {
    const cols = parseCSVLine(buffer.trim());
    const qty = parseInt(cols[qtyIdx]?.trim(), 10);
    if (!isNaN(qty) && qty > 0) {
      const specs: Record<string, string> = {};
      for (const specName of specColumnNames) {
        const idx = headers.indexOf(specName);
        if (idx >= 0 && cols[idx]) specs[specName] = cols[idx].trim();
      }
      for (const level of SERVICE_LEVELS) {
        const priceIdx = priceIndices[level];
        if (priceIdx === undefined) continue;
        const totalPrice = parseFloat(cols[priceIdx]?.trim());
        if (!isNaN(totalPrice) && totalPrice > 0) {
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
    }
  }

  return rows;
}

/**
 * Get a cached trade price for specific specs + quantity.
 * Returns unit price in pence (ex-VAT), or null if not cached.
 */
export async function getCachedTradePrice(
  productName: string,
  specs: Record<string, string>,
  quantity: number,
  serviceLevel: string = 'standard'
): Promise<number | null> {
  // Use JSONB containment operator @> to match specs
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
  return Math.round(rows[0].totalPricePence / quantity);
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

/** Simple CSV line parser that handles quoted fields */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
