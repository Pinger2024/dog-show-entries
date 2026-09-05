import { describe, it, expect } from 'vitest';
import { CatalogueByClass, type JudgeCopyResult } from '@/components/catalogue/catalogue-by-class';
import type { CatalogueEntry, CatalogueShowInfo } from '@/components/catalogue/catalogue-types';
import { isValidElement, type ReactElement } from 'react';

/**
 * Mandy 2026-09-05: "I also think it would be worth keeping the updated
 * catalogue for the judge with all the results added ... just replicate the
 * exact catalogue we produce but add in the results sg1, sg3 etc."
 *
 * These tests exercise `CatalogueByClass`'s new `judgeResults` prop, which
 * fills the EXISTING SV write-in placings/grading grid (renderSvPlacings)
 * with real results instead of dots — the only thing that changes for the
 * new `judge-copy` catalogue format. CatalogueByClass is a pure (hook-free)
 * component, so it's called directly and the react-pdf element tree is
 * walked for text, exactly like catalogue-banner-full-width.test.tsx does.
 *
 * Mandy 2026-09-06, after seeing a real render with names filled into the
 * grid: "I don't think we need the name on the results just the catalogue
 * number and grade as the name is just a [waste]" — so the grid holds ONLY
 * the catalogue number and the grade; the class listing directly above it
 * keeps the names exactly as it always has.
 */

const SHOW_CLASS_WORKING = 'sc-working';
const SHOW_CLASS_JH = 'sc-jh';

function makeShow(): CatalogueShowInfo {
  return {
    name: 'North East Regional',
    showType: 'championship',
    showRuleset: 'wusv',
    date: '2026-09-05',
    venue: 'Test Ground',
    venueAddress: 'Somewhere',
    organisation: 'Test GSD Club',
    kcLicenceNo: '1234',
  } as CatalogueShowInfo;
}

function makeEntry(overrides: Partial<CatalogueEntry> & { catalogueNumber: string }): CatalogueEntry {
  return {
    dogName: `Dog ${overrides.catalogueNumber}`,
    breed: 'German Shepherd Dog',
    group: undefined,
    groupSortOrder: undefined,
    sex: 'dog',
    dateOfBirth: '2025-01-01',
    kcRegNumber: null,
    colour: null,
    sire: null,
    dam: null,
    breeder: null,
    owners: [{ title: null, name: 'Owner', address: '1 Secret Street, Anytown, AB1 2CD', userId: null }],
    exhibitorId: undefined,
    handler: null,
    exhibitor: null,
    jhHandlerName: null,
    classes: [
      {
        name: 'SV Working',
        sex: 'dog',
        classNumber: 5,
        classLabel: '5',
        sortOrder: 5,
        svCoatType: 'stock',
        showClassId: SHOW_CLASS_WORKING,
      },
    ],
    status: 'confirmed',
    entryType: 'standard',
    ...overrides,
  } as CatalogueEntry;
}

/** Every string anywhere in the element tree, concatenated (one string per
 *  node, newline-joined — mirrors catalogue-banner-full-width.test.tsx). */
function allText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(allText).join('\n');
  if (isValidElement(node)) return allText((node as ReactElement<any>).props.children);
  return '';
}

