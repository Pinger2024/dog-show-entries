import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseCritiqueDocument, type ClassListEntry, type ParsedBlock } from '@/lib/critique-parse';
import { matchCritiqueBlocks, type ResultsGraphShowClass, type ResultsGraphEntry } from '@/lib/critique-match';

const FIXTURE_TEXT = readFileSync(
  join(__dirname, 'fixtures', 'judge-critiques-sample.txt'),
  'utf8'
);

const CLASS_BASES = [
  'Minor Puppy', 'Puppy', 'Junior', 'Yearling',
  'Post Graduate', 'Limit', 'Open', 'Veteran',
];

function gsdClassList(): ClassListEntry[] {
  const list: ClassListEntry[] = [];
  CLASS_BASES.forEach((className, idx) => {
    list.push({ showClassId: `sc-${idx}-dog`, className, sex: 'dog' });
    list.push({ showClassId: `sc-${idx}-bitch`, className, sex: 'bitch' });
  });
  return list;
}

const { blocks: parsedBlocks } = parseCritiqueDocument(FIXTURE_TEXT, gsdClassList());

function findBlock(classNameRaw: string, position: number): ParsedBlock {
  const b = parsedBlocks.find((b) => b.kind === 'critique' && b.classNameRaw === classNameRaw && b.position === position);
  if (!b) throw new Error(`no parsed critique found for ${classNameRaw} #${position}`);
  return b;
}

function keyFor(classNameRaw: string, position: number): string {
  const b = findBlock(classNameRaw, position);
  return `${b.matchedShowClassId}|${b.position}`;
}

/**
 * Builds a results graph that matches every parsed critique block exactly
 * by construction (registeredName = the block's own dogNameCleaned), so
 * individual tests only need to override the one or two rows they care
 * about (wrong name, missing row, conflicting steward text).
 */
function buildResultsGraph(
  overrides: Record<string, Partial<ResultsGraphEntry>> = {},
  excludeKeys: string[] = []
): ResultsGraphShowClass[] {
  const byShowClass = new Map<string, ResultsGraphShowClass>();
  let n = 0;
  for (const b of parsedBlocks) {
    if (b.kind !== 'critique' || !b.matchedShowClassId || b.position == null) continue;
    const key = `${b.matchedShowClassId}|${b.position}`;
    if (excludeKeys.includes(key)) continue;
    if (!byShowClass.has(b.matchedShowClassId)) {
      byShowClass.set(b.matchedShowClassId, {
        showClassId: b.matchedShowClassId,
        className: (b.classNameRaw ?? '').replace(/ (Dog|Bitch)$/, ''),
        sex: b.classNameRaw?.endsWith('Bitch') ? 'bitch' : 'dog',
        entries: [],
      });
    }
    n++;
    const override = overrides[key] ?? {};
    byShowClass.get(b.matchedShowClassId)!.entries.push({
      entryClassId: `ec-${n}`,
      placement: b.position,
      registeredName: override.registeredName ?? b.dogNameCleaned ?? '',
      existingCritiqueText: override.existingCritiqueText ?? null,
    });
  }
  return Array.from(byShowClass.values());
}

describe('matchCritiqueBlocks — primary match by class + placement (real fixture)', () => {
  const resultsGraph = buildResultsGraph();
  const { blocks } = matchCritiqueBlocks({ v: 1, blocks: parsedBlocks }, resultsGraph);
  const critiques = blocks.filter((b) => b.kind === 'critique');

  it('matches every one of the 27 critiques to an entryClassId with exact confidence', () => {
    expect(critiques).toHaveLength(27);
    for (const c of critiques) {
      expect(c.matchedEntryClassId, `${c.classNameRaw} #${c.position}`).not.toBeNull();
      expect(c.confidence, `${c.classNameRaw} #${c.position}`).toBe('exact');
    }
  });

  it('every block defaults to include:true and resolution:null', () => {
    for (const b of blocks) {
      expect(b.include).toBe(true);
      expect(b.resolution).toBeNull();
    }
  });
});

