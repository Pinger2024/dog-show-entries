import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

// Render React-PDF primitives as plain divs/spans so we can use
// renderToStaticMarkup and grep the resulting HTML for mandatory RKC
// clauses — same approach as schedule-rkc-compliance.test.ts, which is the
// closest existing pattern for asserting rendered PDF content.
vi.mock('@react-pdf/renderer', () => ({
  Document: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  Page: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  View: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  Text: ({ children, render }: { children?: React.ReactNode; render?: unknown }) => {
    if (render) return React.createElement('span');
    return React.createElement('span', null, children);
  },
  Image: () => null,
  Link: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('a', null, children),
  Svg: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('svg', null, children),
  Path: () => null,
  StyleSheet: { create: <T,>(s: T) => s },
  Font: {
    register: vi.fn(),
    registerHyphenationCallback: vi.fn(),
    registerEmojiSource: vi.fn(),
  },
}));

import { CoverPage, ShowParticularsContent, FrontMatterContent } from '@/components/catalogue/catalogue-front-matter';
import { CatalogueByClass } from '@/components/catalogue/catalogue-by-class';
import type { CatalogueShowInfo, CatalogueEntry, ShowClassInfo } from '@/components/catalogue/catalogue-types';

function baseShow(overrides: Partial<CatalogueShowInfo> = {}): CatalogueShowInfo {
  return {
    name: 'Test German Shepherd Dog Club Championship Show',
    showType: 'championship',
    showRuleset: 'rkc',
    showScope: 'single_breed',
    date: '2026-09-01',
    venue: 'Test Showground',
    venueAddress: 'Test Road, Test Town',
    organisation: 'Test German Shepherd Dog Club',
    kcLicenceNo: '1234',
    secretaryName: 'Jane Secretary',
    secretaryEmail: 'sec@test.example',
    dockingStatement: 'A dog docked on or after 6 April 2007 may not be entered for exhibition at this show.',
    totalClasses: 2,
    ...overrides,
  } as CatalogueShowInfo;
}

function renderCover(show: CatalogueShowInfo): string {
  return renderToStaticMarkup(CoverPage({ show }) as React.ReactElement);
}

function renderFrontMatter(show: CatalogueShowInfo): string {
  return renderToStaticMarkup(FrontMatterContent({ show, compact: false }) as React.ReactElement);
}

function renderParticulars(show: CatalogueShowInfo): string {
  return renderToStaticMarkup(ShowParticularsContent({ show }) as React.ReactElement);
}

function renderByClassDoc(show: CatalogueShowInfo, entries: CatalogueEntry[] = []): string {
  return renderToStaticMarkup(CatalogueByClass({ show, entries }) as React.ReactElement);
}

// Minimal single-breed championship classification: one Dog class, one
// Bitch class — enough for CatalogueByClass to inject empty classes via
// show.allShowClasses without needing real entries.
function championshipClasses(): ShowClassInfo[] {
  return [
    { className: 'Puppy Dog', classNumber: 1, classLabel: '1', sortOrder: 1, sex: 'dog', classDefinitionType: 'age' },
    { className: 'Puppy Bitch', classNumber: 2, classLabel: '2', sortOrder: 2, sex: 'bitch', classDefinitionType: 'age' },
  ];
}

describe('RKC catalogue compliance — cover designation (Mandy 2026-08-17)', () => {
  it('shows "CATALOGUE OF" plus the schedule\'s designation for a single-breed championship show', () => {
    const html = renderCover(baseShow());
    expect(html).toMatch(/CATALOGUE OF UNBENCHED BREED CHAMPIONSHIP SHOW/i);
  });

  it('shows the RKC held-under line matching the schedule\'s exact wording', () => {
    const html = renderCover(baseShow());
    expect(html).toMatch(/Held under Royal Kennel Club Limited Rules.*Regulations/i);
  });

  it('never shows two different "held under" citations on the same cover', () => {
    const html = renderCover(baseShow());
    expect(html.match(/Held under Royal Kennel Club/gi)).toHaveLength(1);
  });

  it('uses the open single-breed designation for an open show', () => {
    const html = renderCover(baseShow({ showType: 'open' }));
    expect(html).toMatch(/CATALOGUE OF UNBENCHED OPEN SINGLE BREED SHOW/i);
  });

  it('uses the all-breed general designation for a multi-breed championship show', () => {
    const html = renderCover(baseShow({ showType: 'championship', showScope: 'general' }));
    expect(html).toMatch(/CATALOGUE OF UNBENCHED GENERAL CHAMPIONSHIP SHOW/i);
  });

  it('places the designation ahead of the held-under line, and the held-under line ahead of the docking statement', () => {
    const html = renderCover(baseShow());
    const designation = html.search(/CATALOGUE OF/i);
    const heldUnder = html.search(/Held under Royal Kennel Club/i);
    const docking = html.search(/A dog docked on or after/i);
    expect(designation).toBeGreaterThan(-1);
    expect(designation).toBeLessThan(heldUnder);
    expect(heldUnder).toBeLessThan(docking);
  });

  it('does not render the RKC designation for a WUSV/SV regional show (RKC-only per Mandy)', () => {
    const html = renderCover(
      baseShow({
        showRuleset: 'wusv',
        organisation: 'Test GSD Regional Group',
        logoUrl: 'https://example.test/crest.png',
      }),
    );
    expect(html).not.toMatch(/CATALOGUE OF UNBENCHED/i);
  });

  it('does not crash when showType is missing (legacy/incomplete show data)', () => {
    expect(() => renderCover(baseShow({ showType: undefined }))).not.toThrow();
  });
});

