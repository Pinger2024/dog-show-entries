import { describe, it, expect } from 'vitest';
import {
  buildSvResultsReport,
  buildSvResultsXlsxRows,
  splitPersonName,
  splitAffix,
  svClassLabel,
  svSexWord,
  computeClassMembers,
  type SvEntryInput,
  type SvShowClassInput,
  type SvResultsReportInput,
} from '../sv-results';

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
});

describe('buildSvResultsReport', () => {
  const report = buildSvResultsReport(buildFixture());

  it('groups by coat (Short Coat then Long Coats)', () => {
    expect(report.coatSections.map((s) => s.title)).toEqual(['Short Coat', 'Long Coats']);
  });

  it('orders classes oldest-first, male before female', () => {
    const shortCoat = report.coatSections[0];
    expect(shortCoat.classes.map((c) => c.label)).toEqual([
      'Working Male (2 years +)',
      'Working Female (2 years +)',
      'Minor Puppy Dog (6-9 months)',
    ]);
  });

  it('renders graded rows and keeps absentees as Abs 90+', () => {
    const workingMale = report.coatSections[0].classes[0];
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

  it('emits one row per dog, ordered by ring number, excluding JH', () => {
    expect(rows.map((r) => r.ringNumber)).toEqual(['10', '11', '12', '13', '14', '15', '16']);
  });

  it('maps grading, placing and pedigree columns', () => {
    const anton = rows.find((r) => r.dogName === 'Anton')!;
    expect(anton.grading).toBe('V');
    expect(anton.placing).toBe(1);
    expect(anton.className).toBe('Working');
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
