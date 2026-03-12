/**
 * Refresh the print price cache from Tradeprint.
 *
 * Usage: npx tsx scripts/refresh-print-prices.ts
 *
 * Downloads full price lists for all printable products and stores
 * every row in the print_price_cache table. Takes a few minutes due
 * to the large CSV downloads (especially Perfect Bound Booklets at 104MB).
 */

import { refreshAllPrintPrices } from '@/server/services/print-price-refresh';

async function main() {
  console.log('Starting print price cache refresh...');
  console.log('This may take a few minutes for large products.\n');

  const start = Date.now();
  const result = await refreshAllPrintPrices();

  console.log('\n--- Done ---');
  console.log(`Products refreshed: ${result.productsRefreshed}`);
  console.log(`Total rows cached: ${result.totalRows}`);
  console.log(`Time: ${((Date.now() - start) / 1000).toFixed(1)}s`);

  if (result.errors.length > 0) {
    console.log('\nErrors:');
    result.errors.forEach((e) => console.log(`  - ${e}`));
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
