import { describe, it, expect } from 'vitest';
import {
  buildSvResultsReport,
  buildSvResultsXlsxRows,
  svResultsSheetClassName,
  findPlacedWithoutGrade,
  svGradeGapsWarning,
  splitPersonName,
  splitAffix,
  svClassLabel,
  svSexWord,
  computeClassMembers,
  FOOTER_AWARDS,
  type SvEntryInput,
  type SvShowClassInput,
  type SvResultsReportInput,
} from '../sv-results';
import { REGIONAL_BEST_AWARDS } from '../best-awards';
import { awardNameToType } from '../top-awards';

// ── FOOTER_AWARDS ↔ REGIONAL_BEST_AWARDS parity guard ───────────────
//
// Before 21 Sept 2026 the printed regional footer's four Best Awards
// (FOOTER_AWARDS here) and the Sponsors page picker's regional vocabulary
// (REGIONAL_BEST_AWARDS in best-awards.ts) were two separate literal lists
// of the same four awards — the exact "one owner per rule" trap. FOOTER_AWARDS
// is now DERIVED from REGIONAL_BEST_AWARDS, so this guard can only ever fail
// if a future edit reintroduces a second, independent literal list.
describe('FOOTER_AWARDS — derived from REGIONAL_BEST_AWARDS, not a second list', () => {
  it('has exactly the same awards, in the same order, as REGIONAL_BEST_AWARDS', () => {
    const expectedTypes = REGIONAL_BEST_AWARDS.map((name) => awardNameToType(name));
    expect(FOOTER_AWARDS.map((a) => a.type)).toEqual(expectedTypes);
  });

  it('uses SV print labels (Male/Female) for the recordable Dog/Bitch names', () => {
    expect(FOOTER_AWARDS).toEqual([
      { type: 'best_dog', label: 'Best Male' },
      { type: 'best_bitch', label: 'Best Female' },
      { type: 'most_promising_young_dog', label: 'Most Promising Male' },
      { type: 'most_promising_young_bitch', label: 'Most Promising Female' },
    ]);
  });
});

// ── Registered-name affix splitting (SV "Results" sheet, Mandy 2026-07-01) ──

describe('splitAffix', () => {
  it('splits a German suffix affix into name + affix', () => {
    expect(splitAffix('Stern vom Falkenhorst')).toEqual({
      name: 'Stern', affix: 'vom Falkenhorst', additionalAffix: '',
    });
  });

  it('handles a prefix (kennel) affix plus a transfer affix', () => {
    expect(splitAffix('Mascani Milan at Howlinwolf')).toEqual({
      name: 'Milan', affix: 'Mascani', additionalAffix: 'at Howlinwolf',
    });
  });

  it('keeps a multi-word "von der" suffix affix together', () => {
    expect(splitAffix('Donner von der Wolfshöhle')).toEqual({
      name: 'Donner', affix: 'von der Wolfshöhle', additionalAffix: '',
    });
  });

  it('treats a leading word as a prefix affix when there is no suffix', () => {
    expect(splitAffix('Mascani Milan')).toEqual({
      name: 'Milan', affix: 'Mascani', additionalAffix: '',
    });
  });

  // Mandy 2026-07-23 (real NE regional file): 'with' is a transfer connector
  // too, and multi-word names keep every word after the kennel affix.
  it("splits a 'with' transfer affix (Gayville Varinka with Trimika)", () => {
    expect(splitAffix('GAYVILLE VARINKA WITH TRIMIKA')).toEqual({
      name: 'VARINKA', affix: 'GAYVILLE', additionalAffix: 'WITH TRIMIKA',
    });
  });

  it('keeps multi-word names whole after the kennel affix', () => {
    expect(splitAffix('DRAMANA ANNO DOMINI')).toEqual({
      name: 'ANNO DOMINI', affix: 'DRAMANA', additionalAffix: '',
    });
  });

  it('leaves a single-word name with no affixes', () => {
    expect(splitAffix('Rex')).toEqual({ name: 'Rex', affix: '', additionalAffix: '' });
  });

  it('is safe on empty or null input', () => {
    expect(splitAffix('')).toEqual({ name: '', affix: '', additionalAffix: '' });
    expect(splitAffix(null)).toEqual({ name: '', affix: '', additionalAffix: '' });
  });
});