describe('matchCritiqueBlocks — name similarity confidence', () => {
  it('flags amber ("check") when the results-row name does not match the document name', () => {
    const key = keyFor('Veteran Dog', 1); // document name: CLYNALWIN'S NUKON
    const resultsGraph = buildResultsGraph({ [key]: { registeredName: 'COMPLETELY DIFFERENT DOG NAME' } });
    const { blocks } = matchCritiqueBlocks({ v: 1, blocks: parsedBlocks }, resultsGraph);
    const block = blocks.find((b) => b.classNameRaw === 'Veteran Dog' && b.position === 1)!;
    expect(block.matchedEntryClassId).not.toBeNull(); // still matched by class+placement
    expect(block.confidence).toBe('check');
  });

  it('trailing-space and case differences in the registered name still resolve to "exact"', () => {
    const key = keyFor('Post Graduate Dog', 1); // document name: SADIRA AYRTON WITH JASUETER
    const resultsGraph = buildResultsGraph({ [key]: { registeredName: '  sadira ayrton with jasueter  ' } });
    const { blocks } = matchCritiqueBlocks({ v: 1, blocks: parsedBlocks }, resultsGraph);
    const block = blocks.find((b) => b.classNameRaw === 'Post Graduate Dog' && b.position === 1)!;
    expect(block.confidence).toBe('exact');
  });

  it('punctuation-only differences still resolve to "exact"', () => {
    const key = keyFor('Veteran Dog', 1);
    const resultsGraph = buildResultsGraph({ [key]: { registeredName: "clynalwin's, nukon!" } });
    const { blocks } = matchCritiqueBlocks({ v: 1, blocks: parsedBlocks }, resultsGraph);
    const block = blocks.find((b) => b.classNameRaw === 'Veteran Dog' && b.position === 1)!;
    expect(block.confidence).toBe('exact');
  });
});

describe('matchCritiqueBlocks — no results row for that class + placement', () => {
  it('is "unmatched" with a null entryClassId when the results row is missing', () => {
    const key = keyFor('Open Dog', 1);
    const resultsGraph = buildResultsGraph({}, [key]);
    const { blocks } = matchCritiqueBlocks({ v: 1, blocks: parsedBlocks }, resultsGraph);
    const block = blocks.find((b) => b.classNameRaw === 'Open Dog' && b.position === 1)!;
    expect(block.matchedEntryClassId).toBeNull();
    expect(block.confidence).toBe('unmatched');
  });
});

describe('matchCritiqueBlocks — conflict with an existing steward critique', () => {
  it('populates conflict when the results row already has a different critique', () => {
    const key = keyFor('Limit Dog', 1);
    const resultsGraph = buildResultsGraph({
      [key]: { existingCritiqueText: 'A steward wrote something completely different on the day.' },
    });
    const { blocks } = matchCritiqueBlocks({ v: 1, blocks: parsedBlocks }, resultsGraph);
    const block = blocks.find((b) => b.classNameRaw === 'Limit Dog' && b.position === 1)!;
    expect(block.conflict).toEqual({ existingText: 'A steward wrote something completely different on the day.' });
    expect(block.resolution).toBeNull(); // secretary hasn't chosen yet
  });

  it('does not flag a conflict when there is no existing steward text', () => {
    const key = keyFor('Limit Dog', 2);
    const resultsGraph = buildResultsGraph({ [key]: { existingCritiqueText: null } });
    const { blocks } = matchCritiqueBlocks({ v: 1, blocks: parsedBlocks }, resultsGraph);
    const block = blocks.find((b) => b.classNameRaw === 'Limit Dog' && b.position === 2)!;
    expect(block.conflict).toBeNull();
  });

  it('does not flag a conflict when the existing steward text is identical to the document text', () => {
    const target = findBlock('Yearling Dog', 1);
    const key = keyFor('Yearling Dog', 1);
    const resultsGraph = buildResultsGraph({ [key]: { existingCritiqueText: target.critiqueText } });
    const { blocks } = matchCritiqueBlocks({ v: 1, blocks: parsedBlocks }, resultsGraph);
    const block = blocks.find((b) => b.classNameRaw === 'Yearling Dog' && b.position === 1)!;
    expect(block.conflict).toBeNull();
  });
});

