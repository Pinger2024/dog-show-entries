import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseCritiqueDocument, type ClassListEntry } from '@/lib/critique-parse';
import { matchCritiqueBlocks, type ResultsGraphShowClass } from '@/lib/critique-match';
import { publishGateStatus } from '@/lib/critique-publish-gate';
import { NE_CHAMP_2026_PLACINGS, neClassId, neEntryClassId } from './fixtures/ne-champ-2026-placings';

// The judge's numbered document against the placings the steward recorded —
// the catalogue number is unique per show, so it is a stronger key than a
// name ever was. See critique-parse-numbered-layout.test.ts for the layout.

const FIXTURE_TEXT = readFileSync(
  join(__dirname, 'fixtures', 'judge-critiques-numbered-layout-ne-2026.txt'),
  'utf8',
);

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

function neResultsGraph(overridePlacement: Record<string, number> = {}): ResultsGraphShowClass[] {
  return NE_CHAMP_2026_PLACINGS.map((c) => ({
    showClassId: neClassId(c.className, c.sex),
    className: c.className,
    sex: c.sex === 'bitch' ? 'bitch' : 'dog',
    entries: c.placed.map(([placement, cat]) => ({
      entryClassId: neEntryClassId(cat),
      placement: overridePlacement[cat] ?? placement,
      catalogueNumber: cat,
      registeredName: `Registered Name Of Dog ${cat}`,
      existingCritiqueText: null,
    })),
  }));
}

describe('matchCritiqueBlocks — by catalogue number (North Eastern 2026, real document and placings)', () => {
  const parsed = parseCritiqueDocument(FIXTURE_TEXT, neClassList());
  const { blocks } = matchCritiqueBlocks(parsed, neResultsGraph());
  const critiques = blocks.filter((b) => b.kind === 'critique');
  const byNumber = (n: string, which = 0) => critiques.filter((b) => b.catalogueNumberRaw === n)[which]!;

  it('gives every one of the 58 critiques a dog, 57 of them exact', () => {
    expect(critiques).toHaveLength(58);
    expect(critiques.filter((b) => b.matchedEntryClassId !== null)).toHaveLength(58);
    expect(critiques.filter((b) => b.confidence === 'exact')).toHaveLength(57);
    expect(critiques.filter((b) => b.confidence === 'check')).toHaveLength(1);
  });

  it('attaches each critique to the entry with that catalogue number, not to a name it never had', () => {
    expect(byNumber('14').matchedEntryClassId).toBe(neEntryClassId('14'));
    expect(byNumber('14').confidence).toBe('exact');
    expect(byNumber('36').matchedEntryClassId).toBe(neEntryClassId('36'));
    expect(byNumber('36').confidence).toBe('exact');
    // Veteran's fourth dog: a number but no placing on the heading — still exact.
    expect(byNumber('4').matchedEntryClassId).toBe(neEntryClassId('4'));
    expect(byNumber('4').confidence).toBe('exact');
    expect(byNumber('4').hints).toEqual([]);
  });

  it('the slip — "24." under Special Long Coat Open (Dogs) — lands on No. 24 for checking, and says why', () => {
    const slip = byNumber('24', 1);
    expect(slip.matchedEntryClassId).toBe(neEntryClassId('24'));
    expect(slip.confidence).toBe('check');
    expect(slip.hints.join(' ')).toMatch(/No\. 24 .*Limit Dog/);
    expect(slip.hints.join(' ')).toMatch(/Special Long Coat Open Dog/);
    // The real No. 24 critique, under Limit (Dogs), is untouched.
    expect(byNumber('24', 0).confidence).toBe('exact');
  });

  it('two critiques pointing at one dog block publishing — both of them — until one is moved', () => {
    const gate = publishGateStatus(blocks);
    expect(gate.canPublish).toBe(false);
    const limitIdx = blocks.indexOf(byNumber('24', 0));
    const slipIdx = blocks.indexOf(byNumber('24', 1));
    expect(gate.blockingIndexes).toEqual([limitIdx, slipIdx]);

    const moved = blocks.map((b, i) =>
      i === slipIdx ? { ...b, matchedEntryClassId: neEntryClassId('26'), confidence: 'exact' as const } : b,
    );
    const after = publishGateStatus(moved);
    expect(after.canPublish).toBe(true);
    expect(after.blockingIndexes).toEqual([]);
  });
});