// ── Builders for compact fixtures ───────────────────────────────────

function svClass(
  id: string,
  age: string,
  sex: 'dog' | 'bitch' | null,
  coat: 'stock' | 'long_stock' | null,
  type = 'sv_age',
  sortOrder = 0,
): SvShowClassInput {
  return {
    id,
    sex,
    svCoatType: coat,
    classNumber: null,
    sortOrder,
    classDefinition: { type, name: `SV ${age}` },
  };
}

let dogSeq = 0;
function entry(opts: {
  showClassId: string;
  name: string;
  grade?: string | null;
  placement?: number | null;
  absent?: boolean;
  ring?: string;
  sire?: string;
  dam?: string;
  sex?: 'dog' | 'bitch';
  breederName?: string;
  ownerName?: string;
  ownerAddress?: string;
}): SvEntryInput {
  dogSeq += 1;
  return {
    id: `e${dogSeq}`,
    absent: opts.absent ?? false,
    catalogueNumber: opts.ring ?? String(100 + dogSeq),
    entryType: 'standard',
    dog: {
      registeredName: opts.name,
      sex: opts.sex ?? 'dog',
      coatType: null,
      dateOfBirth: '2024-01-01',
      microchipNumber: '900000000000001',
      registrationBody: 'kc',
      registrationBodyOther: null,
      kcRegNumber: 'AB123',
      sireName: opts.sire ?? 'Sire One',
      sireRegistrationBody: 'sv',
      sireRegistrationNumber: 'SZ1',
      damName: opts.dam ?? 'Dam One',
      damRegistrationBody: 'kc',
      damRegistrationNumber: 'KC1',
      breederName: opts.breederName ?? 'Paul Bradley',
      breederCity: 'Shrewsbury',
      breederPostcode: 'SY4 4AU',
      breederCountry: 'England',
      owners: [
        {
          ownerName: opts.ownerName ?? 'Jane Smith',
          ownerAddress: opts.ownerAddress ?? 'Manchester M1 2AB',
          isPrimary: true,
          sortOrder: 0,
        },
      ],
    },
    juniorHandler: null,
    entryClasses: [
      {
        showClassId: opts.showClassId,
        result:
          opts.grade === undefined && opts.placement === undefined
            ? null
            : { svGrade: opts.grade ?? null, placement: opts.placement ?? null, placementStatus: null },
      },
    ],
  };
}

function jhEntry(showClassId: string, handler: string, placement: number, ring: string): SvEntryInput {
  dogSeq += 1;
  return {
    id: `jh${dogSeq}`,
    absent: false,
    catalogueNumber: ring,
    entryType: 'junior_handler',
    dog: null,
    juniorHandler: { handlerName: handler, dateOfBirth: '2015-01-01' },
    entryClasses: [{ showClassId, result: { svGrade: null, placement, placementStatus: null } }],
  };
}

const judges = [
  { judge: { id: 'j1', name: 'Peter Schorling' }, breed: { name: 'German Shepherd Dog' }, sex: null, judgeRoleId: null },
  { judge: { id: 'j2', name: 'Dovile Svegzdaite' }, breed: null, sex: null, judgeRoleId: null }, // JH judge
];

