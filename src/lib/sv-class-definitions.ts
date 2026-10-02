/**
 * SV/WUSV class definitions table — copy for the SvShowSchedule eligibility
 * page. Mirrors the RKC-side definitions in `rkc-class-definitions.ts`.
 *
 * Source: Sieger Editorial design brief + GSDL-BRG / WUSV reference. Baby
 * Puppy IS a numbered class when the club runs it (it leads the numbering) —
 * matches sv-classification.ts (Amanda's correction, Mandy 2026-07-06).
 */

export interface SvClassDefinition {
  code: string;
  age: string;
  reqs: string;
  /** True for classes not part of the numbered 1–12 block. Rendered dimmed
   *  with a "Not numbered" eyebrow on the eligibility page. */
  excluded?: boolean;
}

export const SV_CLASS_DEFINITIONS: SvClassDefinition[] = [
  {
    code: 'Baby Puppy',
    age: '4 – 6 mths',
    reqs: 'No health requirements.',
  },
  { code: 'Minor Puppy', age: '6 – 9 mths', reqs: 'No health requirements.' },
  { code: 'Puppy', age: '9 – 12 mths', reqs: 'No health requirements.' },
  {
    code: 'Junior',
    age: '12 – 18 mths',
    reqs: 'Hip/elbow scores not required, but disclose if held. Gun test from 12 mths.',
  },
  {
    code: 'Yearling',
    age: '18 – 24 mths',
    reqs: 'Health test scores mandatory. DNA recording mandatory.',
  },
  {
    code: 'Adult',
    age: '24 mths +',
    reqs:
      'Health + DNA mandatory. Dogs born on or after 1 Jan 2025 require an SV character assessment.',
  },
  {
    code: 'Working',
    age: '24 mths +',
    reqs:
      'All of Adult + a Training Degree SchH1 / VPG1 / IGP1 / ZAP or equivalent. Subject to off-lead gaiting.',
  },
];

/** Static German name + age range for the breed-classification page. Matches
 *  the labels in the Sieger Editorial design. Keys are the displayName a
 *  ScheduleClass collapses to (after the "SV " prefix is stripped). */
export const SV_AGE_LABELS: Record<string, { german?: string; ageRange: string }> = {
  'Minor Puppy': { ageRange: '6 – 9 mths' },
  Puppy: { ageRange: '9 – 12 mths' },
  Junior: { german: 'Jugend', ageRange: '12 – 18 mths' },
  Yearling: { german: 'Junghund', ageRange: '18 – 24 mths' },
  Adult: { ageRange: '24 mths +' },
  Working: { german: 'Gebrauchshund', ageRange: '24 mths +' },
};
