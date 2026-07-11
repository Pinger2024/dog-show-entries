/** One-off verification: render the heavyweight PDFs against real show data
 *  and report page counts, so before/after page-count parity can be checked.
 *  Usage: npx tsx --tsconfig tsconfig.json scripts/render-sample-pdfs.ts <outDir> <showId> [showId2...]
 */
import { writeFileSync } from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import {
  generateCataloguePdf,
  generatePrizeCardsPdf,
  generateRingBoardPdf,
} from '@/server/services/pdf-generation';

async function pages(buf: Buffer): Promise<number> {
  return (await PDFDocument.load(buf)).getPageCount();
}

async function main() {
  const [outDir, ...showIds] = process.argv.slice(2);
  for (const showId of showIds) {
    const short = showId.slice(0, 8);
    for (const [name, fn] of [
      ['catalogue-standard', () => generateCataloguePdf(showId, 'standard')],
      ['catalogue-by-class', () => generateCataloguePdf(showId, 'by-class')],
      ['prize-cards', () => generatePrizeCardsPdf(showId)],
      ['ring-board', () => generateRingBoardPdf(showId)],
    ] as const) {
      try {
        const buf = await fn();
        const n = await pages(buf);
        writeFileSync(path.join(outDir, `${short}-${name}.pdf`), buf);
        console.log(`${short} ${name}: ${n} pages, ${buf.length} bytes`);
      } catch (e) {
        console.log(`${short} ${name}: ERROR ${(e as Error).message.slice(0, 120)}`);
      }
    }
  }
  process.exit(0);
}
main();
