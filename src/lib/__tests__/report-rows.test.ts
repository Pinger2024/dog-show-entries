import { describe, it, expect } from 'vitest';
import {
  buildCatalogueOrderRows,
  buildClassBreakdownRows,
  buildAbsenteeRow,
  buildFinancialStatementRow,
} from '../report-rows';

// These pure row-builders feed BOTH a report's PDF/CSV output and its .xlsx
// twin. The tests here lock in the mapping so a future change can't silently
// make the two outputs disagree (Fable phase 2, 2026-07-28).

describe('buildCatalogueOrderRows — Exhibitor List', () => {
  const classLabelMap = new Map([['class-1', '1']]);

  it('sorts by catalogue number and joins owners/classes', () => {
    const confirmed = [
      {
        catalogueNumber: '2',
        dog: { registeredName: 'Zeta', breed: { name: 'GSD' }, sex: 'bitch', owners: [{ ownerName: 'Jo' }] },
        exhibitor: { name: 'Jo Smith' },
        entryClasses: [{ showClass: { id: 'class-1' } }],
      },
      {
        catalogueNumber: '1',
        dog: { registeredName: 'Anton', breed: { name: 'GSD' }, sex: 'dog', owners: null },
        exhibitor: { name: 'Amanda' },
        entryClasses: [{ showClass: { id: 'class-1' } }],
      },
    ];
    const rows = buildCatalogueOrderRows(confirmed, classLabelMap);
    expect(rows.map((r) => r.catalogueNumber)).toEqual(['1', '2']);
    expect(rows[0].owner).toBe('Amanda'); // falls back to exhibitor name when no owners
    expect(rows[1].owner).toBe('Jo');
    expect(rows[0].classes).toBe('1');
  });

  it('one row per confirmed entry — the same count the xlsx table gets', () => {
    const confirmed = Array.from({ length: 5 }, (_, i) => ({
      catalogueNumber: String(i + 1),
      dog: { registeredName: `Dog ${i}`, breed: null, sex: 'dog', owners: null },
      exhibitor: { name: 'Someone' },
      entryClasses: [],
    }));
    expect(buildCatalogueOrderRows(confirmed, classLabelMap)).toHaveLength(5);
  });
});

describe('buildClassBreakdownRows — Class Breakdown', () => {
  it('maps class + count + label, defaulting a zero-entry class to 0', () => {
    const classes = [
      { id: 'a', classNumber: 1, sex: 'dog', classDefinition: { name: 'Puppy' } },
      { id: 'b', classNumber: 2, sex: 'bitch', classDefinition: { name: 'Puppy' } },
    ];
    const counts = new Map([['a', 3]]);
    const labelMap = new Map([['a', '1'], ['b', '2']]);
    const rows = buildClassBreakdownRows(classes, counts, labelMap);
    expect(rows).toEqual([
      { label: '1', name: 'Puppy', sex: 'dog', count: 3 },
      { label: '2', name: 'Puppy', sex: 'bitch', count: 0 },
    ]);
  });
});

