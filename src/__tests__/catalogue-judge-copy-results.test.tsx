import { describe, it, expect } from 'vitest';
import { CatalogueByClass, type JudgeCopyResult } from '@/components/catalogue/catalogue-by-class';
import type { CatalogueEntry, CatalogueShowInfo } from '@/components/catalogue/catalogue-types';
import { View, Text } from '@react-pdf/renderer';
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

/**
 * A layout-aware tree walker for the SV placings grid (2026-09-07: Mandy
 * asked for "the GR underneath the placing" and bigger/bolder judge-copy
 * fill-in text — neither is visible to `allText` above, which flattens
 * away all layout and style). Each `<Text>` leaf becomes a `TextNode`
 * carrying its own style plus a `parent` pointer up the `<View>` chain, so
 * a test can walk "what row is this text in, and what row/column wraps
 * that". Fragments and other non-View/Text components (Document, Page) are
 * transparent — they don't introduce a parent frame of their own.
 */
interface TextNode {
  kind: 'text';
  value: string;
  style: unknown;
  parent: ViewNode | null;
}
interface ViewNode {
  kind: 'view';
  style: unknown;
  parent: ViewNode | null;
}

function walkTree(node: unknown, parent: ViewNode | null, out: TextNode[]): void {
  if (node == null || typeof node === 'boolean') return;
  if (typeof node === 'string' || typeof node === 'number') return; // bare text with no <Text> wrapper — not a grid leaf
  if (Array.isArray(node)) {
    for (const child of node) walkTree(child, parent, out);
    return;
  }
  if (!isValidElement(node)) return;
  const el = node as ReactElement<any>;
  if (el.type === Text) {
    out.push({ kind: 'text', value: allText(el.props.children), style: el.props.style, parent });
    return;
  }
  if (el.type === View) {
    const viewNode: ViewNode = { kind: 'view', style: el.props.style, parent };
    walkTree(el.props.children, viewNode, out);
    return;
  }
  walkTree(el.props.children, parent, out);
}

/** Every `<Text>` leaf in `element`, in document order, with style + parent-row info. */
function collectTextNodes(element: unknown): TextNode[] {
  const out: TextNode[] = [];
  walkTree(element, null, out);
  return out;
}

/** The first leaf whose flattened text is exactly `value`. */
function findText(nodes: TextNode[], value: string): TextNode {
  const found = nodes.find((n) => n.value === value);
  if (!found) throw new Error(`No <Text> leaf with value ${JSON.stringify(value)}`);
  return found;
}

