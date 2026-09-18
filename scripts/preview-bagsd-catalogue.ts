/**
 * Generate a preview BAGSD catalogue PDF from live data so Amanda can
 * see the updated joint-owner / title-case rendering before print.
 *
 *   npx tsx scripts/preview-bagsd-catalogue.ts
 *
 * Output: /tmp/bagsd-catalogue-preview.pdf
 */
import 'dotenv/config';
import { writeFileSync } from 'fs';
import { generateCataloguePdf } from '../src/server/services/pdf-generation';

const SHOW_ID = '1b936b64-e391-4d32-86f4-5e54b02fb0aa';

async function main() {
  const buffer = await generateCataloguePdf(SHOW_ID, 'standard');
  const out = '/tmp/bagsd-catalogue-preview.pdf';
  writeFileSync(out, buffer);
  console.log(`✅ Wrote ${out} (${buffer.length.toLocaleString()} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
