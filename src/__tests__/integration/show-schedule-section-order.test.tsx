import { describe, it, expect } from 'vitest';
import { ShowSchedule } from '@/components/schedule/show-schedule';
import { TwoColSectionHeader } from '@/components/schedule/shared/elements';
import type { ScheduleShowInfo, ScheduleClass, ScheduleJudge } from '@/components/schedule/shared/types';

/**
 * Regression guard for the printed Schedule's Classification page section
 * order. The secretary confirmed Special Award Classes run before Junior
 * Handling (in the lunch break, ahead of the JH classes) — the same order
 * the Standard Catalogue and Stewards' Catalogue have always used. The
 * schedule had this backwards until it was corrected in
 * `src/components/schedule/show-schedule.tsx`.
 *
 * `sectionClasses` (lib/class-labels.ts) governs BUCKETING only, not
 * layout — `ShowSchedule` renders its Classification page from four
 * explicit JSX blocks (Mixed, Dog|Bitch, Special Award Classes, Junior
 * Handling) in whatever order the component author wrote them, so a test
 * that only pins `sectionClasses`' returned array order does NOT protect
 * against someone swapping those two JSX blocks back — every other test
 * would still pass. This test renders the actual component tree and reads
 * off the real render order.
 *
 * `ShowSchedule` is a plain function component with no hooks, so it can be
 * called directly (no test renderer needed) — the return value is the same
 * React element tree react-pdf serialises to PDF, walked here in document
 * order.
 */

// Minimal helper to walk a React element tree depth-first and collect the
// `title` prop of every `TwoColSectionHeader` in document order — that
// component is the section-heading primitive used by the Classification
// page's Mixed / Dog / Bitch / Special Award Classes / Junior Handling
// blocks, so its title order IS the section order that ends up in the PDF.
function collectSectionHeaderTitles(node: unknown, out: string[] = []): string[] {
  if (node == null || typeof node === 'boolean') return out;
  if (Array.isArray(node)) {
    for (const child of node) collectSectionHeaderTitles(child, out);
    return out;
  }
  if (typeof node === 'object' && node !== null && 'type' in node) {
    const el = node as { type: unknown; props?: { title?: string; children?: unknown } };
    if (el.type === TwoColSectionHeader && typeof el.props?.title === 'string') {
      out.push(el.props.title);
    }
    if (el.props?.children !== undefined) {
      collectSectionHeaderTitles(el.props.children, out);
    }
  }
  return out;
}

const AGE_NAMES = [
  'Baby Puppy', 'Minor Puppy', 'Puppy', 'Junior', 'Yearling',
  'Special Long Coat Yearling', 'Post Graduate', 'Limit', 'Open',
  'Special Long Coat Open', 'Veteran',
];

function southWesternClasses(): ScheduleClass[] {
  const classes: ScheduleClass[] = [];
  let n = 1;
  for (const sex of ['dog', 'bitch'] as const) {
    for (const name of AGE_NAMES) {
      classes.push({
        classNumber: n,
        classLabel: String(n),
        className: name,
        classDescription: null,
        sex,
        breedName: 'German Shepherd Dog',
        classType: 'age',
      });
      n++;
    }
  }
  classes.push({
    classNumber: n,
    classLabel: 'JHA',
    className: 'JHA Handling (6-11)',
    classDescription: null,
    sex: null,
    breedName: null,
    classType: 'junior_handler',
  });
  n++;
  classes.push({
    classNumber: n,
    classLabel: 'JHB',
    className: 'JHA Handling (12-16)',
    classDescription: null,
    sex: null,
    breedName: null,
    classType: 'junior_handler',
  });
  n++;
  const sacNames = ['Special Award Class - Junior', 'Special Award Class - Post Graduate', 'Special Award Class - Open'];
  const sacLabels = ['A', 'B', 'C'];
  sacNames.forEach((name, i) => {
    classes.push({
      classNumber: null,
      classLabel: sacLabels[i]!,
      className: name,
      classDescription: null,
      sex: null,
      breedName: 'German Shepherd Dog',
      classType: 'special',
    });
  });
  return classes;
}

const judges: ScheduleJudge[] = [
  { name: 'Hugh De Zutter', breeds: ['German Shepherd Dog'], sex: null, role: 'Dogs & Bitches', displayLabel: 'Hugh De Zutter — Dogs & Bitches' },
  { name: 'Mandy McAteer', breeds: [], sex: null, role: 'Junior Handling', displayLabel: 'Mandy McAteer — Junior Handling' },
  { name: 'Ms K Salamon', breeds: [], sex: null, role: 'Special Awards Classes', displayLabel: 'Ms K Salamon — Special Awards Classes' },
];

const show: ScheduleShowInfo = {
  slug: 'south-western-gsd-2026',
  name: 'South Western GSD 55th Anniversary Championship Show',
  showType: 'championship',
  showScope: 'single_breed',
  date: '2026-08-09',
  endDate: '2026-08-09',
  startTime: '9:00',
  entriesOpenDate: null,
  entryCloseDate: null,
  postalCloseDate: null,
  kcLicenceNo: null,
  secretaryEmail: null,
  secretaryName: null,
  secretaryAddress: null,
  secretaryPhone: null,
  showOpenTime: '8:00',
  onCallVet: null,
  description: null,
  firstEntryFee: 2000,
  subsequentEntryFee: 1000,
  nfcEntryFee: null,
  juniorHandlerFee: null,
  multiDogThreshold: null,
  multiDogPackagePence: null,
  discountGroups: [],
  acceptsPostalEntries: false,
  showRuleset: 'rkc',
  breedName: 'German Shepherd Dog',
  scheduleData: null,
  organisation: {
    name: 'South Western German Shepherd Dog Club',
    contactEmail: null,
    contactPhone: null,
    website: null,
    logoUrl: null,
  },
  venue: null,
};

describe('ShowSchedule Classification page — section order', () => {
  it('renders Special Award Classes before Junior Handling — the secretary’s confirmed running order', () => {
    const tree = ShowSchedule({ show, classes: southWesternClasses(), judges });
    const titles = collectSectionHeaderTitles(tree);

    expect(titles).toContain('Special Award Classes');
    expect(titles).toContain('Junior Handling');

    const specialIdx = titles.indexOf('Special Award Classes');
    const jhIdx = titles.indexOf('Junior Handling');
    expect(specialIdx).toBeLessThan(jhIdx);
  });

  it('renders every Classification section, Mixed → Dog/Bitch table → Special Award Classes → Junior Handling', () => {
    const tree = ShowSchedule({ show, classes: southWesternClasses(), judges });
    const titles = collectSectionHeaderTitles(tree);
    // "Mixed" is the catch-all for non-JH, non-SAC sex-neutral classes — none
    // in this fixture, so it's absent. Dog/Bitch render as a two-column
    // table (no TwoColSectionHeader), so only Special and JH appear here.
    expect(titles).toEqual(['Special Award Classes', 'Junior Handling']);
  });
});
