import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  parseCritiqueDocument,
  cleanDogName,
  type ClassListEntry,
} from '@/lib/critique-parse';

const FIXTURE_TEXT = readFileSync(
  join(__dirname, 'fixtures', 'judge-critiques-sample.txt'),
  'utf8'
);

// Mirrors the show's real class list (show_classes joined class_definitions)
// that production would pass in — the eight age classes for each sex, GSD
// championship-show shape.
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

const EXPECTED_COUNTS: Record<string, number> = {
  'Veteran Dog': 2, 'Minor Puppy Dog': 1, 'Puppy Dog': 1, 'Junior Dog': 1,
  'Yearling Dog': 1, 'Post Graduate Dog': 2, 'Limit Dog': 2, 'Open Dog': 1,
  'Veteran Bitch': 2, 'Minor Puppy Bitch': 2, 'Puppy Bitch': 2, 'Junior Bitch': 2,
  'Yearling Bitch': 2, 'Post Graduate Bitch': 2, 'Limit Bitch': 2, 'Open Bitch': 2,
};

describe('parseCritiqueDocument — real fixture (16 classes, 27 critiques)', () => {
  const classList = gsdClassList();
  const { blocks } = parseCritiqueDocument(FIXTURE_TEXT, classList);
  const critiques = blocks.filter((b) => b.kind === 'critique');

  it('parses exactly 27 critiques', () => {
    expect(critiques.length).toBe(27);
  });

  it('parses every class with its correct per-class placement count', () => {
    for (const [header, expectedCount] of Object.entries(EXPECTED_COUNTS)) {
      const positions = critiques.filter((c) => c.classNameRaw === header).map((c) => c.position);
      expect(positions.sort(), `${header} count`).toEqual(
        Array.from({ length: expectedCount }, (_, i) => i + 1)
      );
    }
  });

  it('attaches matchedShowClassId to every critique against the real class list', () => {
    for (const c of critiques) {
      expect(c.matchedShowClassId, `${c.classNameRaw} #${c.position}`).not.toBeNull();
    }
  });

  it('produces no unmatched blocks — every header in the fixture is in the class list', () => {
    expect(blocks.filter((b) => b.kind === 'unmatched')).toHaveLength(0);
  });

  it('produces no overview block — the real fixture has no preamble text', () => {
    expect(blocks.filter((b) => b.kind === 'overview')).toHaveLength(0);
  });
});

describe('parseCritiqueDocument — dogNameCleaned (real fixture rows)', () => {
  const { blocks } = parseCritiqueDocument(FIXTURE_TEXT, gsdClassList());
  const critiques = blocks.filter((b) => b.kind === 'critique');

  function find(classNameRaw: string, position: number) {
    const c = critiques.find((c) => c.classNameRaw === classNameRaw && c.position === position);
    if (!c) throw new Error(`no critique found for ${classNameRaw} #${position}`);
    return c;
  }

  it('strips a seven-country slash-joined title run plus a leading CH, and the trailing VW award suffix', () => {
    // "IR/NLD/BEL/LUX/HR/SWISS/INT CH CLYNALWIN'S NUKON VW" -> "CLYNALWIN'S NUKON"
    const c = find('Veteran Dog', 1);
    expect(c.dogRaw).toBe("IR/NLD/BEL/LUX/HR/SWISS/INT CH CLYNALWIN'S NUKON VW");
    expect(c.dogNameCleaned).toBe("CLYNALWIN'S NUKON");
  });

  it('strips a trailing ShCM award suffix', () => {
    const c = find('Veteran Dog', 2);
    expect(c.dogRaw).toBe('PORTNALL ELRICK ZU SAROCAL ShCM VW');
    expect(c.dogNameCleaned).toBe('PORTNALL ELRICK ZU SAROCAL');
  });

  it('keeps "AT WOLMER" — never strips a kennel-name suffix', () => {
    const c = find('Junior Bitch', 1);
    expect(c.dogNameCleaned).toBe('CHELEGO YALI AT WOLMER');
  });

  it('keeps "WITH JASUETER" — never strips a kennel-name suffix', () => {
    const c = find('Post Graduate Dog', 1);
    expect(c.dogNameCleaned).toBe('SADIRA AYRTON WITH JASUETER');
  });

  it('keeps a trailing "(IMP DEU)" import marker untouched', () => {
    const c = find('Open Bitch', 2);
    expect(c.dogRaw).toBe('MAGIC VOM HERBRAMER WALD (IMP DEU)');
    expect(c.dogNameCleaned).toBe('MAGIC VOM HERBRAMER WALD (IMP DEU)');
  });

  it('keeps a trailing "(IMP NOR)" import marker untouched with no title/suffix to strip', () => {
    const c = find('Post Graduate Dog', 2);
    expect(c.dogNameCleaned).toBe('OBI AV RØSTADGÅRDEN (IMP NOR)');
  });
});