describe('matchCritiqueBlocks — catalogue numbers, shapes the real document does not exercise', () => {
  const classList: ClassListEntry[] = [
    { showClassId: 'mp-dog', className: 'Minor Puppy', sex: 'dog' },
    { showClassId: 'mp-bitch', className: 'Minor Puppy', sex: 'bitch' },
    { showClassId: 'open-dog', className: 'Open', sex: 'dog' },
    { showClassId: 'open-bitch', className: 'Open', sex: 'bitch' },
  ];
  const graph = (): ResultsGraphShowClass[] => [
    {
      showClassId: 'mp-dog', className: 'Minor Puppy', sex: 'dog',
      entries: [
        { entryClassId: 'ec-5', placement: 1, catalogueNumber: '5', registeredName: 'Dog Five', existingCritiqueText: null },
      ],
    },
    {
      showClassId: 'mp-bitch', className: 'Minor Puppy', sex: 'bitch',
      entries: [
        { entryClassId: 'ec-33', placement: 1, catalogueNumber: '33', registeredName: 'Bitch Thirty Three', existingCritiqueText: null },
        { entryClassId: 'ec-32', placement: 2, catalogueNumber: '32', registeredName: 'Bitch Thirty Two', existingCritiqueText: null },
      ],
    },
    {
      showClassId: 'open-dog', className: 'Open', sex: 'dog',
      entries: [
        { entryClassId: 'ec-28', placement: 1, catalogueNumber: '28', registeredName: 'Dog Twenty Eight', existingCritiqueText: null },
        { entryClassId: 'ec-30', placement: 2, catalogueNumber: '30', registeredName: 'Dog Thirty', existingCritiqueText: null },
      ],
    },
    {
      showClassId: 'open-bitch', className: 'Open', sex: 'bitch',
      entries: [
        // No. 30 was entered in Open Dog AND (as a steward's slip, or a dog
        // in two classes) placed here too.
        { entryClassId: 'ec-30b', placement: 1, catalogueNumber: '30', registeredName: 'Dog Thirty', existingCritiqueText: null },
      ],
    },
  ];
  const run = (text: string, g = graph()) =>
    matchCritiqueBlocks(parseCritiqueDocument(text, classList), g).blocks.filter((b) => b.kind === 'critique');

  it("when the judge's bracketed order disagrees with the steward's placing, the critique is flagged with both", () => {
    const [b28, b30] = run(['Open (Dogs) (30-28)', '28. Large dog.', '30. Medium dog.'].join('\n'));
    expect(b28.matchedEntryClassId).toBe('ec-28');
    expect(b28.confidence).toBe('check');
    expect(b28.hints.join(' ')).toMatch(/judge.*2nd/i);
    expect(b28.hints.join(' ')).toMatch(/1st/);
    expect(b30.confidence).toBe('check');
  });

  it('a sexless heading that the parser guessed as the dog class is corrected by the numbers', () => {
    const [b33, b32] = run(['Minor Puppy (33-32)', '33. First bitch.', '32. Second bitch.'].join('\n'));
    expect(b33.matchedEntryClassId).toBe('ec-33');
    expect(b33.confidence).toBe('exact');
    expect(b32.matchedEntryClassId).toBe('ec-32');
    expect(b32.confidence).toBe('exact');
  });

  it('a number nobody was placed under is left for the secretary, and the hint says so', () => {
    const [b99] = run(['Open (Dogs) (28-30)', '99. Mystery dog.'].join('\n'));
    expect(b99.matchedEntryClassId).toBeNull();
    expect(b99.confidence).toBe('unmatched');
    expect(b99.hints.join(' ')).toMatch(/No dog numbered 99/);
  });

  it('a number placed in two classes with no heading to choose between them is left for the secretary', () => {
    const [b30] = run('30. Which class?');
    expect(b30.matchedEntryClassId).toBeNull();
    expect(b30.confidence).toBe('unmatched');
    expect(b30.hints.join(' ')).toMatch(/Open Dog/);
    expect(b30.hints.join(' ')).toMatch(/Open Bitch/);
  });

  it('the heading settles a number placed in two classes', () => {
    const [b30] = run(['Open (Bitches)', '30. The bitch-class one.'].join('\n'));
    expect(b30.matchedEntryClassId).toBe('ec-30b');
    expect(b30.confidence).toBe('exact');
  });

  it('with no heading at all, a unique number is enough', () => {
    const [b5] = run('5. Lovely puppy.');
    expect(b5.matchedEntryClassId).toBe('ec-5');
    expect(b5.confidence).toBe('exact');
  });

  it('a block without a number still matches by class and placing, exactly as before', () => {
    const [b] = run(['Open Dog', '1st, Owner – Dog Twenty Eight', 'Prose.'].join('\n'));
    expect(b.catalogueNumberRaw).toBeNull();
    expect(b.matchedEntryClassId).toBe('ec-28');
    expect(b.confidence).toBe('exact');
  });
});