function buildFixture(): SvResultsReportInput {
  const cWorkDogStock = svClass('c1', 'Working', 'dog', 'stock');
  const cWorkBitchStock = svClass('c2', 'Working', 'bitch', 'stock');
  const cMinorDogStock = svClass('c3', 'Minor Puppy', 'dog', 'stock');
  const cWorkDogLong = svClass('c4', 'Working', 'dog', 'long_stock');
  const cJh = svClass('c5', 'Junior Handling 6-11', null, null, 'junior_handler', 50);

  return {
    showClasses: [cWorkDogStock, cWorkBitchStock, cMinorDogStock, cWorkDogLong, cJh],
    entries: [
      // Working dog stock: V1, V2, G1, then an absentee.
      entry({ showClassId: 'c1', name: 'Anton', grade: 'v', placement: 1, ring: '10', sire: 'Grimm', dam: 'Rover' }),
      entry({ showClassId: 'c1', name: 'Zandamor', grade: 'v', placement: 2, ring: '11' }),
      entry({ showClassId: 'c1', name: 'Daleer', grade: 'g', placement: 3, ring: '12' }),
      entry({ showClassId: 'c1', name: 'Tornado', absent: true, ring: '13' }),
      // Working bitch stock
      entry({ showClassId: 'c2', name: 'Bailey', grade: 'v', placement: 1, ring: '14', sex: 'bitch' }),
      // Minor puppy dog stock
      entry({ showClassId: 'c3', name: 'Riko', grade: 'vp', placement: 1, ring: '15' }),
      // Working dog long
      entry({ showClassId: 'c4', name: 'Rommel', grade: 'v', placement: 1, ring: '16' }),
      // Junior handling
      jhEntry('c5', 'Jessica Roe', 1, '200'),
      jhEntry('c5', 'Smilte J', 2, '201'),
    ],
    achievements: [
      { type: 'best_dog', dog: { registeredName: 'Rommel' } },
      { type: 'best_bitch', dog: { registeredName: 'Bailey' } },
      { type: 'most_promising_young_dog', dog: { registeredName: 'Riko' } },
    ],
    judges,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('svClassLabel / svSexWord', () => {
  it('uses Male/Female for adult classes and Dog/Bitch for puppies', () => {
    expect(svSexWord('Working', 'dog')).toBe('Male');
    expect(svSexWord('Adult', 'bitch')).toBe('Female');
    expect(svSexWord('Minor Puppy', 'dog')).toBe('Dog');
    expect(svSexWord('Puppy', 'bitch')).toBe('Bitch');
  });
  it('appends the SV age band', () => {
    expect(svClassLabel('Working', 'dog')).toBe('Working Male (2 years +)');
    expect(svClassLabel('Minor Puppy', 'bitch')).toBe('Minor Puppy Bitch (6-9 months)');
  });
});

describe('splitPersonName', () => {
  it('splits on the last space', () => {
    expect(splitPersonName('Paul Bradley')).toEqual({ first: 'Paul', surname: 'Bradley' });
    expect(splitPersonName('Elizabeth and Caroline Rogerson')).toEqual({
      first: 'Elizabeth and Caroline',
      surname: 'Rogerson',
    });
  });
  it('puts a single word in first name', () => {
    expect(splitPersonName('Madonna')).toEqual({ first: 'Madonna', surname: '' });
    expect(splitPersonName(null)).toEqual({ first: '', surname: '' });
  });
});

describe('computeClassMembers', () => {
  it('ranks within grade and restarts per grade, absentees last at 90+', () => {
    const sc = svClass('c1', 'Working', 'dog', 'stock');
    const members = [
      { entry: entry({ showClassId: 'c1', name: 'A', grade: 'v', placement: 1, ring: '10' }), result: { svGrade: 'v', placement: 1, placementStatus: null } },
      { entry: entry({ showClassId: 'c1', name: 'B', grade: 'v', placement: 2, ring: '11' }), result: { svGrade: 'v', placement: 2, placementStatus: null } },
      { entry: entry({ showClassId: 'c1', name: 'C', grade: 'g', placement: 3, ring: '12' }), result: { svGrade: 'g', placement: 3, placementStatus: null } },
      { entry: entry({ showClassId: 'c1', name: 'D', absent: true, ring: '14' }), result: null },
      { entry: entry({ showClassId: 'c1', name: 'E', absent: true, ring: '13' }), result: null },
    ];
    const rows = computeClassMembers(sc, members);
    expect(rows.map((r) => [r.gradeDisplay, r.placementDisplay, r.entry.dog?.registeredName])).toEqual([
      ['V', '1', 'A'],
      ['V', '2', 'B'],
      ['G', '1', 'C'],
      // absentees in ring-number order → 13 before 14
      ['Abs', '90', 'E'],
      ['Abs', '91', 'D'],
    ]);
  });

  // Demo "Oktoberfest bonanza", 25 Sept 2026: three Minor Puppy Bitches placed
  // 1st, 2nd, 3rd and never graded came out of the sheet as 1, 3, 2 — the
  // order they were loaded in. Ungraded dogs keep their placing order too.
  it('keeps ungraded dogs in placing order, after the graded ones', () => {
    const sc = svClass('mbl', 'Minor Puppy', 'bitch', 'long_stock');
    const members = [
      { entry: entry({ showClassId: 'mbl', name: 'Falcon', placement: 1, ring: '25', sex: 'bitch' }), result: { svGrade: null, placement: 1, placementStatus: null } },
      { entry: entry({ showClassId: 'mbl', name: 'Legacy', placement: 3, ring: '37', sex: 'bitch' }), result: { svGrade: null, placement: 3, placementStatus: null } },
      { entry: entry({ showClassId: 'mbl', name: 'Water Lily', placement: 2, ring: '66', sex: 'bitch' }), result: { svGrade: null, placement: 2, placementStatus: null } },
      { entry: entry({ showClassId: 'mbl', name: 'Graded', grade: 'vp', placement: 4, ring: '70', sex: 'bitch' }), result: { svGrade: 'vp', placement: 4, placementStatus: null } },
    ];
    expect(computeClassMembers(sc, members).map((r) => [r.gradeDisplay, r.placementDisplay, r.entry.catalogueNumber])).toEqual([
      ['VP', '1', '70'],
      ['', '1', '25'],
      ['', '2', '66'],
      ['', '3', '37'],
    ]);
  });
});

describe('buildSvResultsReport', () => {
  const report = buildSvResultsReport(buildFixture());

  it('groups by coat (Long Coats then Short Coat — matches the 1a/1b class order since 2026-08-11)', () => {
    expect(report.coatSections.map((s) => s.title)).toEqual(['Long Coats', 'Short Coat']);
  });

  it('orders classes oldest-first, male before female', () => {
    // Select by title, not index — section order flipped Long-first 2026-08-11.
    const shortCoat = report.coatSections.find((s) => s.title === 'Short Coat')!;
    expect(shortCoat.classes.map((c) => c.label)).toEqual([
      'Working Male (2 years +)',
      'Working Female (2 years +)',
      'Minor Puppy Dog (6-9 months)',
    ]);
  });

  it('renders graded rows and keeps absentees as Abs 90+', () => {
    const workingMale = report.coatSections.find((s) => s.title === 'Short Coat')!.classes[0];
    expect(workingMale.rows).toEqual([
      { grade: 'V', placement: '1', name: 'Anton', sire: 'Grimm', dam: 'Rover', absent: false },
      { grade: 'V', placement: '2', name: 'Zandamor', sire: 'Sire One', dam: 'Dam One', absent: false },
      { grade: 'G', placement: '1', name: 'Daleer', sire: 'Sire One', dam: 'Dam One', absent: false },
      { grade: 'Abs', placement: '90', name: 'Tornado', sire: 'Sire One', dam: 'Dam One', absent: true },
    ]);
  });

  it('computes entered / present / absentee summary', () => {
    expect(report.entered).toBe(7);
    expect(report.absent).toBe(1);
    expect(report.present).toBe(6);
    expect(report.absenteePct).toBe(14);
  });

  it('pulls Best / Most Promising awards from achievements', () => {
    expect(report.awards).toEqual([
      { label: 'Best Male', dogName: 'Rommel' },
      { label: 'Best Female', dogName: 'Bailey' },
      { label: 'Most Promising Male', dogName: 'Riko' },
    ]);
  });

  it('names the breed judge and the JH judge separately', () => {
    expect(report.judgeName).toBe('Peter Schorling');
    expect(report.jhJudgeName).toBe('Dovile Svegzdaite');
  });

  it('lists Junior Handling placings by handler name', () => {
    expect(report.jhGroups).toHaveLength(1);
    expect(report.jhGroups[0].label).toBe('Junior Handling 6-11');
    expect(report.jhGroups[0].rows).toEqual([
      { placement: '1', handler: 'Jessica Roe' },
      { placement: '2', handler: 'Smilte J' },
    ]);
  });
});

describe('buildSvResultsXlsxRows', () => {
  const rows = buildSvResultsXlsxRows(buildFixture(), { venue: 'Armitage, GB', date: '22/03/2026' });

  it('emits one row per dog, class by class in the show\'s class order, excluding JH', () => {
    expect(rows.map((r) => r.ringNumber)).toEqual(['10', '11', '12', '13', '14', '15', '16']);
  });

  it('maps grading, placing and pedigree columns', () => {
    const anton = rows.find((r) => r.dogName === 'Anton')!;
    expect(anton.grading).toBe('V');
    expect(anton.placing).toBe(1);
    expect(anton.className).toBe('Working SCD');
    expect(anton.venue).toBe('Armitage, GB');
    expect(anton.registrationBody).toBe('KC');
    expect(anton.sireName).toBe('Grimm');
    expect(anton.breederFirstName).toBe('Paul');
    expect(anton.breederSurname).toBe('Bradley');
    expect(anton.breederCityPostcode).toBe('Shrewsbury, SY4 4AU');
    expect(anton.ownerFirstName).toBe('Jane');
    expect(anton.ownerSurname).toBe('Smith');
  });

  it('shows absentees as Abs with placing 90', () => {
    const tornado = rows.find((r) => r.dogName === 'Tornado')!;
    expect(tornado.grading).toBe('Abs');
    expect(tornado.placing).toBe(90);
  });
});

// ── The League's corrections to the NE Regional sheet ──────────────
//
// Shirley (GSDL British Regional Group, 24 Sept 2026) re-sorted our North East
// Regional spreadsheet before sending it on to the SV and Win-sys: "it needs
// to be ordered in placing order and the classes need to show age, coat and
// sex". Her corrected file (the spec) runs the classes in schedule order and
// each class in placing order, with the Class column reading "6-9 months SCB",
// "Adult LCB", "Working SCD". The League's own sample sheet only said "Minor
// Puppy" / "Adult", which is why we had copied that.

describe('svResultsSheetClassName — age, coat and sex, as the League writes it', () => {
  it.each([
    ['Baby Puppy', 'long_stock', 'bitch', '4-6 months LCB'],
    ['Baby Puppy', 'stock', 'dog', '4-6 months SCD'],
    ['Minor Puppy', 'stock', 'bitch', '6-9 months SCB'],
    ['Minor Puppy', 'long_stock', 'dog', '6-9 months LCD'],
    ['Puppy', 'long_stock', 'dog', '9-12 months LCD'],
    ['Junior', 'stock', 'bitch', '12-18 months SCB'],
    ['Yearling', 'long_stock', 'dog', '18-24 months LCD'],
    ['Adult', 'long_stock', 'bitch', 'Adult LCB'],
    ['Adult', 'stock', 'dog', 'Adult SCD'],
    ['Working', 'stock', 'dog', 'Working SCD'],
  ] as const)('%s / %s / %s → %s', (age, coat, sex, expected) => {
    expect(svResultsSheetClassName(age, coat, sex)).toBe(expected);
  });

  it('accepts the stored class name with its "SV " prefix', () => {
    expect(svResultsSheetClassName('SV Minor Puppy', 'stock', 'bitch')).toBe('6-9 months SCB');
  });

  it('leaves the coat out on a show that does not split by coat', () => {
    expect(svResultsSheetClassName('Adult', null, 'dog')).toBe('Adult D');
  });
});

describe('buildSvResultsXlsxRows — the League\'s order (NE Regional, 5 Sept 2026)', () => {
  // Real dogs from the NE Regional, with the placings the judge gave and the
  // ring numbers the catalogue gave them. Ring order and placing order differ
  // inside a class — the old sheet sorted by ring number and scrambled them.
  // Classes and dogs are fed in deliberately jumbled.
  function neFixture(): SvResultsReportInput {
    const workingDogShort = svClass('wds', 'Working', 'dog', 'stock', 'sv_age', 27);
    const adultBitchLong = svClass('abl', 'Adult', 'bitch', 'long_stock', 'sv_age', 20);
    const minorBitchShort = svClass('mbs', 'Minor Puppy', 'bitch', 'stock', 'sv_age', 5);
    const juniorBitchShort = svClass('jbs', 'Junior', 'bitch', 'stock', 'sv_age', 13);
    const minorDogLong = svClass('mdl', 'Minor Puppy', 'dog', 'long_stock', 'sv_age', 6);
    return {
      showClasses: [workingDogShort, adultBitchLong, minorBitchShort, juniorBitchShort, minorDogLong],
      entries: [
        entry({ showClassId: 'wds', name: 'IBAR VOM RADHAUS MONFORTIS', grade: 'v', placement: 2, ring: '69' }),
        entry({ showClassId: 'wds', name: 'Anton vom Haus Garyn', absent: true, ring: '68' }),
        entry({ showClassId: 'wds', name: 'Obi AV Røstadgärden', grade: 'v', placement: 1, ring: '67' }),
        entry({ showClassId: 'abl', name: 'HAZROH FINTE', absent: true, ring: '40', sex: 'bitch' }),
        entry({ showClassId: 'abl', name: 'Tanita Wolf Empire', grade: 'sg', placement: 6, ring: '43', sex: 'bitch' }),
        entry({ showClassId: 'abl', name: 'HAZELGROVE QUINTA', grade: 'sg', placement: 5, ring: '38', sex: 'bitch' }),
        entry({ showClassId: 'abl', name: 'AAREET BONNY LASS', absent: true, ring: '37', sex: 'bitch' }),
        entry({ showClassId: 'abl', name: 'Fluffycox Von Shotaan', grade: 'sg', placement: 4, ring: '41', sex: 'bitch' }),
        entry({ showClassId: 'abl', name: 'DARK VALLEY GALLAGOTH', grade: 'sg', placement: 3, ring: '36', sex: 'bitch' }),
        entry({ showClassId: 'abl', name: 'KLEEHUEGEL HELGA', grade: 'sg', placement: 2, ring: '42', sex: 'bitch' }),
        entry({ showClassId: 'abl', name: 'YAKASIMBA BUBBLES', grade: 'sg', placement: 1, ring: '39', sex: 'bitch' }),
        entry({ showClassId: 'mbs', name: 'CARLSBRO ORIANNA', grade: 'vp', placement: 4, ring: '9', sex: 'bitch' }),
        entry({ showClassId: 'mbs', name: 'MONFORTIS DRAXA', grade: 'vp', placement: 3, ring: '10', sex: 'bitch' }),
        entry({ showClassId: 'mbs', name: 'STARKWILL EMI KOUSSI', grade: 'vp', placement: 2, ring: '8', sex: 'bitch' }),
        entry({ showClassId: 'mbs', name: 'ZAROMAK ARIA', grade: 'vp', placement: 1, ring: '7', sex: 'bitch' }),
        entry({ showClassId: 'jbs', name: 'FAIRYCROSS ANNIE', absent: true, ring: '22', sex: 'bitch' }),
        entry({ showClassId: 'jbs', name: 'HUNDENKRAFT PUMA', grade: 'g', placement: 3, ring: '23', sex: 'bitch' }),
        entry({ showClassId: 'jbs', name: 'PALUKA DOMINO', grade: 'sg', placement: 2, ring: '20', sex: 'bitch' }),
        entry({ showClassId: 'jbs', name: "LIEPSNA'S BONKERS", grade: 'sg', placement: 1, ring: '21', sex: 'bitch' }),
        entry({ showClassId: 'mdl', name: 'Bailhaus Makavusi', absent: true, ring: '12' }),
        entry({ showClassId: 'mdl', name: 'DRAMANA ANNO DOMINI', grade: 'vp', placement: 1, ring: '11' }),
      ],
      achievements: [],
      judges,
    };
  }

  it('runs the classes in schedule order and each class in placing order, absentees last', () => {
    const rows = buildSvResultsXlsxRows(neFixture(), { venue: 'Outpaw Pursuits', date: '05/09/2026' });
    // Exactly the order of these rows in Shirley's corrected file.
    expect(rows.map((r) => [r.className, r.ringNumber, r.grading, r.placing])).toEqual([
      ['6-9 months SCB', '7', 'VP', 1],
      ['6-9 months SCB', '8', 'VP', 2],
      ['6-9 months SCB', '10', 'VP', 3],
      ['6-9 months SCB', '9', 'VP', 4],
      ['6-9 months LCD', '11', 'VP', 1],
      ['6-9 months LCD', '12', 'Abs', 90],
      ['12-18 months SCB', '21', 'SG', 1],
      ['12-18 months SCB', '20', 'SG', 2],
      ['12-18 months SCB', '23', 'G', 1],
      ['12-18 months SCB', '22', 'Abs', 90],
      ['Adult LCB', '39', 'SG', 1],
      ['Adult LCB', '42', 'SG', 2],
      ['Adult LCB', '36', 'SG', 3],
      ['Adult LCB', '41', 'SG', 4],
      ['Adult LCB', '38', 'SG', 5],
      ['Adult LCB', '43', 'SG', 6],
      ['Adult LCB', '37', 'Abs', 90],
      ['Adult LCB', '40', 'Abs', 91],
      ['Working SCD', '67', 'V', 1],
      ['Working SCD', '69', 'V', 2],
      ['Working SCD', '68', 'Abs', 90],
    ]);
  });
});

describe('findPlacedWithoutGrade', () => {
  function gapFixture(): SvResultsReportInput {
    const minorDogLong = svClass('mdl', 'Minor Puppy', 'dog', 'long_stock', 'sv_age', 6);
    const adultBitchShort = svClass('abs', 'Adult', 'bitch', 'stock', 'sv_age', 21);
    return {
      showClasses: [minorDogLong, adultBitchShort],
      entries: [
        // The NE case: placed 1st, never graded.
        entry({ showClassId: 'mdl', name: 'DRAMANA ANNO DOMINI', placement: 1, ring: '11' }),
        entry({ showClassId: 'mdl', name: 'Bailhaus Makavusi', absent: true, ring: '12' }),
        entry({ showClassId: 'abs', name: 'Rosebud Edie of Hundark', grade: 'sg', placement: 1, ring: '44', sex: 'bitch' }),
        entry({ showClassId: 'abs', name: 'MARINITA KAYLEIGH', placement: 2, ring: '49', sex: 'bitch' }),
        entry({ showClassId: 'abs', name: 'Disqualified Dog', grade: 'disqualified', ring: '50', sex: 'bitch' }),
        entry({ showClassId: 'abs', name: 'Not Yet Placed', ring: '51', sex: 'bitch' }),
      ],
      achievements: [],
      judges,
    };
  }

  it('lists every placed dog that has no grade, in class order, with its class', () => {
    expect(findPlacedWithoutGrade(gapFixture())).toEqual([
      { catalogueNumber: '11', dogName: 'DRAMANA ANNO DOMINI', className: 'Minor Puppy Dog, Long Coat' },
      { catalogueNumber: '49', dogName: 'MARINITA KAYLEIGH', className: 'Adult Female, Short Coat' },
    ]);
  });

  it('is empty when every placed dog has a grade', () => {
    expect(findPlacedWithoutGrade(buildFixture())).toEqual([]);
  });
});

// The documents-page warning. Built here, not in the page: the page imports a
// `Map` icon from lucide-react, which hid the built-in Map and crashed the
// documents page ("Map is not a constructor") when the wording was grouped in
// the component (caught walking demo, 25 Sept 2026).
describe('svGradeGapsWarning', () => {
  it('is undefined when nothing is missing', () => {
    expect(svGradeGapsWarning([])).toBeUndefined();
  });

  it('names one dog and asks for "the grade"', () => {
    expect(
      svGradeGapsWarning([{ catalogueNumber: '11', dogName: 'DRAMANA ANNO DOMINI', className: 'Minor Puppy Dog, Long Coat' }]),
    ).toBe(
      '1 placed dog has no grade — Minor Puppy Dog, Long Coat: No. 11 DRAMANA ANNO DOMINI. ' +
        'Ask your steward to add the grade on the steward screen before you send these to the League.',
    );
  });

  it('groups several dogs by class and asks for "the grades"', () => {
    expect(
      svGradeGapsWarning([
        { catalogueNumber: '25', dogName: 'Donamead Falcon', className: 'Minor Puppy Bitch, Long Coat' },
        { catalogueNumber: '66', dogName: 'Donamead Water Lily', className: 'Minor Puppy Bitch, Long Coat' },
        { catalogueNumber: '49', dogName: 'MARINITA KAYLEIGH', className: 'Adult Female, Short Coat' },
      ]),
    ).toBe(
      '3 placed dogs have no grade — Minor Puppy Bitch, Long Coat: No. 25 Donamead Falcon, No. 66 Donamead Water Lily. ' +
        'Adult Female, Short Coat: No. 49 MARINITA KAYLEIGH. ' +
        'Ask your steward to add the grades on the steward screen before you send these to the League.',
    );
  });
});