describe('matchCritiqueBlocks — award-mention hints (review-only, never drive matching)', () => {
  const resultsGraph = buildResultsGraph();
  const { blocks } = matchCritiqueBlocks({ v: 1, blocks: parsedBlocks }, resultsGraph);

  it('detects "Dog CC"', () => {
    const block = blocks.find((b) => b.classNameRaw === 'Open Dog' && b.position === 1)!;
    expect(block.hints).toContain('Dog CC');
  });

  it('detects "Challenge Certificate"', () => {
    const block = blocks.find((b) => b.classNameRaw === 'Limit Bitch' && b.position === 1)!;
    expect(block.hints).toContain('Challenge Certificate');
  });

  it('detects "Reserve CC"', () => {
    const block = blocks.find((b) => b.classNameRaw === 'Junior Bitch' && b.position === 1)!;
    expect(block.hints).toContain('Reserve CC');
  });

  it('detects "Best Puppy"', () => {
    const block = blocks.find((b) => b.classNameRaw === 'Minor Puppy Dog' && b.position === 1)!;
    expect(block.hints).toContain('Best Puppy');
  });

  it('detects "Bitch CC" (synthetic — not present in the real fixture)', () => {
    const synthetic = matchCritiqueBlocks(
      {
        v: 1,
        blocks: [
          {
            kind: 'critique',
            classNameRaw: 'Open Bitch',
            position: 1,
            ownersRaw: 'TEST OWNER',
            dogRaw: 'TEST DOG',
            dogNameCleaned: 'TEST DOG',
            pedigreeRaw: null,
            critiqueText: 'A worthy winner of the Bitch CC.',
            matchedShowClassId: null,
          },
        ],
      },
      []
    );
    expect(synthetic.blocks[0].hints).toContain('Bitch CC');
  });

  it('has no hints when the critique text mentions no award', () => {
    const block = blocks.find((b) => b.classNameRaw === 'Veteran Dog' && b.position === 2)!;
    expect(block.hints).toEqual([]);
  });
});

describe('matchCritiqueBlocks — overview and unmatched blocks pass through unmatched', () => {
  it('unrecognised-header blocks get confidence "unmatched", null matchedEntryClassId, include:true', () => {
    const classList: ClassListEntry[] = [{ showClassId: 'sc-puppy-dog', className: 'Puppy', sex: 'dog' }];
    const text = ['Not A Real Class', '', 'Puppy Dog', '', '1st, SMITH, MRS A – TEST DOG', '', 'Prose.'].join('\n');
    const parsed = parseCritiqueDocument(text, classList);
    const { blocks } = matchCritiqueBlocks(parsed, buildResultsGraph());
    const unmatched = blocks.find((b) => b.kind === 'unmatched')!;
    expect(unmatched.confidence).toBe('unmatched');
    expect(unmatched.matchedEntryClassId).toBeNull();
    expect(unmatched.include).toBe(true);
  });

  it('overview blocks get confidence "unmatched" and are never matched to a results row', () => {
    const classList: ClassListEntry[] = [{ showClassId: 'sc-puppy-dog', className: 'Puppy', sex: 'dog' }];
    const text = ['Thanks to the committee.', '', 'Puppy Dog', '', '1st, SMITH, MRS A – TEST DOG', '', 'Prose.'].join(
      '\n'
    );
    const parsed = parseCritiqueDocument(text, classList);
    const { blocks } = matchCritiqueBlocks(parsed, []);
    const overview = blocks.find((b) => b.kind === 'overview')!;
    expect(overview.confidence).toBe('unmatched');
    expect(overview.matchedEntryClassId).toBeNull();
  });
});