describe('parseCritiqueDocument — noise handling (real fixture)', () => {
  const { blocks } = parseCritiqueDocument(FIXTURE_TEXT, gsdClassList());
  const critiques = blocks.filter((b) => b.kind === 'critique');

  it('a run of blank lines between critiques does not corrupt the following class', () => {
    // Minor Puppy Dog #1 is followed by ~7 blank lines then "Puppy Dog".
    const minorPuppyDog = critiques.find((c) => c.classNameRaw === 'Minor Puppy Dog');
    expect(minorPuppyDog?.critiqueText.endsWith('Very pleased to award him Best Puppy Dog.')).toBe(true);
    expect(minorPuppyDog?.critiqueText).not.toContain('Puppy Dog\n');
    const puppyDog = critiques.find((c) => c.classNameRaw === 'Puppy Dog');
    expect(puppyDog?.dogNameCleaned).toBe('GREUSENBERG BRAVO');
  });

  it('a literal "image" artefact line does not leak into critique text or split adjacent classes', () => {
    // Limit Bitch #2 (Paluka Bali) is immediately followed by a lone "image"
    // line, then the "Open Bitch" header.
    const palukaBali = critiques.find((c) => c.classNameRaw === 'Limit Bitch' && c.position === 2);
    expect(palukaBali?.critiqueText.toLowerCase()).not.toContain('image');
    expect(palukaBali?.critiqueText.endsWith('a clean, balanced and harmonious gait.')).toBe(true);

    const openBitch1 = critiques.find((c) => c.classNameRaw === 'Open Bitch' && c.position === 1);
    expect(openBitch1?.dogNameCleaned).toBe('MARINITA KAYLEIGH');
  });
});

describe('parseCritiqueDocument — overview preamble (synthetic)', () => {
  it('captures preamble text before the first header as its own overview block, not folded into the first critique', () => {
    const text = [
      'Thank you to the committee for a lovely show and to my stewards for their hard work.',
      '',
      'Puppy Dog',
      '',
      '1st, SMITH, MRS A – TEST DOG ONE',
      '',
      'A promising young male.',
    ].join('\n');

    const classList: ClassListEntry[] = [{ showClassId: 'sc-puppy-dog', className: 'Puppy', sex: 'dog' }];
    const { blocks } = parseCritiqueDocument(text, classList);

    expect(blocks[0].kind).toBe('overview');
    expect(blocks[0].critiqueText).toBe(
      'Thank you to the committee for a lovely show and to my stewards for their hard work.'
    );

    const critique = blocks.find((b) => b.kind === 'critique');
    expect(critique?.critiqueText).toBe('A promising young male.');
    expect(critique?.critiqueText).not.toContain('committee');
  });
});

