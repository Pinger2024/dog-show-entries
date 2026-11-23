/**
 * Render Amanda's Midland Regional SV catalogue from demo data so we
 * can spot-check the new SV cover, health-test line, and Results /
 * Grading stub blocks. Outputs to /tmp/midland-catalogue-preview.pdf.
 */
import 'dotenv/config';
import { writeFileSync } from 'fs';
import { generateCataloguePdf } from '../src/server/services/pdf-generation';

const SHOW_ID = '177dcae5-2875-4fed-9ad7-a30c6b45199c';

async function main() {
  const buf = await generateCataloguePdf(SHOW_ID, 'by-class');
  const out = '/tmp/midland-catalogue-preview.pdf';
  writeFileSync(out, buf);
  console.log(`✅ Wrote ${out} (${buf.length.toLocaleString()} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