describe('RKC catalogue compliance — docking statement (Mandy 2026-08-17)', () => {
  it('renders the docking statement prominently on the cover', () => {
    const html = renderCover(baseShow());
    expect(html).toMatch(/A dog docked on or after 6 April 2007/i);
  });

  it('no longer repeats the docking statement inside Show Particulars', () => {
    const html = renderParticulars(baseShow());
    expect(html).not.toMatch(/A dog docked on or after/i);
  });

  it('the full by-class catalogue document states the docking statement exactly once', () => {
    const html = renderByClassDoc(baseShow({ allShowClasses: championshipClasses() }));
    expect(html.match(/A dog docked on or after 6 April 2007/gi)).toHaveLength(1);
  });
});

describe('RKC catalogue compliance — Judges\' Welfare Commitment (Mandy 2026-08-17)', () => {
  it('renders the welfare undertaking wording exactly once', () => {
    const html = renderFrontMatter(baseShow());
    expect(html).toMatch(/Judges.*Welfare Commitment/i);
    expect(html.match(/judges must penalise any features or exaggerations/gi)).toHaveLength(1);
  });

  it('renders even when the show has no other show-information fields set (mandatory, not data-gated)', () => {
    // No welcomeNote/awardsDescription/additionalNotes/etc — ShowInformationContent
    // would return null entirely; the welfare block must not live inside that gate.
    const show = baseShow();
    const html = renderFrontMatter(show);
    expect(html).toMatch(/Judges.*Welfare Commitment/i);
  });

  it('places the welfare block ahead of Practical Information and Additional Notes', () => {
    const show = baseShow({ latestArrivalTime: '10:00am', additionalNotes: 'Parking is £5.' });
    const html = renderFrontMatter(show);
    const welfare = html.search(/All Judges at this show agree/i);
    const practical = html.search(/Practical Information/i);
    const notes = html.search(/Additional Notes/i);
    expect(welfare).toBeGreaterThan(-1);
    expect(welfare).toBeLessThan(practical);
    expect(welfare).toBeLessThan(notes);
  });

  it('still renders once when a secretary has typed the welfare wording into a custom statement', () => {
    const show = baseShow({
      customStatements: [
        'ALL JUDGES AT THIS SHOW AGREE TO ABIDE BY THE FOLLOWING STATEMENT: "IN ASSESSING DOGS, JUDGES MUST PENALISE ANY FEATURES OR EXAGGERATIONS WHICH THEY CONSIDER WOULD BE DETRIMENTAL TO THE SOUNDNESS, HEALTH OR WELL BEING OF THE DOG"',
        'ENTRY FEES CANNOT BE REFUNDED ONCE AN ENTRY HAS BEEN ACCEPTED',
      ],
    });
    const html = renderFrontMatter(show);
    expect(html.match(/judges must penalise any features or exaggerations/gi)).toHaveLength(1);
    // the OTHER custom statement is untouched by the dedupe
    expect(html).toMatch(/ENTRY FEES CANNOT BE REFUNDED/i);
  });
});

describe('RKC catalogue compliance — Challenge Certificate headers (Mandy 2026-08-17)', () => {
  it('shows CC — DOG and CC — BITCH headers for a single-breed championship show', () => {
    const show = baseShow({ allShowClasses: championshipClasses() });
    const html = renderByClassDoc(show);
    expect(html).toMatch(/CHALLENGE CERTIFICATE\s*[—–-]\s*DOG/i);
    expect(html).toMatch(/CHALLENGE CERTIFICATE\s*[—–-]\s*BITCH/i);
  });

  it('does NOT show CC headers for an open show', () => {
    const show = baseShow({ showType: 'open', allShowClasses: championshipClasses() });
    const html = renderByClassDoc(show);
    expect(html).not.toMatch(/CHALLENGE CERTIFICATE/i);
  });

  it('does not render a spurious CC — DOG header from a mis-tagged Junior Handling class (legacy sex=dog bug) when no real Dog breed classes exist', () => {
    // Old bulk-create logic sometimes stamped JH classes with sex='dog'/'bitch'
    // instead of leaving sex null (see the schedule's dedup comment). A naive
    // `sex === 'dog'` bucketing would wrongly treat this as the first Dog
    // breed class; the real isJuniorHandler predicate (via sectionClasses)
    // must exclude it.
    const classes: ShowClassInfo[] = [
      { className: 'Junior Handling', classNumber: null, classLabel: 'JHA', sortOrder: 0, sex: 'dog', classDefinitionType: 'junior_handler' },
      { className: 'Puppy Bitch', classNumber: 1, classLabel: '1', sortOrder: 1, sex: 'bitch', classDefinitionType: 'age' },
    ];
    const show = baseShow({ allShowClasses: classes });
    const html = renderByClassDoc(show);
    expect(html).not.toMatch(/CHALLENGE CERTIFICATE\s*[—–-]\s*DOG/i);
    expect(html).toMatch(/CHALLENGE CERTIFICATE\s*[—–-]\s*BITCH/i);
  });
});