describe('CatalogueByClass — judge-copy results fill-in', () => {
  it('RESULTS SUPPLIED: fills the write-in grid with real placings and prints the BARE grade — no within-grade rank', () => {
    // 4 dogs: SG,SG,G,G placed 1..4. Mandy 2026-09-07: "for the results one
    // we don't need VP1, just VP because we have the catalogue number in the
    // 1st place" — so the grade line reads SG, SG, G, G, never SG1/SG2/G1/G2.
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

    expect(text).not.toContain('SG1');
    expect(text).not.toContain('SG2');
    expect(text).not.toContain('G1');
    expect(text).not.toContain('G2');

    // The grid holds catalogue number + BARE grade ONLY — no dog name (Mandy
    // 2026-09-06: "the name is just a waste") and no rank digit (Mandy
    // 2026-09-07). Exact line sequence per row: ordinal, bare number, "Gr",
    // bare grade.
    expect(text).toMatch(/1st\n1\nGr\nSG\n/);
    expect(text).toMatch(/2nd\n2\nGr\nSG\n/);
    expect(text).toMatch(/3rd\n3\nGr\nG\n/);
    expect(text).toMatch(/4th\n4\nGr\nG\n/);
    // The class listing above the grid is untouched — dog names still print
    // there exactly as before.
    expect(text).toContain('DOG 1');
    expect(text).toContain('DOG 2');
  });

  it('TWO DOGS, SAME GRADE: both print the bare grade with no digits, even though SV ranks within a grade elsewhere', () => {
    // Same grade twice would previously read VP1/VP2 (within-grade rank) —
    // Mandy's ask is specifically that the rank digit disappears here, so
    // both slots must read the identical bare "VP".
    const entries = [makeEntry({ catalogueNumber: '1' }), makeEntry({ catalogueNumber: '2' })];
    const judgeResults = new Map<string, JudgeCopyResult>([
      [`1-${SHOW_CLASS_WORKING}`, { svGrade: 'vp', placement: 1, placementStatus: null, specialAward: null }],
      [`2-${SHOW_CLASS_WORKING}`, { svGrade: 'vp', placement: 2, placementStatus: null, specialAward: null }],
    ]);

    const text = allText(CatalogueByClass({ show: makeShow(), entries, judgeResults }));

    expect(text).not.toContain('VP1');
    expect(text).not.toContain('VP2');
    expect(text).toMatch(/1st\n1\nGr\nVP\n/);
    expect(text).toMatch(/2nd\n2\nGr\nVP\n/);
    expect((text.match(/\nVP\n/g) ?? []).length).toBe(2);
  });

  it('NO RESULT for one dog: that dog degrades to the exact same blank dots as the steward copy', () => {
    const entries = [makeEntry({ catalogueNumber: '1' }), makeEntry({ catalogueNumber: '2' })];
    // Only dog #1 has a recorded result — #2 hasn't been judged yet.
    const judgeResults = new Map<string, JudgeCopyResult>([
      [`1-${SHOW_CLASS_WORKING}`, { svGrade: 'sg', placement: 1, placementStatus: null, specialAward: null }],
    ]);

    const filled = allText(CatalogueByClass({ show: makeShow(), entries, judgeResults }));
    const blank = allText(CatalogueByClass({ show: makeShow(), entries, judgeResults: new Map() }));

    expect(filled).toMatch(/Gr\nSG\n/);
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
    expect(text).toMatch(/Gr\nV\n/);
    expect(text).not.toContain('V1');
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
    expect(text).toMatch(/1st\n74\nGr\n…+\n/);
    expect(text).toMatch(/2nd\n73\nGr\n…+\n/);
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
    expect(text).toMatch(/Gr\nV\n/);
  });
});

/**
 * Mandy 2026-09-07, after reviewing the judge-copy PDF: "can you make the
 * font a bit bigger and bold on this catalogue and the placing and grading
 * on the main catalogue bolder or maybe the GR underneath the placing?"
 * — two changes: (1) GR moves to its own line under the placing line, on
 * BOTH the plain wusv catalogue and judge-copy, and (2) judge-copy's
 * filled-in catalogue number + grade get noticeably bigger and bold.
 * `allText` above can't see either change (it flattens away layout and
 * style), so these use the `collectTextNodes` walker instead.
 */
