/**
 * The judge's contract PDF never leaves a heading alone at the foot of a page.
 *
 * Found 15 Nov 2026 on the demo before Mandy's test: in the ordinary case (an
 * RKC open show, a one-line expenses note, no secretary's notes) "TERMS OF THIS
 * APPOINTMENT" was the last line of page 1 and everything it heads started on
 * page 2. Every heading in the contract had the same weakness: each sat in a
 * `minPresenceAhead` View inside a section wrapper View, and react-pdf ignores
 * `minPresenceAhead` there (see pdf-kit/flow.tsx).
 *
 * A heading only strands inside a window of page positions, so one fixture
 * proves nothing. The sweep pushes everything below the expenses down a line
 * at a time, using the expenses note (one short line per step), until each
 * heading has crossed a page boundary, and checks every render.
 *
 * DB-free: a straight render read back with poppler.
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { JudgeContractPdf, type JudgeContractPdfData } from '@/components/judge-contract/judge-contract-pdf';
import { judgeOfferTerms } from '@/lib/judge-offer-terms';
import { extractBBoxLayout } from '@/components/pdf-kit/__tests__/poppler';

/** Text with the spaces taken out: letter-spaced headings come back from
 *  poppler as one glyph per word. */
const squash = (s: string) => s.replace(/\s+/g, '');

function fixture(over: Partial<JudgeContractPdfData>, ruleset: 'rkc' | 'wusv' = 'rkc'): JudgeContractPdfData {
  return {
    societyName: 'GSD Club of Scotland',
    secretaryEmail: 'secretary@example.com',
    show: {
      name: 'GSD CLUB OF SCOTLAND Single Breed Open Show',
      startDate: new Date('2027-03-28'),
      showType: 'open',
      showRuleset: ruleset,
      venueName: 'Lanark Agricultural Centre',
      venuePostcode: 'ML11 9AX',
    },
    judge: { name: 'Ms A Swift', email: 'judge@example.com', kennelClubAffix: null, jepLevel: null },
    breedsAssigned: ['German Shepherd Dog'],
    breedLine: 'German Shepherd Dog',
    classificationLine: 'Dogs & Bitches',
    expenses: { hotelPence: 12000, travelPence: 8000, otherPence: null, notes: 'One night at the show hotel.' },
    terms: null,
    standardTerms:
      ruleset === 'rkc' ? judgeOfferTerms({ showType: 'open', showRuleset: 'rkc', breedNames: ['German Shepherd Dog'], judgeLivesOverseas: false }) : null,
    alreadyAgreed: ruleset === 'rkc' ? 'Clyde Valley GSD Club open show, 6 February 2027' : null,
    dates: { offerSentAt: new Date('2026-11-15T20:00:00Z'), acceptedAt: new Date('2026-11-15T20:05:00Z') },
    generatedAt: new Date('2026-11-15T20:05:00Z'),
    ...over,
  };
}

/** Each heading, and words from the start of what it heads. */
const HEADINGS: ReadonlyArray<{ heading: string; body: string }> = [
  { heading: 'SHOWDETAILS', body: 'Society' },
  { heading: 'JUDGE', body: 'Name' },
  { heading: 'APPOINTMENT', body: 'Breed:' },
  { heading: 'AGREEDEXPENSES', body: 'Hotel/accommodation' },
  { heading: 'TERMSOFTHISAPPOINTMENT', body: 'Inacceptingthisinvitation' },
  { heading: "TheSociety'sterms", body: '1.TheJudgeconfirms' }, // a numbered term reads "1. The Judge…"
  { heading: 'ADDITIONALTERMS', body: 'TheSocietywillprovide' },
  { heading: 'ACCEPTANCE', body: 'Byclicking' },
  // only a LONG answer puts the label on a line of its own (a short one is a
  // side-by-side row, which stays whole)
  { heading: 'Appointmentsalreadyagreed', body: 'Club1GSD' },
];

type Problem = string;

