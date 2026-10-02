/**
 * Render the catalogue across a matrix of content-fill configurations
 * so we catch layout regressions before Amanda does. Uses a synthesised
 * show so we can flip individual fields on/off without hunting for a
 * real show that happens to have exactly the right gap in its data.
 *
 * Usage:  npx tsx scripts/verify-catalogue-configs.ts
 * Outputs PDFs and per-page PNGs under /tmp/cat-verify-<config>/.
 */
import 'dotenv/config';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { CatalogueRingside } from '@/components/catalogue/catalogue-ringside';
import { CatalogueByClass } from '@/components/catalogue/catalogue-by-class';
import type { CatalogueEntry, CatalogueShowInfo } from '@/components/catalogue/catalogue-types';

const baseShow: CatalogueShowInfo = {
  name: 'Test German Shepherd Open Show',
  showType: 'open',
  date: '2026-08-01',
  organisation: 'Test GSD Club',
  venue: 'Test Country Park',
  venueAddress: 'Somewhere, UK',
  kcLicenceNo: '999/TST/000/TEST',
  classDefinitions: [
    { name: 'Minor Puppy Dog', description: 'For dogs of six and not exceeding nine calendar months.' },
    { name: 'Puppy Dog', description: 'For dogs of six and not exceeding twelve calendar months.' },
    { name: 'Junior Dog', description: 'For dogs of six and not exceeding eighteen calendar months.' },
    { name: 'Open Dog', description: 'For all dogs.' },
  ],
  showScope: 'single_breed',
} as CatalogueShowInfo;

// Tiny fake entry set so renders finish quickly — layout logic we care
// about is in the front matter, not the body volume.
const baseEntries: CatalogueEntry[] = Array.from({ length: 12 }, (_, i) => ({
  catalogueNumber: String(i + 1),
  dogName: `Test Dog ${i + 1}`,
  breed: 'German Shepherd Dog',
  breedId: 'gsd',
  group: 'Pastoral',
  sex: i % 2 === 0 ? 'dog' : 'bitch',
  dateOfBirth: new Date('2023-05-01'),
  kcRegNumber: 'AX0000000',
  colour: 'Black & Gold',
  sire: 'Test Sire',
  dam: 'Test Dam',
  breeder: 'Test Breeder',
  owners: [{ name: `Owner ${i + 1}`, address: 'UK' }],
  exhibitorId: null,
  handler: null,
  exhibitor: `Owner ${i + 1}`,
  classes: [{ name: 'Open Dog', sex: i % 2 === 0 ? 'dog' : 'bitch', classNumber: 4, sortOrder: 4, showClassId: 'c4' }],
  status: 'confirmed',
  entryType: 'standard',
  withholdFromPublication: false,
} as CatalogueEntry));

type Config = {
  name: string;
  mutate: (s: CatalogueShowInfo) => CatalogueShowInfo;
};

const CONFIGS: Config[] = [
  // Minimum fill — just the mandatory fields
  { name: '01-minimal', mutate: (s) => s },

  // Show Manager only (verifies cover renders it)
  { name: '02-show-manager', mutate: (s) => ({ ...s, showManager: 'Jane Smith' }) },

  // Best awards configured, but NO sponsors — verifies the new
  // single-column empty-sponsors layout
  {
    name: '03-awards-no-sponsors',
    mutate: (s) => ({
      ...s,
      bestAwards: ['Best of Breed', 'Best Opposite Sex', 'Best Puppy in Breed', 'Best Veteran'],
      awardSponsors: [],
    }),
  },

  // Best awards WITH sponsors — verifies 3-column table still works
  {
    name: '04-awards-with-sponsors',
    mutate: (s) => ({
      ...s,
      bestAwards: ['Best of Breed', 'Best Opposite Sex', 'Best Puppy in Breed'],
      awardSponsors: [
        { award: 'Best of Breed', sponsorName: 'Bertha Biscuits', trophyName: 'The Founders Cup' },
        { award: 'Best Puppy in Breed', sponsorName: 'Chunky Chews' },
      ],
    }),
  },

  // Show Information block full (welcomeNote, regulations, etc.)
  {
    name: '05-full-show-info',
    mutate: (s) => ({
      ...s,
      showManager: 'Jane Smith',
      welcomeNote: 'Welcome to our annual open show. We hope you enjoy your day and wish all competitors the best of luck.',
      awardsDescription: 'Rosettes to 5th place, trophies for Best of Breed and Best Opposite Sex.',
      catering: 'On-site refreshments available from 8:30 AM.',
      latestArrivalTime: '09:15',
      acceptsNfc: true,
      customStatements: ['Judged on the Group System', 'Dogs must be on leads at all times outside the ring.'],
    }),
  },

  // Everything filled — the kitchen-sink render
  {
    name: '06-everything',
    mutate: (s) => ({
      ...s,
      showManager: 'Jane Smith',
      onCallVet: 'Test Vet Group, Main Road, Testshire',
      secretaryName: 'Mandy McAteer',
      secretaryEmail: 'test@example.com',
      secretaryPhone: '01234 567890',
      welcomeNote: 'Welcome to our annual open show.',
      awardsDescription: 'Rosettes to 5th place.',
      catering: 'On-site refreshments.',
      latestArrivalTime: '09:15',
      acceptsNfc: true,
      bestAwards: ['Best of Breed', 'Best Opposite Sex', 'Best Puppy in Breed'],
      awardSponsors: [
        { award: 'Best of Breed', sponsorName: 'Bertha Biscuits', trophyName: 'The Founders Cup' },
      ],
      judgesByBreedName: { 'German Shepherd Dog': 'Mrs M Cowan' },
      judgeDisplayList: ['Dogs — Mrs M Cowan', 'Bitches — Mrs M Cowan'],
      judgeBios: { 'Mrs M Cowan': 'An experienced breed specialist with over twenty years judging German Shepherds at club and breed level, both at home and abroad.' },
      classSponsorships: [
        { className: 'Open Dog', classNumber: 4, sponsorName: 'Test Sponsor', trophyName: 'Open Dog Trophy' },
      ],
    }),
  },
];

async function verify(config: Config) {
  const show = config.mutate({ ...baseShow });
  const outDir = `/tmp/cat-verify-${config.name}`;
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  for (const fmt of ['ringside', 'by-class'] as const) {
    const Component = fmt === 'ringside' ? CatalogueRingside : CatalogueByClass;
    const pdfPath = `${outDir}/${fmt}.pdf`;
    try {
      const buf = Buffer.from(
        await renderToBuffer(React.createElement(Component, { show, entries: baseEntries })),
      );
      writeFileSync(pdfPath, buf);
      const info = execFileSync('pdfinfo', [pdfPath]).toString();
      const pages = Number(info.match(/Pages:\s+(\d+)/)?.[1] ?? 0);
      console.log(`  ${fmt.padEnd(10)} → ${String(pages).padStart(3)} pp  (${Math.round(buf.length / 1024)} KB)`);
      // Render first 3 pages as PNGs so we can skim them quickly
      execFileSync('pdftoppm', [pdfPath, `${outDir}/${fmt}`, '-png', '-r', '120', '-f', '1', '-l', '3']);
    } catch (err) {
      console.error(`  ${fmt} FAILED:`, (err as Error).message);
    }
  }
}

async function main() {
  for (const config of CONFIGS) {
    console.log(`\n=== ${config.name} ===`);
    await verify(config);
  }
  console.log('\nDone — inspect /tmp/cat-verify-*/ PNGs.');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
