/**
 * Render a sample judge-contract PDF to scripts/output/judge-contract.pdf
 * for visual review. Uses fixture data so it doesn't touch the DB or R2.
 *
 *   npx tsx scripts/preview-judge-contract-pdf.ts
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { renderToBuffer } from '@react-pdf/renderer';
import {
  JudgeContractPdf,
  type JudgeContractPdfData,
} from '@/components/judge-contract/judge-contract-pdf';

const fixture: JudgeContractPdfData = {
  societyName: 'British Association for German Shepherd Dogs',
  secretaryEmail: 'mandy@hundarkgsd.co.uk',
  show: {
    name: 'BAGSD 18-Class Championship Show',
    startDate: new Date('2026-07-04'),
    showType: 'championship',
    venueName: 'Lanark Agricultural Centre',
    venuePostcode: 'ML11 9AX',
  },
  judge: {
    name: 'Mr Thomas Lindqvist',
    email: 'tlindqvist@example.se',
    kennelClubAffix: 'Norrlandskennel',
    jepLevel: 4,
  },
  breedsAssigned: ['German Shepherd Dog'],
  expenses: {
    hotelPence: 18000,
    travelPence: 42500,
    otherPence: 5000,
    notes:
      'Travel budget covers return flights from Stockholm plus mileage Edinburgh airport to venue. Accommodation at The Cartland Bridge Hotel for two nights (Fri/Sat).',
  },
  terms:
    'Judging fee waived. Assignment covers all 18 breed classes plus Best in Show line-up. Judge confirms eligibility to officiate under RKC F(1) Championship show regulations.',
  dates: {
    offerSentAt: new Date('2026-03-01T10:23:00Z'),
    acceptedAt: new Date('2026-03-03T19:07:00Z'),
  },
  generatedAt: new Date(),
};

async function main() {
  const outDir = join(process.cwd(), 'scripts', 'output');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'judge-contract.pdf');

  console.log('→ Rendering sample judge contract…');
  const buffer = await renderToBuffer(JudgeContractPdf({ data: fixture }));
  writeFileSync(outPath, buffer);
  console.log(`✓ Written to ${outPath} (${(buffer.length / 1024).toFixed(0)} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
