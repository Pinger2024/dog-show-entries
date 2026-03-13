import 'dotenv/config';

const SDK = require('tradeprint-node-sdk');

SDK.setEnvironment(SDK.Environments.Sandbox);
SDK.setDebugging(false);
SDK.setCredentials(
  process.env.TRADEPRINT_API_USERNAME,
  process.env.TRADEPRINT_API_PASSWORD
);

async function main() {
  const productService = new SDK.ProductService();

  console.log('=== 1. Getting ALL product attributes ===\n');
  try {
    const allProducts = await productService
      .getAllProductsAttributesRequest()
      .execute();

    // List all product names
    if (Array.isArray(allProducts)) {
      console.log(`Found ${allProducts.length} products:\n`);
      for (const p of allProducts) {
        console.log(`  - ${p.productName || p.name || JSON.stringify(Object.keys(p))}`);
      }
    } else {
      // Might be an object with product keys
      const keys = Object.keys(allProducts);
      console.log(`Found ${keys.length} products:\n`);
      for (const key of keys.slice(0, 30)) {
        const product = allProducts[key];
        console.log(`  - ${key}: ${product?.productName || product?.name || ''}`);
      }
      if (keys.length > 30) console.log(`  ... and ${keys.length - 30} more`);
    }
  } catch (err: any) {
    console.error('Error fetching all products:', err.errorMessage || err.message || err);
  }

  // Get attributes for our specific products
  const productNames = [
    'Perfect Bound Booklets',
    'Flyers',
    'Folded Leaflets',
    'Long Run Posters',
  ];

  for (const name of productNames) {
    console.log(`\n=== Product: "${name}" ===`);
    try {
      const attrs = await productService
        .getSpecificProductAttributesRequest(name)
        .execute();
      console.log(JSON.stringify(attrs, null, 2).substring(0, 3000));
    } catch (err: any) {
      console.log(`  Not found or error: ${err.errorMessage || err.message || 'unknown'}`);
    }
  }

  // Also try quantities with minimal specs to see what works
  console.log('\n=== Testing quantities with minimal specs ===');
  const testCases = [
    { id: 'PRD-WLPVQMTE', name: 'Flyers', specs: {} },
    { id: 'PRD-WLPVQMTE', name: 'Flyers', specs: { 'Size': 'A6' } },
    { id: 'PRD-HKSRILFY', name: 'Perfect Bound Booklets', specs: {} },
  ];
  for (const tc of testCases) {
    console.log(`\n  ${tc.name} (${tc.id}) specs=${JSON.stringify(tc.specs)}`);
    try {
      const response = await productService
        .productQuantitiesRequest()
        .setProductId(tc.id)
        .setServiceLevel('Standard')
        .setProductionData(tc.specs)
        .execute();
      const qtys = Array.isArray(response) ? response.slice(0, 10) : response;
      console.log(`  Result: ${JSON.stringify(qtys)}`);
    } catch (err: any) {
      console.log(`  Error: ${err.errorMessage || err.message || JSON.stringify(err).slice(0, 300)}`);
    }
  }
}

main().catch(console.error);