async function strandedHeadings(
  data: JudgeContractPdfData,
): Promise<{ problems: Problem[]; pages: number; seen: string[] }> {
  const buf = await renderToBuffer(React.createElement(JudgeContractPdf, { data }) as React.ReactElement<DocumentProps>);
  const pages = extractBBoxLayout(buf);
  const lines = pages.flatMap((p, page) => p.lines.map((l) => ({ page, text: squash(l.text) })));
  const problems: Problem[] = [];
  const seen: string[] = [];
  for (const { heading, body } of HEADINGS) {
    const h = lines.find((l) => l.text === squash(heading));
    if (!h) continue; // this contract has no such section
    seen.push(heading);
    const b = lines.find((l) => l.text.startsWith(body) && lines.indexOf(l) > lines.indexOf(h));
    if (!b) {
      problems.push(`${heading}: nothing found after it`);
      continue;
    }
    if (b.page !== h.page) problems.push(`${heading} on page ${h.page + 1}, its first line on page ${b.page + 1}`);
  }
  return { problems, pages: pages.length, seen };
}

/** 0..max extra one-line rows in the expenses note: everything after the
 *  expenses moves down a line per step. */
async function sweep(base: (notes: string) => JudgeContractPdfData, max: number) {
  const found: string[] = [];
  const pageCounts = new Set<number>();
  const seenAll = new Set<string>();
  for (let n = 0; n <= max; n++) {
    const notes = ['One night at the show hotel.', ...Array.from({ length: n }, (_, i) => `Mileage note ${i + 1}.`)].join('\n');
    const { problems, pages, seen } = await strandedHeadings(base(notes));
    pageCounts.add(pages);
    seen.forEach((h) => seenAll.add(h));
    for (const p of problems) found.push(`+${n} lines: ${p}`);
  }
  return { found, pageCounts, seen: [...seenAll] };
}

const SECRETARY_NOTES = Array.from({ length: 6 }, () => 'The Society will provide lunch and a steward for the day.').join(' ');

describe('judge contract PDF — no heading alone at the foot of a page', () => {
  it('the ordinary RKC open show contract: TERMS OF THIS APPOINTMENT starts on the same page as its text', async () => {
    const { problems, seen } = await strandedHeadings(fixture({}));
    // the check found every heading this contract has (a heading it cannot
    // find is never checked)
    expect(seen).toEqual(
      HEADINGS.map((h) => h.heading).filter((h) => h !== 'ADDITIONALTERMS' && h !== 'Appointmentsalreadyagreed'),
    );
    expect(problems).toEqual([]);
  });

  it('RKC open show, no secretary notes: every heading stays with its first line at every position', async () => {
    const { found, pageCounts } = await sweep(
      (notes) => fixture({ expenses: { hotelPence: 12000, travelPence: 8000, otherPence: null, notes } }),
      45,
    );
    expect(found).toEqual([]);
    // the sweep really did move the sections across a page boundary
    expect(pageCounts.size).toBeGreaterThan(1);
  }, 120_000);

  it('RKC open show with the secretary\'s notes: every heading stays with its first line at every position', async () => {
    const { found, pageCounts } = await sweep(
      (notes) => fixture({ terms: SECRETARY_NOTES, expenses: { hotelPence: 12000, travelPence: 8000, otherPence: 2500, notes } }),
      45,
    );
    expect(found).toEqual([]);
    expect(pageCounts.size).toBeGreaterThan(1);
  }, 120_000);

  it('a long answer and long secretary\'s notes: the heading or label keeps the first line, the rest flows on', async () => {
    const answer = Array.from({ length: 40 }, (_, i) => `Club ${i + 1} GSD open show, ${1 + (i % 27)} March 2027`).join('\n');
    const notes = Array.from({ length: 20 }, (_, i) => `The Society will provide item ${i + 1} on the day.`).join('\n');
    const { found, pageCounts, seen } = await sweep(
      (expenseNotes) => fixture({ alreadyAgreed: answer, terms: notes, expenses: { hotelPence: 12000, travelPence: 8000, otherPence: null, notes: expenseNotes } }),
      45,
    );
    expect(seen).toContain('Appointmentsalreadyagreed');
    expect(seen).toContain('ADDITIONALTERMS');
    expect(found).toEqual([]);
    expect(pageCounts.size).toBeGreaterThan(1);
  }, 120_000);

  it('a regional contract (no RKC terms): every heading stays with its first line at every position', async () => {
    const { found, pageCounts } = await sweep(
      (notes) => fixture({ terms: SECRETARY_NOTES, expenses: { hotelPence: 12000, travelPence: 8000, otherPence: null, notes } }, 'wusv'),
      45,
    );
    expect(found).toEqual([]);
    expect(pageCounts.size).toBeGreaterThan(1);
  }, 120_000);
});
