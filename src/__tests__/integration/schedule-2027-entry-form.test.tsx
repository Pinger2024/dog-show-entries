import { describe, it, expect } from 'vitest';
import { ShowSchedule } from '@/components/schedule/show-schedule';
import type { ScheduleShowInfo, ScheduleClass, ScheduleJudge } from '@/components/schedule/shared/types';

/**
 * The printed postal entry form across the 2027 F-regulation cut-over — the
 * exhibitor declaration (F(1)8.h) and the INSTRUCTIONS paragraph (F(1)8.e).
 *
 * Why this test exists rather than a golden fixture: the entry form only
 * renders when a show accepts postal entries, and **not one** of the golden
 * fixtures has `acceptsPostalEntries: true`, so nothing in
 * `src/__tests__/golden/` exercises this page in either year. Checked
 * 2026-10-26 while shipping the 2027 wording; without this test the
 * declaration a postal exhibitor signs had no coverage at all.
 *
 * `ShowSchedule` is a plain function component with no hooks, so it can be
 * called directly and its element tree walked — the same approach as
 * show-schedule-section-order.test.tsx. This pins the WORDING and which page
 * it lands on, not the pixel layout.
 */

/**
 * Walk a React element tree and collect every string it will print.
 *
 * Nested function components (`<RkcNumberedRules>`, `<RkcPostalEntryInstructions>`)
 * are INVOKED, not just descended into — without that their text isn't in the
 * tree at all and this test would pass while printing nothing, which is
 * exactly what happened on the first run. Every component in the schedule's
 * PDF tree is a plain hook-free function, so calling it directly is safe.
 */
function collectText(node: unknown, out: string[] = []): string[] {
  if (node == null || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out);
    return out;
  }
  if (typeof node === 'object' && node !== null && 'type' in node) {
    const el = node as { type: unknown; props?: Record<string, unknown> };
    if (typeof el.type === 'function') {
      const rendered = (el.type as (p: unknown) => unknown)(el.props ?? {});
      collectText(rendered, out);
      return out;
    }
  }
  if (typeof node === 'object' && node !== null && 'props' in node) {
    const el = node as { props?: { children?: unknown } };
    if (el.props?.children !== undefined) collectText(el.props.children, out);
  }
  return out;
}

const judges: ScheduleJudge[] = [
  { name: 'Hugh De Zutter', breeds: ['German Shepherd Dog'], sex: null, role: 'Dogs & Bitches', displayLabel: 'Hugh De Zutter — Dogs & Bitches' },
];

const classes: ScheduleClass[] = ['Baby Puppy', 'Minor Puppy', 'Puppy', 'Junior', 'Yearling', 'Post Graduate', 'Limit', 'Open', 'Veteran']
  .flatMap((className, i) => (['dog', 'bitch'] as const).map((sex, j) => ({
    classNumber: i * 2 + j + 1,
    classLabel: String(i * 2 + j + 1),
    className,
    classDescription: null,
    sex,
    breedName: 'German Shepherd Dog',
    classType: 'age',
  })));

/** A single-breed championship show that takes postal entries. */
function postalShow(startDate: string, postalClose: string): ScheduleShowInfo {
  return {
    slug: 'postal-entry-form-check',
    name: 'Postal Entry Form Check Championship Show',
    showType: 'championship',
    showScope: 'single_breed',
    date: startDate,
    endDate: startDate,
    startTime: '9:00',
    entriesOpenDate: null,
    entryCloseDate: postalClose,
    postalCloseDate: postalClose,
    kcLicenceNo: null,
    secretaryEmail: null,
    secretaryName: 'Mrs A Secretary',
    secretaryAddress: '1 Ring Lane, Showtown',
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
    acceptsPostalEntries: true,
    showRuleset: 'rkc',
    breedName: 'German Shepherd Dog',
    scheduleData: null,
    organisation: {
      name: 'Test German Shepherd Dog Club',
      contactEmail: null,
      contactPhone: null,
      website: null,
      logoUrl: null,
    },
    venue: null,
  };
}

/**
 * All the schedule's text as one string. Fragments are joined with a space
 * and runs of whitespace collapsed: a JSX interpolation such as "Puppies under
 * {puppyAge} months" arrives as three fragments that the PDF renders with
 * single spaces, so this normalisation compares wording, never spacing.
 */
function scheduleText(startDate: string, postalClose: string): string {
  return collectText(ShowSchedule({ show: postalShow(startDate, postalClose), classes, judges }))
    .join(' ')
    .replace(/\s+/g, ' ');
}

const SCHEDULE_COMPLIANCE = 'and to comply with the requirements of the schedule,';
const SAE = 'Exhibitors who require acknowledgement of receipt are advised to include a stamped, self-addressed envelope with their entry.';
const PROOF_OF_POSTAGE = 'In case of dispute proof of postage of such applications may be required by The Royal Kennel Club.';

describe('printed postal entry form — 2026 regulations', () => {
  const text = scheduleText('2026-08-09', '2026-07-01T23:59:00.000Z');

  it('prints the declaration without the schedule-compliance clause', () => {
    expect(text).toContain('I/We also undertake to abide by the Regulations of this Show and not to bring to the Show');
    expect(text).not.toContain(SCHEDULE_COMPLIANCE);
  });

  it('keeps the proof-of-postage sentence and no SAE advice', () => {
    expect(text).toContain(PROOF_OF_POSTAGE);
    expect(text).not.toContain(SAE);
  });
});

describe('printed postal entry form — 2027 regulations', () => {
  const text = scheduleText('2027-03-06', '2027-02-01T23:59:00.000Z');

  it('prints the F(1)8.h schedule-compliance clause in the declaration', () => {
    expect(text).toContain(
      'I/We also undertake to abide by the Regulations of this Show and to comply with the requirements of the schedule, and not to bring to the Show',
    );
  });

  it('replaces proof of postage with the SAE advice — F(1)8.e', () => {
    expect(text).toContain(SAE);
    expect(text).not.toContain(PROOF_OF_POSTAGE);
  });

  it('still prints the rest of the mandatory entry-form text', () => {
    // The 2027 specimen keeps all of this; the amendment only swapped one
    // sentence, so a regression here would mean the paragraph was rewritten
    // rather than edited.
    expect(text).toContain('This form must be used by one person only (or partnership).');
    expect(text).toContain('On no account will entries be accepted without fees.');
    expect(text).toContain('PLEASE CHECK ALL DETAILS BEFORE POSTING.');
    expect(text).toContain('Puppies under 4 months of age on the first day of the Show cannot be entered for competition.');
  });

  it('carries the 2027 Baby Puppy and objection wording too', () => {
    expect(text).toContain('Baby Puppies must not be entered in any other classes at a show.');
    expect(text).toContain('Any individual has the right to lodge an objection to a dog, only if he/she is the owner or handler');
  });
});
