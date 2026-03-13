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

  // Get price lists with JSON format (not CSV)
  const queries = [
    { name: 'Perfect Bound Booklets', label: 'A5 Booklet (Catalogue)' },
    { name: 'Flyers', label: 'Flyers (Prize Cards / Ring Numbers)' },
    { name: 'Long Run Posters', label: 'Posters (Ring Board)' },
  ];

  for (const q of queries) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`PRICES: ${q.label} ("${q.name}")`);
    console.log('='.repeat(60));
    try {
      const response = await productService
        .priceListSingleProductRequest(q.name)
        .setMarkup(0)
        .setFormatJson()
        .execute();

      // Show structure and sample prices
      if (typeof response === 'object') {
        const str = JSON.stringify(response, null, 2);
        // Show first 4000 chars to see the pricing structure
        console.log(str.substring(0, 4000));
        if (str.length > 4000) console.log(`\n... (${str.length} total chars, truncated)`);
      } else {
        console.log(response);
      }
    } catch (err: any) {
      console.log(`Error: ${err.errorMessage || err.message || err}`);
    }
  }

  // Also get delivery estimates for our key products
  console.log('\n\n' + '='.repeat(60));
  console.log('DELIVERY ESTIMATES');
  console.log('='.repeat(60));

  try {
    const delivery = await productService.getExpectedDeliveryDateRequest()
      .setProductId('PRD-HKSRILFY') // Perfect Bound Booklets
      .setServiceLevel('Standard')
      .setArtworkService('Just Print')
      .setProductionData({
        'Size': 'A5 Portrait',
        'Print Process': 'Digital',
        'Cover Material': '250gsm Art Paper Silk Finish',
        'Paper Type': '130gsm Art Paper Silk Finish',
        'Lamination': 'None',
      })
      .setQuantity(50)
      .setDeliveryAddressPostcode('G1 1AA') // Glasgow
      .execute();

    console.log('\nA5 Booklet, 50 copies, Standard, Glasgow:');
    console.log(JSON.stringify(delivery, null, 2));
  } catch (err: any) {
    console.log(`Delivery estimate error: ${err.errorMessage || err.message || err}`);
  }

  try {
    const delivery2 = await productService.getExpectedDeliveryDateRequest()
      .setProductId('PRD-WLPVQMTE') // Flyers
      .setServiceLevel('Standard')
      .setArtworkService('Just Print')
      .setProductionData({
        'Size': 'A6',
        'Sides Printed': 'Double Sided',
        'Paper Type': '300gsm Art Board Coated',
        'Lamination': 'None',
        'Sets': '1',
      })
      .setQuantity(200)
      .setDeliveryAddressPostcode('G1 1AA')
      .execute();

    console.log('\nA6 Flyers (Prize Cards), 200 copies, Standard, Glasgow:');
    console.log(JSON.stringify(delivery2, null, 2));
  } catch (err: any) {
    console.log(`Delivery estimate error: ${err.errorMessage || err.message || err}`);
  }
}

main().catch(console.error);
