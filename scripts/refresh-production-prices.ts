import 'dotenv/config';

// Override Tradeprint creds with production values
process.env.TRADEPRINT_API_USERNAME = 'prometheusit';
process.env.TRADEPRINT_API_PASSWORD = 'mydf3r7cidsfdg7d6pekig0z';
process.env.TRADEPRINT_ENVIRONMENT = 'production';

import { refreshAllPrintPrices } from '../src/server/services/print-price-refresh';

async function main() {
  const result = await refreshAllPrintPrices();
  console.log('Done:', JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