describe('CatalogueByClass — judge-copy results fill-in', () => {
  it('RESULTS SUPPLIED: fills the write-in grid with real placings and restarts the SV rank per grade', () => {
    // 4 dogs: SG,SG,G,G placed 1..4 — SV restarts numbering per grade, so
    // this must read SG1, SG2, G1, G2 (never SG1, SG2, G3, G4).
    const entries = [
      makeEntry({ catalogueNumber: '1' }),
      makeEntry({ catalogueNumber: '2' }),
      makeEntry({ catalogueNumber: '3' }),
      makeEntry({ catalogueNumber: '4' }),
    ];
    const judgeResults = new Map<string, JudgeCopyResult>([
      [`1-${SHOW_CLASS_WORKING}`, { svGrade: 'sg', placement: 1, placementStatus: null, specialAward: null }],
      [`2-${SHOW_CLASS_WORKING}`, { svGrade: 'sg', placement: 2, placementStatus: null, specialAward: null }],
      [`3-${SHOW_CLASS_WORKING}`, { svGrade: 'g', placement: 3, placementStatus: null, specialAward: null }],
      [`4-${SHOW_CLASS_WORKING}`, { svGrade: 'g', placement: 4, placementStatus: null, specialAward: null }],
    ]);

    const text = allText(CatalogueByClass({ show: makeShow(), entries, judgeResults }));

    expect(text).toContain('SG1');
    expect(text).toContain('SG2');
    expect(text).toContain('G1');
    expect(text).toContain('G2');
    // The restart proves it isn't just printing the overall placement number
    // relabelled — G1 (3rd overall) must NOT read "G3".
    expect(text).not.toContain('G3');
    expect(text).not.toContain('G4');

    // The grid holds catalogue number + grade ONLY — no dog name (Mandy
    // 2026-09-06: "the name is just a waste"). Exact line sequence per row:
    // ordinal, bare number, "Gr", rating.
    expect(text).toMatch(/1st\n1\nGr\nSG1\n/);
    expect(text).toMatch(/2nd\n2\nGr\nSG2\n/);
    expect(text).toMatch(/3rd\n3\nGr\nG1\n/);
    expect(text).toMatch(/4th\n4\nGr\nG2\n/);
    // The class listing above the grid is untouched — dog names still print
    // there exactly as before.
    expect(text).toContain('DOG 1');
    expect(text).toContain('DOG 2');
  });

  it('NO RESULT for one dog: that dog degrades to the exact same blank dots as the steward copy', () => {
    const entries = [makeEntry({ catalogueNumber: '1' }), makeEntry({ catalogueNumber: '2' })];
    // Only dog #1 has a recorded result — #2 hasn't been judged yet.
    const judgeResults = new Map<string, JudgeCopyResult>([
      [`1-${SHOW_CLASS_WORKING}`, { svGrade: 'sg', placement: 1, placementStatus: null, specialAward: null }],
    ]);

    const filled = allText(CatalogueByClass({ show: makeShow(), entries, judgeResults }));
    const blank = allText(CatalogueByClass({ show: makeShow(), entries, judgeResults: new Map() }));

    expect(filled).toContain('SG1');
    // The second (ungraded) slot still carries the ordinary write-in dots —
    // never a wrong or empty-looking grade.
    expect(filled).toContain('…');
    // Blank run (no results at all) must render identically to today's
    // steward copy for every class with no results.
    const blankNoProp = allText(CatalogueByClass({ show: makeShow(), entries }));
    expect(blank).toBe(blankNoProp);
  });

  it('ABSENT dog with no result: still lists the dog but leaves its placing blank', () => {
    const entries = [
      makeEntry({ catalogueNumber: '1' }),
      makeEntry({ catalogueNumber: '2' }), // absent, never judged — no result recorded
    ];
    const judgeResults = new Map<string, JudgeCopyResult>([
      [`1-${SHOW_CLASS_WORKING}`, { svGrade: 'v', placement: 1, placementStatus: null, specialAward: null }],
    ]);

    const text = allText(CatalogueByClass({ show: makeShow(), entries, judgeResults }));
    expect(text).toContain('DOG 2'); // still printed in the class list
    expect(text).toContain('V1');
    // Only one filled slot — the rest of the grid (1 more slot for dog #2)
    // stays blank rather than guessing.
    const dottedSlots = (text.match(/…/g) ?? []).length;
    expect(dottedSlots).toBeGreaterThan(0);
  });

  it('Junior Handling class: placings fill in with the catalogue number only — never the handler name', () => {
    // Mandy 2026-09-06, having seen a real render with names in the grid:
    // "I don't think we need the name on the results just the catalogue
    // number and grade as the name is just a [waste]". This supersedes the
    // team lead's earlier ask (2026-09-05) to put the handler's name in the
    // identity slot — the class listing above already names the handler;
    // the grid must not repeat it.
    const jhEntry = makeEntry({
      catalogueNumber: '10',
      entryType: 'junior_handler',
      dogName: 'Rex',
      jhHandlerName: 'Alexxa Cowan',
      classes: [{ name: 'JHA', sex: null, classNumber: null, classLabel: 'JHA', sortOrder: 100, showClassId: SHOW_CLASS_JH }],
    });
    const jhEntry2 = makeEntry({
      catalogueNumber: '11',
      entryType: 'junior_handler',
      dogName: 'Fido',
      jhHandlerName: 'Sam Swift',
      classes: [{ name: 'JHA', sex: null, classNumber: null, classLabel: 'JHA', sortOrder: 100, showClassId: SHOW_CLASS_JH }],
    });
    const judgeResults = new Map<string, JudgeCopyResult>([
      [`10-${SHOW_CLASS_JH}`, { svGrade: null, placement: 1, placementStatus: null, specialAward: null }],
      [`11-${SHOW_CLASS_JH}`, { svGrade: null, placement: 2, placementStatus: null, specialAward: null }],
    ]);

    const text = allText(CatalogueByClass({ show: makeShow(), entries: [jhEntry, jhEntry2], judgeResults }));
    // The grid: ordinal, bare catalogue number, "Gr", (blank — see next test).
    expect(text).toMatch(/1st\n10\nGr\n/);
    expect(text).toMatch(/2nd\n11\nGr\n/);
    // The class listing ABOVE the grid is untouched — it still names the
    // handler exactly as before (jhHandlerName renders as the entry's
    // headline, per renderEntry's isJH branch).
    expect(text).toMatch(/10\nAlexxa Cowan\n/);
    expect(text).toMatch(/11\nSam Swift\n/);
  });

  it('Junior Handling class: the grade slot stays blank — there is no SV grade for a handler, so never substitute the placement number', () => {
    // Team lead 2026-09-05, from a real render: JHB rendered "1st 74 GR 1" /
    // "2nd 73 GR 2" — computeSvClassRatings' ungraded-but-placed fallback
    // (plain placement number, meant for a results BADGE) leaked into the
    // grid's explicitly-labelled "Gr" slot, reading as a meaningless (and to
    // a child handler, faintly insulting) "Grade 1".
    const jhEntry = makeEntry({
      catalogueNumber: '73',
      entryType: 'junior_handler',
      jhHandlerName: 'Alexxa Cowan',
      classes: [{ name: 'JHB', sex: null, classNumber: null, classLabel: 'JHB', sortOrder: 101, showClassId: SHOW_CLASS_JH }],
    });
    const jhEntry2 = makeEntry({
      catalogueNumber: '74',
      entryType: 'junior_handler',
      jhHandlerName: 'Julia Sobolewska',
      classes: [{ name: 'JHB', sex: null, classNumber: null, classLabel: 'JHB', sortOrder: 101, showClassId: SHOW_CLASS_JH }],
    });
    const judgeResults = new Map<string, JudgeCopyResult>([
      [`73-${SHOW_CLASS_JH}`, { svGrade: null, placement: 2, placementStatus: null, specialAward: null }],
      [`74-${SHOW_CLASS_JH}`, { svGrade: null, placement: 1, placementStatus: null, specialAward: null }],
    ]);

    const text = allText(CatalogueByClass({ show: makeShow(), entries: [jhEntry, jhEntry2], judgeResults }));
    // The identity (bare number) IS filled — this class WAS judged...
    expect(text).toMatch(/1st\n74\nGr\n/);
    expect(text).toMatch(/2nd\n73\nGr\n/);
    // ...but the "Gr" slot for each of those two rows must be the ordinary
    // blank dots, never a bare "1" or "2".
    expect(text).toMatch(/1st\n74\nGr\n…\n/);
    expect(text).toMatch(/2nd\n73\nGr\n…\n/);
    expect(text).not.toContain('Gr\n1\n');
    expect(text).not.toContain('Gr\n2\n');
    // The class listing above still names both handlers.
    expect(text).toMatch(/73\nAlexxa Cowan\n/);
    expect(text).toMatch(/74\nJulia Sobolewska\n/);
  });

  it('withheld exhibitor: judge-copy fill-in never surfaces the redacted address', () => {
    const entry = makeEntry({
      catalogueNumber: '1',
      withholdFromPublication: true,
      owners: [{ title: null, name: 'Withheld Owner', address: '99 Confidential Close, Hidden Town, HI1 1DE', userId: null }],
    });
    const judgeResults = new Map<string, JudgeCopyResult>([
      [`1-${SHOW_CLASS_WORKING}`, { svGrade: 'v', placement: 1, placementStatus: null, specialAward: null }],
    ]);

    const text = allText(CatalogueByClass({ show: makeShow(), entries: [entry], judgeResults }));
    expect(text).not.toContain('Confidential Close');
    expect(text).not.toContain('Hidden Town');
    expect(text).toContain('address withheld');
    // The result still renders — withholding an address is not the same as
    // withholding the result.
    expect(text).toContain('V1');
  });
});
