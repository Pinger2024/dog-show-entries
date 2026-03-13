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

  // Get all products first to see full structure
  const allProducts = await productService
    .getAllProductsAttributesRequest()
    .execute();

  const keys = Object.keys(allProducts);

  // Show full details for each product (especially the ones relevant to our use case)
  const interestingProducts = [
    'Perfect Bound Booklets',
    'Flyers',
    'Long Run Posters',
    'Folded Leaflets',
    'Folded & Laminated Leaflets',
  ];

  for (const key of keys) {
    const product = allProducts[key];
    console.log(`\n${'='.repeat(60)}`);
    console.log(`PRODUCT: "${key}"`);
    console.log(`${'='.repeat(60)}`);

    if (interestingProducts.includes(key)) {
      // Full details for interesting products
      console.log(JSON.stringify(product, null, 2).substring(0, 3000));
    } else {
      // Summary for others
      const attrs = Object.keys(product || {});
      console.log(`  Attributes: ${attrs.join(', ')}`);
      if (product?.productId) console.log(`  Product ID: ${product.productId}`);
    }
  }

  // Now try getting price lists for key products
  console.log('\n\n' + '='.repeat(60));
  console.log('PRICE LISTS');
  console.log('='.repeat(60));

  for (const name of ['Perfect Bound Booklets', 'Flyers']) {
    console.log(`\n--- Prices for "${name}" ---`);
    try {
      const response = await productService
        .priceListSingleProductRequest(name)
        .setMarkup(0)
        .execute();

      // Show first chunk of price data
      const str = JSON.stringify(response, null, 2);
      console.log(str.substring(0, 2000));
      if (str.length > 2000) console.log(`... (${str.length} total chars)`);
    } catch (err: any) {
      console.log(`  Error: ${err.errorMessage || err.message || err}`);
    }
  }

  // Also try product quantities
  console.log('\n\n--- Product Quantities ---');
  for (const name of ['Perfect Bound Booklets', 'Flyers']) {
    console.log(`\n"${name}":`);
    try {
      const response = await productService
        .getProductQuantitiesRequest(name)
        .execute();
      console.log(JSON.stringify(response, null, 2).substring(0, 1000));
    } catch (err: any) {
      console.log(`  Error: ${err.errorMessage || err.message || err}`);
    }
  }
}

main().catch(console.error);