describe('parseCritiqueDocument — unrecognised header becomes its own unmatched block', () => {
  // The class list omits "Junior Dog" entirely, simulating a header that
  // doesn't match the show's actual classes (typo, renamed class, or a
  // class this judge isn't assigned).
  const text = [
    'Puppy Dog',
    '',
    '1st, MEREDITH, MISS K – GREUSENBERG BRAVO',
    '',
    'A good type puppy dog with a pleasing outline.',
    '',
    'Junior Dog',
    '',
    '1st, CASSIDY & FARLEY, MR P & MRS N – NIKONIS STANLEY',
    '',
    'A well-balanced junior male.',
    '',
    'Yearling Dog',
    '',
    '1st, HUGHES, MISS J – SADIRA ALBERT',
    '',
    'A promising yearling.',
  ].join('\n');

  const classList: ClassListEntry[] = [
    { showClassId: 'sc-puppy-dog', className: 'Puppy', sex: 'dog' },
    // 'Junior' deliberately absent.
    { showClassId: 'sc-yearling-dog', className: 'Yearling', sex: 'dog' },
  ];

  const { blocks } = parseCritiqueDocument(text, classList);

  it('emits the unrecognised header as its own unmatched block', () => {
    const unmatched = blocks.filter((b) => b.kind === 'unmatched');
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0].classNameRaw).toBe('Junior Dog');
  });

  it('does NOT fold the unrecognised header text into the preceding critique', () => {
    const puppyDog = blocks.find((b) => b.kind === 'critique' && b.classNameRaw === 'Puppy Dog');
    expect(puppyDog?.critiqueText).toBe('A good type puppy dog with a pleasing outline.');
    expect(puppyDog?.critiqueText).not.toContain('Junior Dog');
  });

  it('the critique following the unrecognised header is NOT misattributed to the old (Puppy Dog) class', () => {
    const nikonisStanley = blocks.find((b) => b.kind === 'critique' && b.dogNameCleaned === 'NIKONIS STANLEY');
    expect(nikonisStanley?.classNameRaw).toBeNull();
    expect(nikonisStanley?.matchedShowClassId).toBeNull();
    expect(nikonisStanley?.critiqueText).toBe('A well-balanced junior male.');
  });

  it('parsing recovers on the next recognised header', () => {
    const yearlingDog = blocks.find((b) => b.kind === 'critique' && b.classNameRaw === 'Yearling Dog');
    expect(yearlingDog?.matchedShowClassId).toBe('sc-yearling-dog');
    expect(yearlingDog?.dogNameCleaned).toBe('SADIRA ALBERT');
  });
});

describe('cleanDogName — unit', () => {
  it('is a no-op for a plain registered name', () => {
    expect(cleanDogName('MONKSLEY ULKAN')).toBe('MONKSLEY ULKAN');
  });

  it('never strips down to zero tokens', () => {
    expect(cleanDogName('CH')).toBe('CH');
  });
});

describe('parseCritiqueDocument — paste starting mid-document (no header yet)', () => {
  const text = [
    '1st, SMITH, MRS A – MONKSLEY ULKAN',
    '',
    'A promising young male of very good type.',
    '',
    'Puppy Dog',
    '',
    '1st, JONES, MR B – GREUSENBERG BRAVO',
    '',
    'Very good type throughout.',
  ].join('\n');
  const { blocks } = parseCritiqueDocument(text, gsdClassList());

  it('surfaces the header-less placement as a reviewable critique block, not overview text', () => {
    expect(blocks.filter((b) => b.kind === 'overview')).toHaveLength(0);
    const orphan = blocks.find((b) => b.kind === 'critique' && b.dogNameCleaned === 'MONKSLEY ULKAN');
    expect(orphan?.matchedShowClassId).toBeNull();
    expect(orphan?.classNameRaw).toBeNull();
    expect(orphan?.critiqueText).toBe('A promising young male of very good type.');
  });

  it('still attributes the following headed class correctly', () => {
    const headed = blocks.find((b) => b.kind === 'critique' && b.dogNameCleaned === 'GREUSENBERG BRAVO');
    expect(headed?.matchedShowClassId).toBe('sc-1-dog');
    expect(headed?.position).toBe(1);
  });
});

describe('parseCritiqueDocument — numbered class headings (schedule style)', () => {
  const text = [
    '5 Junior Dog',
    '',
    '1st, SMITH, MRS A – MONKSLEY ULKAN',
    '',
    'A promising young male.',
    '',
    'Class 12. Open Bitch',
    '',
    '1st, JONES, MR B – GREUSENBERG BIBA',
    '',
    'Very good type throughout.',
  ].join('\n');
  const { blocks } = parseCritiqueDocument(text, gsdClassList());

  it('matches "5 Junior Dog" to the Junior Dog class', () => {
    const b = blocks.find((x) => x.dogNameCleaned === 'MONKSLEY ULKAN');
    expect(b?.matchedShowClassId).toBe('sc-2-dog');
    expect(b?.classNameRaw).toBe('5 Junior Dog');
  });

  it('matches "Class 12. Open Bitch" to the Open Bitch class', () => {
    const b = blocks.find((x) => x.dogNameCleaned === 'GREUSENBERG BIBA');
    expect(b?.matchedShowClassId).toBe('sc-6-bitch');
  });

  it('placement lines are not mistaken for numbered headers', () => {
    expect(blocks.filter((b) => b.kind === 'critique')).toHaveLength(2);
  });
});