describe('CatalogueByClass — SV placings grid: GR under the placing line, judge-copy bold/bigger', () => {
  it('PLAIN wusv catalogue (no judgeResults): GR sits on its own row, stacked under the placing row', () => {
    const entries = [makeEntry({ catalogueNumber: '1' }), makeEntry({ catalogueNumber: '2' })];
    const nodes = collectTextNodes(CatalogueByClass({ show: makeShow(), entries }));

    const ordinal = findText(nodes, '1st');
    const gradeLabel = findText(nodes, 'Gr');
    const placingRow = ordinal.parent;
    const gradeRow = gradeLabel.parent;
    expect(placingRow).not.toBeNull();
    expect(gradeRow).not.toBeNull();
    // GR is NOT beside the placing (that would mean sharing its row)...
    expect(gradeRow).not.toBe(placingRow);
    // ...it's a second horizontal row...
    expect(gradeRow!.style).toMatchObject({ flexDirection: 'row' });
    expect(placingRow!.style).toMatchObject({ flexDirection: 'row' });
    // ...stacked in a COLUMN under the first row, both inside the same slot.
    expect(placingRow!.parent).toBe(gradeRow!.parent);
    expect(placingRow!.parent!.style).toMatchObject({ flexDirection: 'column' });
  });

  it('JUDGE-COPY (filled): GR still sits under the placing line, same as the plain catalogue', () => {
    const entries = [makeEntry({ catalogueNumber: '1' }), makeEntry({ catalogueNumber: '2' })];
    const judgeResults = new Map<string, JudgeCopyResult>([
      [`1-${SHOW_CLASS_WORKING}`, { svGrade: 'sg', placement: 1, placementStatus: null, specialAward: null }],
    ]);
    const nodes = collectTextNodes(CatalogueByClass({ show: makeShow(), entries, judgeResults }));

    const ordinal = findText(nodes, '1st');
    const gradeLabel = findText(nodes, 'Gr');
    expect(gradeLabel.parent).not.toBe(ordinal.parent);
    expect(gradeLabel.parent!.style).toMatchObject({ flexDirection: 'row' });
    expect(ordinal.parent!.style).toMatchObject({ flexDirection: 'row' });
    expect(ordinal.parent!.parent).toBe(gradeLabel.parent!.parent);
    expect(ordinal.parent!.parent!.style).toMatchObject({ flexDirection: 'column' });
  });

  it('JUDGE-COPY: the filled catalogue number and grade render noticeably bigger and bold', () => {
    // Catalogue numbers deliberately distinct from any other number printed
    // in the document (e.g. the class listing's own catalogue-number column)
    // so a same-parent lookup — not a global text search — pins down which
    // "42" is the grid's write-in.
    const entries = [
      makeEntry({ catalogueNumber: '42' }),
      makeEntry({ catalogueNumber: '43' }),
    ];
    const judgeResults = new Map<string, JudgeCopyResult>([
      [`42-${SHOW_CLASS_WORKING}`, { svGrade: 'sg', placement: 1, placementStatus: null, specialAward: null }],
    ]);
    const nodes = collectTextNodes(CatalogueByClass({ show: makeShow(), entries, judgeResults }));

    // The 1st-place row: ordinal "1st" plus its sibling, the filled-in
    // catalogue number write-in.
    const ordinal1 = findText(nodes, '1st');
    const filledNumber = nodes.find((n) => n.parent === ordinal1.parent && n !== ordinal1)!;
    expect(filledNumber.value).toBe('42');
    // The grade row underneath it: "Gr" label plus its sibling, the rating.
    const gradeLabel1 = nodes.filter((n) => n.value === 'Gr')[0]!;
    const filledGrade = nodes.find((n) => n.parent === gradeLabel1.parent && n !== gradeLabel1)!;
    expect(filledGrade.value).toBe('SG');

    for (const leaf of [filledNumber, filledGrade]) {
      const style = leaf.style as { fontSize?: number; fontWeight?: string };
      expect(style.fontWeight).toBe('bold');
      // ~1.5x the blank write-in size (8pt) — target from Mandy's request.
      expect(style.fontSize).toBeGreaterThanOrEqual(11);
    }

    // The still-blank 2nd-place slot (dog #43, not yet judged) keeps the
    // ORIGINAL small, non-bold write-in style — only real results get the
    // bigger/bold treatment.
    const ordinal2 = findText(nodes, '2nd');
    const blankNumber = nodes.find((n) => n.parent === ordinal2.parent && n !== ordinal2)!;
    expect(blankNumber.value).toMatch(/^…+$/);
    const blankStyle = blankNumber.style as { fontSize?: number; fontWeight?: string };
    expect(blankStyle.fontWeight).not.toBe('bold');
    expect(blankStyle.fontSize).toBeLessThan(11);
  });

  it('PLAIN wusv catalogue: the blank write-in dots stay the small non-bold style (no accidental bolding)', () => {
    const entries = [makeEntry({ catalogueNumber: '1' })];
    const nodes = collectTextNodes(CatalogueByClass({ show: makeShow(), entries }));
    const dotsLeaves = nodes.filter((n) => /^…+$/.test(n.value));
    expect(dotsLeaves.length).toBeGreaterThan(0);
    for (const leaf of dotsLeaves) {
      const style = leaf.style as { fontSize?: number; fontWeight?: string };
      expect(style.fontWeight).not.toBe('bold');
      expect(style.fontSize).toBeLessThan(11);
    }
  });
});
