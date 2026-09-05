/**
 * Render a catalogue with booklet padding applied and dump the
 * last few pages as PNGs so we can eyeball the Notes pages.
 *
 *   npx tsx scripts/verify-notes-padding.ts
 */
import 'dotenv/config';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { generateCataloguePdf } from '@/server/services/pdf-generation';
import { padPdfToMultiple } from '@/lib/pdf-pad';

// Pick a mid-sized real show so there's at least one padding page
const SHOW_ID = '417410f2-6360-4af1-9dec-86936171276f'; // Clyde Valley 117

async function main() {
  const outDir = '/tmp/cat-notes-padding';
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const raw = await generateCataloguePdf(SHOW_ID, 'standard');
  const padded = Buffer.from(await padPdfToMultiple(raw, 4));
  const pdfPath = `${outDir}/standard-padded.pdf`;
  writeFileSync(pdfPath, padded);

  const info = execFileSync('pdfinfo', [pdfPath]).toString();
  const pages = Number(info.match(/Pages:\s+(\d+)/)?.[1] ?? 0);
  const rawInfo = (() => {
    const rawPath = `${outDir}/standard-raw.pdf`;
    writeFileSync(rawPath, raw);
    return execFileSync('pdfinfo', [rawPath]).toString();
  })();
  const rawPages = Number(rawInfo.match(/Pages:\s+(\d+)/)?.[1] ?? 0);

  console.log(`Raw:    ${rawPages} pages`);
  console.log(`Padded: ${pages} pages (+${pages - rawPages} notes pages)`);

  // Render the last 4 pages so we see all padding in context
  const firstPage = Math.max(1, pages - 3);
  execFileSync('pdftoppm', [
    pdfPath, `${outDir}/padded`,
    '-png', '-r', '100',
    '-f', String(firstPage), '-l', String(pages),
  ]);
  console.log(`PNGs: ${outDir}/padded-*.png (pages ${firstPage}-${pages})`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