describe('buildAbsenteeRow — shared by all three absentee-shaped reports', () => {
  const base = {
    catalogueNumber: '42',
    status: 'confirmed',
    dog: { registeredName: 'Rex', breed: { name: 'GSD' }, sex: 'dog', owners: [{ ownerName: 'Pat' }] },
    exhibitor: { name: 'Pat Owner' },
    entryClasses: [{ absent: true, showClass: { classNumber: 3, classDefinition: { name: 'Open Dog' } } }],
  };

  it('formats classes as "N. Name" and defaults status to Absent', () => {
    const row = buildAbsenteeRow(base);
    expect(row).toEqual({
      catalogueNumber: '42',
      dogName: 'Rex',
      breed: 'GSD',
      sex: 'Dog',
      classes: '3. Open Dog',
      owner: 'Pat',
      exhibitor: 'Pat Owner',
      status: 'Absent',
    });
  });

  it('reports Withdrawn when the entry status is withdrawn', () => {
    const row = buildAbsenteeRow({ ...base, status: 'withdrawn' });
    expect(row.status).toBe('Withdrawn');
  });

  it('falls back to "Junior Handler" when there is no dog', () => {
    const row = buildAbsenteeRow({ ...base, dog: null });
    expect(row.dogName).toBe('Junior Handler');
    expect(row.breed).toBe('');
    expect(row.sex).toBe('');
  });

  it('csv rows and xlsx rows come from the same array — count always matches', () => {
    const entries = Array.from({ length: 7 }, (_, i) => ({ ...base, catalogueNumber: String(i) }));
    const csvRows = entries.map(buildAbsenteeRow);
    const xlsxRows = entries.map(buildAbsenteeRow);
    expect(csvRows).toHaveLength(entries.length);
    expect(xlsxRows).toHaveLength(entries.length);
    expect(csvRows).toEqual(xlsxRows);
  });

  // Per-class attendance (Mandy 2026-08-12, real incident): a dog can be
  // absent from her breed class but shown — and placed — in a Special
  // Award class at the same show. An "Absent" row must list ONLY the
  // classes she was actually marked absent from.
  it('lists only the classes an entry was absent from when some classes are still present', () => {
    const row = buildAbsenteeRow({
      ...base,
      entryClasses: [
        { absent: true, showClass: { classNumber: 1, classDefinition: { name: 'Puppy Dog' } } },
        { absent: false, showClass: { classNumber: 9, classDefinition: { name: 'Best of Breed Special Award' } } },
      ],
    });

    expect(row.status).toBe('Absent');
    expect(row.classes).toBe('1. Puppy Dog');
    expect(row.classes).not.toContain('Best of Breed Special Award');
  });

  it('lists every class for a withdrawn entry — withdrawal is not per-class', () => {
    const row = buildAbsenteeRow({
      ...base,
      status: 'withdrawn',
      entryClasses: [
        { absent: false, showClass: { classNumber: 1, classDefinition: { name: 'Puppy Dog' } } },
        { absent: false, showClass: { classNumber: 9, classDefinition: { name: 'Best of Breed Special Award' } } },
      ],
    });

    expect(row.status).toBe('Withdrawn');
    expect(row.classes).toBe('1. Puppy Dog; 9. Best of Breed Special Award');
  });
});

describe('buildFinancialStatementRow — Financial Statement', () => {
  it('flags catalogue-ordered by lowercased exhibitor email', () => {
    const entry = {
      dog: { registeredName: 'Rex' },
      exhibitor: { name: 'Pat', email: 'Pat@Example.com' },
      status: 'confirmed',
      entryClasses: [{ showClass: { classDefinition: { name: 'Open Dog' } } }],
      totalFee: 1234,
    };
    const yes = buildFinancialStatementRow(entry, new Set(['pat@example.com']));
    expect(yes.catalogueOrdered).toBe('Yes');
    expect(yes.fee).toBe('12.34');
    expect(yes.classes).toBe('Open Dog');

    const no = buildFinancialStatementRow(entry, new Set());
    expect(no.catalogueOrdered).toBe('No');
  });

  it('falls back to "Unknown" for a missing dog or exhibitor', () => {
    const row = buildFinancialStatementRow(
      { dog: null, exhibitor: null, status: 'confirmed', entryClasses: [], totalFee: 0 },
      new Set(),
    );
    expect(row.dog).toBe('Unknown');
    expect(row.exhibitor).toBe('Unknown');
  });
});

// ── RKC registration flags on paperwork ────────────────────────────────
// Mandy asked for NAF/TAF on "the catalogue and results paperwork", so the
// exported reports must word it exactly as the catalogue does — same helper.
describe('registration flags on report rows', () => {
  it('appends the flags to the exhibitor-list name', () => {
    const [row] = buildCatalogueOrderRows(
      [
        {
          catalogueNumber: '1',
          naf: true,
          taf: true,
          dog: { registeredName: 'SPRINGFIELD CYCLONE', breed: { name: 'GSD' }, sex: 'dog', owners: null },
          exhibitor: { name: 'A Exhibitor' },
          entryClasses: [],
        },
      ],
      new Map()
    );
    expect(row?.name).toBe('SPRINGFIELD CYCLONE NAF TAF');
  });

  it('leaves an unflagged name untouched', () => {
    const [row] = buildCatalogueOrderRows(
      [
        {
          catalogueNumber: '2',
          dog: { registeredName: 'SPRINGFIELD TORNADO', breed: { name: 'GSD' }, sex: 'dog', owners: null },
          exhibitor: { name: 'A Exhibitor' },
          entryClasses: [],
        },
      ],
      new Map()
    );
    expect(row?.name).toBe('SPRINGFIELD TORNADO');
  });

  it('appends the flags on the absentee row too', () => {
    const row = buildAbsenteeRow({
      catalogueNumber: '3',
      status: 'withdrawn',
      cnaf: true,
      dog: { registeredName: 'DONAPARK HAWK', breed: { name: 'GSD' }, sex: 'bitch', owners: null },
      exhibitor: { name: 'B Exhibitor' },
      entryClasses: [],
    });
    expect(row.dogName).toBe('DONAPARK HAWK CNAF');
  });
});