/**
 * The second layout, from the BAGSD 2026 document (Mandy 2026-08-22).
 *
 * This judge writes no comma after the ordinal, names no owner, puts the
 * breeding inline in brackets and runs the critique straight on from it. Under
 * the original parser NOTHING matched — all 46 placements came through as
 * unrecognised text and every one was matched by hand.
 */
describe('placement layout — no comma, no owner, inline breeding', () => {
  const classList = gsdClassList();

  it('reads the ordinal, dog, breeding and critique from a single line', () => {
    const doc = [
      'VETERAN DOG',
      '1st GAYVILLE VARINKA WITH TRIMIKA (Gary vom Huhnegrab x Paris vom Simpor) 8 year old female, large black and gold with very good proportions. AWARDED BEST VETERAN',
    ].join('\n');

    const { blocks } = parseCritiqueDocument(doc, classList);
    const placements = blocks.filter((b) => b.kind === 'critique');
    expect(placements).toHaveLength(1);
    const p = placements[0];
    expect(p.position).toBe(1);
    expect(p.dogNameCleaned).toBe('GAYVILLE VARINKA WITH TRIMIKA');
    expect(p.pedigreeRaw).toBe('Gary vom Huhnegrab x Paris vom Simpor');
    expect(p.critiqueText).toContain('8 year old female');
    expect(p.critiqueText).toContain('AWARDED BEST VETERAN');
    // The breeding must not be left inside the dog's name.
    expect(p.dogNameCleaned).not.toContain('(');
    expect(p.matchedShowClassId).not.toBeNull();
  });

  it('still reads the original layout — comma, owner, breeding on its own line', () => {
    const doc = [
      'VETERAN DOG',
      '1st, Mrs J Smith – Rex vom Haus',
      '(Sire vom X x Dam vom Y)',
      'A powerful dog with excellent movement.',
    ].join('\n');

    const { blocks } = parseCritiqueDocument(doc, classList);
    const p = blocks.filter((b) => b.kind === 'critique')[0];
    expect(p.position).toBe(1);
    expect(p.ownersRaw).toBe('Mrs J Smith');
    expect(p.dogNameCleaned).toBe('Rex vom Haus');
    expect(p.pedigreeRaw).toBe('Sire vom X x Dam vom Y');
    expect(p.critiqueText).toBe('A powerful dog with excellent movement.');
  });

  it('does not mistake a parenthetical aside in the prose for breeding', () => {
    const doc = [
      'OPEN DOG',
      '1st HANDSOME LAD (a lovely mover) covered the ground well.',
    ].join('\n');

    const p = parseCritiqueDocument(doc, classList).blocks.filter((b) => b.kind === 'critique')[0];
    // No " x " or " - " inside the brackets, so it is prose, not a pedigree.
    expect(p.pedigreeRaw).toBeNull();
  });

  it('does not read ordinary prose beginning with a number as a placement', () => {
    const doc = [
      'OPEN DOG',
      '1st REAL DOG (Sire x Dam) good dog.',
      '2 year old male shown in good condition.',
    ].join('\n');

    const placements = parseCritiqueDocument(doc, classList).blocks.filter((b) => b.kind === 'critique');
    expect(placements).toHaveLength(1);
    expect(placements[0].critiqueText).toContain('2 year old male');
  });
});

describe('mixed-sex class headings', () => {
  it('matches a mixed class however the judge heads it', () => {
    // toClassList expands a sex-null class into both sexes; the judge heads it
    // "VETERAN MIXED CLASS" or just "VETERAN".
    const mixed: ClassListEntry[] = [
      { showClassId: 'sc-vet', className: 'Veteran', sex: 'dog' },
      { showClassId: 'sc-vet', className: 'Veteran', sex: 'bitch' },
    ];
    for (const heading of ['VETERAN MIXED CLASS', 'VETERAN', 'Veteran Mixed']) {
      const doc = [heading, '1st A DOG (Sire x Dam) nice type.'].join('\n');
      const p = parseCritiqueDocument(doc, mixed).blocks.filter((b) => b.kind === 'critique')[0];
      expect(p, `heading: ${heading}`).toBeDefined();
      expect(p.matchedShowClassId, `heading: ${heading}`).toBe('sc-vet');
    }
  });
});
