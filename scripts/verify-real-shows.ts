/**
 * Render real shows (both formats) via the canonical
 * generateCataloguePdf pipeline so we verify with the SAME code path the
 * live API uses. Produces PNGs of the first 6 pages of each render
 * under /tmp/cat-real-<label>-<format>-<n>.png so we can spot-check
 * visually without downloading PDFs.
 *
 * Usage:  npx tsx scripts/verify-real-shows.ts
 */
import 'dotenv/config';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { generateCataloguePdf } from '@/server/services/pdf-generation';

// Representative shows covering the range Amanda asked for:
//   - small (<100 entries)
//   - medium-large (188 entries — her current Clyde Valley test show)
//   - mix of content states (judges bios, sponsors, etc.)
const SHOWS: { id: string; label: string }[] = [
  { id: 'f402ccbc-6616-4ed4-b43f-996ef9e7f4c9', label: 'small-82' },
  { id: 'b4837941-8458-4ce3-a389-3fef11d01744', label: 'small-90' },
  { id: '417410f2-6360-4af1-9dec-86936171276f', label: 'mid-117-clyde-valley' },
  { id: '1ebcedae-ea58-4638-b86c-f3663821f088', label: 'large-187' },
];

async function run(showId: string, label: string) {
  const outDir = `/tmp/cat-real-${label}`;
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  console.log(`\n=== ${label} (${showId}) ===`);
  for (const fmt of ['standard', 'by-class'] as const) {
    try {
      const t0 = Date.now();
      const buf = await generateCataloguePdf(showId, fmt);
      const elapsed = Date.now() - t0;
      const pdfPath = `${outDir}/${fmt}.pdf`;
      writeFileSync(pdfPath, buf);
      const info = execFileSync('pdfinfo', [pdfPath]).toString();
      const pages = Number(info.match(/Pages:\s+(\d+)/)?.[1] ?? 0);
      console.log(`  ${fmt.padEnd(10)} → ${String(pages).padStart(3)} pp  ${String(Math.round(buf.length / 1024)).padStart(4)} KB  ${elapsed}ms`);
      // First 6 pages so we catch cover + front matter + body transition
      execFileSync('pdftoppm', [pdfPath, `${outDir}/${fmt}`, '-png', '-r', '100', '-f', '1', '-l', '6']);
    } catch (err) {
      console.error(`  ${fmt} FAILED:`, (err as Error).message);
    }
  }
}

async function main() {
  for (const s of SHOWS) await run(s.id, s.label);
  console.log('\nDone — PNGs under /tmp/cat-real-*/');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
