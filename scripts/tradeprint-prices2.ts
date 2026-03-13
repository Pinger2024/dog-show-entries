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

  // Price list with CSV format (the SDK only supports setFormatCsv, not setFormatJson)
  const queries = [
    'Perfect Bound Booklets',
    'Flyers',
    'Long Run Posters',
  ];

  for (const name of queries) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`PRICES: "${name}" (0% markup = trade cost)`);
    console.log('='.repeat(60));
    try {
      const response = await productService
        .priceListSingleProductRequest(name)
        .setMarkup(0)
        .setFormatCsv()
        .execute();

      // CSV data - show first 3000 chars
      const str = typeof response === 'string' ? response : JSON.stringify(response, null, 2);
      console.log(str.substring(0, 3000));
      if (str.length > 3000) console.log(`\n... (${str.length} total chars)`);
    } catch (err: any) {
      console.log(`Error: ${err.errorMessage || err.message || err}`);
    }
  }

  // Try delivery estimate for booklet with different params
  // The issue may be that "quantity" needs to match an available quantity
  console.log('\n\n=== DELIVERY ESTIMATES ===\n');

  // Try booklet with Saver service level and larger quantity
  const configs = [
    {
      label: 'A5 Booklet 100 copies Saver',
      productId: 'PRD-HKSRILFY',
      serviceLevel: 'Saver',
      data: {
        'Size': 'A5 Portrait',
        'Print Process': 'Digital',
        'Cover Material': '250gsm Art Paper Silk Finish',
        'Paper Type': '130gsm Art Paper Silk Finish',
        'Lamination': 'None',
        'Custom Size': 'N/A',
      },
      quantity: 100,
    },
    {
      label: 'A5 Booklet 250 copies Standard',
      productId: 'PRD-HKSRILFY',
      serviceLevel: 'Standard',
      data: {
        'Size': 'A5 Portrait',
        'Print Process': 'Digital',
        'Cover Material': '250gsm Art Paper Silk Finish',
        'Paper Type': '130gsm Art Paper Silk Finish',
        'Lamination': 'None',
        'Custom Size': 'N/A',
      },
      quantity: 250,
    },
    {
      label: 'A6 Flyers 100 Standard (prize cards)',
      productId: 'PRD-WLPVQMTE',
      serviceLevel: 'Standard',
      data: {
        'Size': 'A6',
        'Sides Printed': 'Double Sided',
        'Paper Type': '300gsm Art Board Coated',
        'Lamination': 'None',
        'Sets': '1',
      },
      quantity: 100,
    },
    {
      label: 'A6 Flyers 500 Saver (prize cards)',
      productId: 'PRD-WLPVQMTE',
      serviceLevel: 'Saver',
      data: {
        'Size': 'A6',
        'Sides Printed': 'Double Sided',
        'Paper Type': '300gsm Art Board Coated',
        'Lamination': 'None',
        'Sets': '1',
      },
      quantity: 500,
    },
    {
      label: 'A3 Poster 10 copies Standard (ring board)',
      productId: 'PRD-KAZOQNCF',
      serviceLevel: 'Standard',
      data: {
        'Size': 'A3',
        'Paper Type': '170gsm Art Paper Silk Finish',
        'Sets': '1',
      },
      quantity: 10,
    },
  ];

  for (const cfg of configs) {
    try {
      const response = await productService.getExpectedDeliveryDateRequest()
        .setProductId(cfg.productId)
        .setServiceLevel(cfg.serviceLevel)
        .setArtworkService('Just Print')
        .setProductionData(cfg.data)
        .setQuantity(cfg.quantity)
        .setDeliveryAddressPostcode('G75 8TL') // Amanda's area
        .execute();
      console.log(`${cfg.label}: ${response.formattedDate}`);
    } catch (err: any) {
      const msg = err.errorMessage || err.message || '';
      console.log(`${cfg.label}: ERROR - ${msg.substring(0, 200)}`);
    }
  }

  // Now try a validate order to see what fields are needed
  console.log('\n\n=== VALIDATE ORDER TEST ===\n');
  const orderService = new SDK.OrderService();
  try {
    const request = orderService.validateOrderRequest()
      .setOrderReference('REMI_TEST_001')
      .setCurrency('GBP')
      .setBillingAddress({
        firstName: 'Michael',
        lastName: 'James',
        streetName: '1 Test Street',
        postalCode: 'G75 8TL',
        city: 'Glasgow',
        country: 'GB',
        email: 'michael@prometheus-it.com',
        phone: '07777777777',
      });

    request.addOrderItem()
      .addFileUrl('https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf')
      .setArtworkService('Just Print')
      .setServiceLevel('Standard')
      .setProductId('PRD-WLPVQMTE') // Flyers
      .setQuantity(200)
      .setProductionData({
        'Size': 'A6',
        'Sides Printed': 'Double Sided',
        'Paper Type': '300gsm Art Board Coated',
        'Lamination': 'None',
        'Sets': '1',
      })
      .setDeliveryAddress({
        firstName: 'Michael',
        lastName: 'James',
        add1: '1 Test Street',
        town: 'Glasgow',
        postcode: 'G75 8TL',
        country: 'GB',
        contactPhone: '07777777777',
      });

    const response = await request.execute();
    console.log('Validation result:', JSON.stringify(response, null, 2));
  } catch (err: any) {
    console.log(`Validation error: ${err.errorMessage || err.message || JSON.stringify(err)}`);
  }
}

main().catch(console.error);
