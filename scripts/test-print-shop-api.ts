/**
 * Test the Print Shop API end-to-end.
 * Usage: npx tsx scripts/test-print-shop-api.ts
 */
import 'dotenv/config';
import { getAvailableQuantities, getTradePrices, getDeliveryEstimate } from '@/server/services/tradeprint';
import { getPrintableProducts, calculateSellingPrice } from '@/lib/print-products';

async function main() {
  const products = getPrintableProducts();
  console.log(`\nTesting ${products.length} printable products...\n`);

  for (const product of products) {
    console.log(`── ${product.label} (${product.tradeprintProductId}) ──`);

    try {
      // 1. Quantities
      const quantities = await getAvailableQuantities(
        product.tradeprintProductId,
        product.defaultSpecs
      );
      console.log(`   Quantities (${quantities.length}): ${quantities.slice(0, 8).join(', ')}${quantities.length > 8 ? '...' : ''}`);

      if (quantities.length === 0) {
        console.log(`   ⚠ No quantities — won't show in Print Shop`);
        console.log('');
        continue;
      }

      // 2. Prices
      const testQty = quantities[0];
      const prices = await getTradePrices(product.tradeprintProductName, product.defaultSpecs);
      const unitPrice = prices.get(testQty);
      if (unitPrice !== undefined) {
        const sellingPrice = calculateSellingPrice(unitPrice);
        console.log(`   Price (qty ${testQty}): trade ${unitPrice}p → sell ${sellingPrice}p (£${(sellingPrice / 100).toFixed(2)}/unit)`);
      } else {
        console.log(`   ⚠ No price for qty ${testQty} — price map has ${prices.size} entries`);
        if (prices.size > 0) {
          const sample = [...prices.entries()].slice(0, 3);
          console.log(`     Sample: ${sample.map(([q, p]) => `qty ${q} = ${p}p`).join(', ')}`);
        }
      }

      // 3. Delivery estimate
      const delivery = await getDeliveryEstimate(
        product.tradeprintProductId,
        'Standard',
        testQty,
        product.defaultSpecs,
        'G51 1PR'
      );
      if (delivery) {
        console.log(`   Delivery: ${delivery.formattedDate}`);
      } else {
        console.log(`   ⚠ No delivery estimate`);
      }

      console.log(`   ✓ Ready for Print Shop`);
    } catch (err) {
      console.log(`   ✗ ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }
    console.log('');
  }

  console.log('Done.');
}

main().catch(console.error);
