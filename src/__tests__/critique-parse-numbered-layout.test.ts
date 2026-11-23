import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseCritiqueDocument, parseCatalogueLine, type ClassListEntry, type ParsedBlock } from '@/lib/critique-parse';
import { NE_CHAMP_2026_PLACINGS, neClassId } from './fixtures/ne-champ-2026-placings';

// Mandy, 30 Oct 2026 (Telegram 8131/8134): the North Eastern championship
// judge wrote his critiques by CATALOGUE NUMBER — a class heading carrying
// the placing order in brackets, "Yearling (Dogs) (17-16-14-15)", then one
// line per dog, "14. Large expressive elongated dog…". Remi recognised none
// of it: the whole document became the judge's "opening remarks" and was
// published that way. This is his real Word document, text extracted the
// way the upload route does it (mammoth), and the real class list.

const FIXTURE_TEXT = readFileSync(
  join(__dirname, 'fixtures', 'judge-critiques-numbered-layout-ne-2026.txt'),
  'utf8',
);

/** The class list exactly as toClassList() would shape it for this show —
 *  a mixed/JH class (sex null) registers under both sexes. */
function neClassList(): ClassListEntry[] {
  const out: ClassListEntry[] = [];
  for (const c of NE_CHAMP_2026_PLACINGS) {
    const id = neClassId(c.className, c.sex);
    if (c.sex) out.push({ showClassId: id, className: c.className, sex: c.sex });
    else {
      out.push({ showClassId: id, className: c.className, sex: 'dog' });
      out.push({ showClassId: id, className: c.className, sex: 'bitch' });
    }
  }
  return out;
}

const { blocks } = parseCritiqueDocument(FIXTURE_TEXT, neClassList());
const critiques = blocks.filter((b) => b.kind === 'critique');

/** The nth block carrying this catalogue number (the document repeats "24." once). */
function byNumber(n: string, which = 0): ParsedBlock {
  const found = critiques.filter((b) => b.catalogueNumberRaw === n);
  const b = found[which];
  if (!b) throw new Error(`no critique block numbered ${n} (#${which}); have ${found.length}`);
  return b;
}

describe('parseCritiqueDocument — the numbered layout (North Eastern 2026, real document)', () => {
  it('reads the three lines before the first heading as the opening remarks, and nothing else', () => {
    expect(blocks[0].kind).toBe('overview');
    expect(blocks[0].critiqueText).toContain('North Eastern GSD Club Championship Show 2026');
    expect(blocks[0].critiqueText).toContain('great honor');
    expect(blocks[0].critiqueText).toContain("Judge's Critiques");
    expect(blocks.filter((b) => b.kind === 'overview')).toHaveLength(1);
  });

  it('recognises all 19 class headings — none falls through as unmatched text', () => {
    expect(blocks.filter((b) => b.kind === 'unmatched')).toEqual([]);
    const classes = new Set(critiques.map((b) => b.matchedShowClassId));
    expect(classes.has(null)).toBe(false);
    expect(classes.size).toBe(19);
  });

  it('finds all 58 critiques, each carrying its catalogue number and no dog name', () => {
    expect(critiques).toHaveLength(58);
    for (const b of critiques) {
      expect(b.catalogueNumberRaw).toMatch(/^\d+$/);
      expect(b.dogRaw).toBeNull();
      expect(b.ownersRaw).toBeNull();
      expect(b.critiqueText.length).toBeGreaterThan(40);
    }
  });

  it('keeps the critique prose that shares the line with the number', () => {
    const five = byNumber('5');
    expect(five.critiqueText.startsWith('Good size, good type, good expression')).toBe(true);
    expect(five.critiqueText.endsWith('back should be firmer.')).toBe(true);
  });

  it('takes the placing from the bracketed order on the heading', () => {
    // Yearling (Dogs) (17-16-14-15)
    expect(byNumber('17').position).toBe(1);
    expect(byNumber('16').position).toBe(2);
    expect(byNumber('14').position).toBe(3);
    expect(byNumber('15').position).toBe(4);
    expect(byNumber('14').matchedShowClassId).toBe(neClassId('Yearling', 'dog'));
    expect(byNumber('14').classNameRaw).toBe('Yearling (Dogs) (17-16-14-15)');
    // Veteran (1-3-2): the judge listed three placings and wrote four critiques.
    expect(byNumber('1').position).toBe(1);
    expect(byNumber('3').position).toBe(2);
    expect(byNumber('2').position).toBe(3);
    expect(byNumber('4').position).toBeNull();
    expect(byNumber('4').matchedShowClassId).toBe(neClassId('Veteran', null));
  });

  it('reads "(Dogs)" / "(Bitches)" and the plural class names the judge used', () => {
    expect(byNumber('8').matchedShowClassId).toBe(neClassId('Puppy', 'dog')); // Puppy (Dogs)
    expect(byNumber('11').matchedShowClassId).toBe(neClassId('Junior', 'dog')); // Juniors (Dogs)
    expect(byNumber('22').matchedShowClassId).toBe(neClassId('Limit', 'dog')); // Limits (Dogs)
    expect(byNumber('22').position).toBe(2);
    expect(byNumber('32').matchedShowClassId).toBe(neClassId('Minor Puppy', 'bitch')); // Minor Puppy (Bitches)
    expect(byNumber('44').matchedShowClassId).toBe(neClassId('Special Long Coat Junior', 'bitch'));
    expect(byNumber('69').matchedShowClassId).toBe(neClassId('Special Long Coat Open', 'bitch'));
    expect(byNumber('69').position).toBe(5);
    expect(byNumber('80').matchedShowClassId).toBe(neClassId('Open', 'bitch'));
    expect(byNumber('80').position).toBe(5);
  });

  it('a heading with no sex word ("Minor Puppy (5-7)") still lands on a Minor Puppy class', () => {
    expect(byNumber('5').matchedShowClassId).toMatch(/^minor-puppy-/);
    expect(byNumber('5').position).toBe(1);
    expect(byNumber('7').position).toBe(2);
  });

  it("keeps the judge's slip — a second \"24.\" under Special Long Coat Open (Dogs) — as its own block, with no placing", () => {
    const limit24 = byNumber('24', 0);
    const slip24 = byNumber('24', 1);
    expect(limit24.matchedShowClassId).toBe(neClassId('Limit', 'dog'));
    expect(limit24.position).toBe(3);
    expect(slip24.matchedShowClassId).toBe(neClassId('Special Long Coat Open', 'dog'));
    expect(slip24.position).toBeNull();
    expect(slip24.critiqueText.startsWith('Large powerful dog, expressive with good proportions')).toBe(true);
  });
});

describe('parseCritiqueDocument — numbered layout, shapes the real document does not exercise', () => {
  const classList: ClassListEntry[] = [
    { showClassId: 'mp-dog', className: 'Minor Puppy', sex: 'dog' },
    { showClassId: 'mp-bitch', className: 'Minor Puppy', sex: 'bitch' },
    { showClassId: 'open-dog', className: 'Open', sex: 'dog' },
    { showClassId: 'open-bitch', className: 'Open', sex: 'bitch' },
  ];

  it('a sexless heading inside the bitch half takes the bitch class, as a named heading would', () => {
    const text = ['Open (Bitches) (75)', '75. Lovely bitch.', 'Minor Puppy (33-32)', '33. First.', '32. Second.'].join('\n');
    const { blocks } = parseCritiqueDocument(text, classList);
    const b33 = blocks.find((b) => b.catalogueNumberRaw === '33')!;
    expect(b33.matchedShowClassId).toBe('mp-bitch');
    expect(b33.position).toBe(1);
  });

  it('prose that starts with a bare number is never a critique boundary', () => {
    const text = ['Open (Dogs) (28-30)', '28. Large dog.', '2 year old male, good bone.', '30. Medium dog.'].join('\n');
    const { blocks } = parseCritiqueDocument(text, classList);
    const critiques = blocks.filter((b) => b.kind === 'critique');
    expect(critiques.map((b) => b.catalogueNumberRaw)).toEqual(['28', '30']);
    expect(critiques[0].critiqueText).toBe('Large dog. 2 year old male, good bone.');
  });

  it('a number followed by a bracket, colon or dash is the same thing as a full stop', () => {
    const text = ['Open (Dogs)', '28) Large dog.', '30 – Medium dog.', '31: Small dog.'].join('\n');
    const { blocks } = parseCritiqueDocument(text, classList);
    const critiques = blocks.filter((b) => b.kind === 'critique');
    expect(critiques.map((b) => b.catalogueNumberRaw)).toEqual(['28', '30', '31']);
    expect(critiques.map((b) => b.position)).toEqual([null, null, null]);
  });

  it('numbered critiques before any heading still become blocks instead of opening remarks', () => {
    const text = ['Thanks to the committee.', '28. Large dog.', '30. Medium dog.'].join('\n');
    const { blocks } = parseCritiqueDocument(text, classList);
    expect(blocks[0].kind).toBe('overview');
    expect(blocks[0].critiqueText).toBe('Thanks to the committee.');
    expect(blocks.filter((b) => b.kind === 'critique').map((b) => b.catalogueNumberRaw)).toEqual(['28', '30']);
  });

  it('a heading Remi cannot place keeps its numbered critiques, with no class, for the matcher to find by number', () => {
    const text = ['Oepn (Dogs) (28-30)', '28. Large dog.', '30. Medium dog.'].join('\n');
    const { blocks } = parseCritiqueDocument(text, classList);
    const header = blocks.find((b) => b.kind === 'unmatched')!;
    expect(header.classNameRaw).toBe('Oepn (Dogs) (28-30)');
    const critiques = blocks.filter((b) => b.kind === 'critique');
    expect(critiques.map((b) => b.catalogueNumberRaw)).toEqual(['28', '30']);
    expect(critiques.every((b) => b.matchedShowClassId === null)).toBe(true);
  });

  it('the other two layouts are untouched: an ordinal line is never read as a catalogue number', () => {
    expect(parseCatalogueLine('1st. Fryer\'s, Kymrigkita Kevson, bn 15.4.25 by X ex Y.')).toBeNull();
    expect(parseCatalogueLine('1st, KEARNAN & WILSON – CLYNALWIN\'S NUKON VW')).toBeNull();
    expect(parseCatalogueLine('2 year old male')).toBeNull();
    expect(parseCatalogueLine('12.5 cm shorter than ideal')).toBeNull();
    expect(parseCatalogueLine('14. Large expressive dog.')).toEqual({ catalogueNumber: '14', rest: 'Large expressive dog.' });
  });
});
