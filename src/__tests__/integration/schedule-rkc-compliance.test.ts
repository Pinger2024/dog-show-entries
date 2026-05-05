import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

// Render React-PDF primitives as plain divs so we can use renderToStaticMarkup
// and grep the resulting HTML for mandatory RKC clauses.
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
  StyleSheet: { create: <T,>(s: T) => s },
  Font: {
    register: vi.fn(),
    registerHyphenationCallback: vi.fn(),
    registerEmojiSource: vi.fn(),
  },
}));

import { ShowSchedule, type ScheduleShowInfo, type ScheduleClass, type ScheduleJudge } from '@/components/schedule/show-schedule';

function baseShow(overrides: Partial<ScheduleShowInfo> = {}): ScheduleShowInfo {
  return {
    slug: 'test-show',
    name: 'Test Champ Show',
    showType: 'championship',
    showScope: 'all_breed',
    date: '2026-06-01',
    endDate: '2026-06-01',
    startTime: '9:30',
    entriesOpenDate: '2026-04-01',
    entryCloseDate: '2026-05-15',
    postalCloseDate: '2026-05-15',
    kcLicenceNo: '1234',
    secretaryEmail: 'sec@test.example',
    secretaryName: 'Jane Secretary',
    secretaryAddress: '1 Test Lane',
    secretaryPhone: '01234 567890',
    showOpenTime: '8:00',
    onCallVet: 'Test Vet Practice',
    description: null,
    firstEntryFee: 2500,
    subsequentEntryFee: 2000,
    nfcEntryFee: 500,
    juniorHandlerFee: 0,
    acceptsPostalEntries: true,
    scheduleData: {
      country: 'england',
      publicAdmission: true,
      wetWeatherAccommodation: true,
      isBenched: false,
      acceptsNfc: true,
      officers: [{ name: 'A. Officer', position: 'Chairman' }],
      showManager: 'B. Manager',
    } as ScheduleShowInfo['scheduleData'],
    organisation: {
      name: 'Test Society',
      contactEmail: 'club@test.example',
      contactPhone: null,
      website: null,
      logoUrl: null,
    },
    venue: { name: 'Test Hall', address: 'Test Road', postcode: 'AB1 2CD' },
    ...overrides,
  };
}

const baseClasses: ScheduleClass[] = [
  { classNumber: 1, classLabel: '1', className: 'Puppy', classDescription: null, sex: 'dog', breedName: 'Test Breed', classType: 'age' },
];

const baseJudges: ScheduleJudge[] = [
  { name: 'Mr J Judge', breeds: ['Test Breed'], displayLabel: 'Mr J Judge — Test Breed' },
];

function render(show: ScheduleShowInfo = baseShow()): string {
  const tree = ShowSchedule({ show, classes: baseClasses, judges: baseJudges });
  return renderToStaticMarkup(tree as React.ReactElement);
}

describe('RKC schedule compliance — mandatory clauses', () => {
  const html = render();

  // ── Foundational liability protection ──────────────────────────────────────

  it('includes the joint-and-several officer responsibility paragraph', () => {
    expect(html).toMatch(/jointly and severally responsible/i);
    expect(html).toMatch(/F4 and F5/);
  });

  it('includes the "Committee not responsible for loss/damage/injury" disclaimer', () => {
    expect(html).toMatch(/Committee will not be responsible for the loss or damage/i);
    expect(html).toMatch(/personal injury whether arising from accident or any other cause whatsoever/i);
  });

  it('states the show is held under RKC Rules & Show Regulations F(1)', () => {
    expect(html).toMatch(/Held under Royal Kennel Club Rules.*Show Regulations F\(1\)/i);
  });

  // ── Judges' welfare undertaking (mandatory) ────────────────────────────────

  it('includes the judges welfare undertaking statement', () => {
    expect(html).toMatch(/judges must penalise any features or exaggerations/i);
    expect(html).toMatch(/soundness, health and well being of the dog/i);
  });

  // ── Numbered Rules (every show must have them) ─────────────────────────────

  it('Rule 4 includes the vet/show-management early-removal exception', () => {
    expect(html).toMatch(/written order of the veterinary surgeon/i);
    expect(html).toMatch(/exceptional and unforeseen circumstances which must be reported/i);
  });

  it('Rule 8 uses the four-month threshold (not the contradictory six-month one)', () => {
    expect(html).toMatch(/under four calendar months/i);
    expect(html).not.toMatch(/under 6 calendar months of age on the first day of the Show is eligible for exhibition/i);
  });

  it('Rule 9 forbids mating of bitches in the precincts', () => {
    expect(html).toMatch(/mating of bitches within the precincts/i);
  });

  it('Rule 13 has the 10-minute Best in Show / Group admission limit', () => {
    expect(html).toMatch(/ten minutes has elapsed/i);
  });

  it('Rule 14 forbids picking up dogs by tails and leads', () => {
    expect(html).toMatch(/Exhibitors must not pick up dogs by their tails and leads/i);
  });

  it('Rule 15 references RKC F (Annex B) Preparation regulations', () => {
    expect(html).toMatch(/Regulation F.*Annex B.*Preparation of Dogs for Exhibition/i);
  });

  it('Rule 17 prohibits pinch / electronic shock / prong collars', () => {
    expect(html).toMatch(/pinch collars, electronic shock collars, or prong collars/i);
  });

  // ── Additional Rules (i–xi) ────────────────────────────────────────────────

  it('Additional Rule (i) covers substitute judges', () => {
    expect(html).toMatch(/Should any judge be prevented from fulfilling their engagement/i);
  });

  it('Additional Rule (ii) covers dog fouling at the venue', () => {
    expect(html).toMatch(/remove as soon as possible any fouling/i);
  });

  it('Additional Rule (vii) allows exclusion of unfit dogs', () => {
    expect(html).toMatch(/not in.*opinion of.*Show Secretary.*Show Manager.*Judge.*fit state/i);
  });

  // ── Cover page mandatory statements ────────────────────────────────────────

  it('includes a docking statement on the cover (England paid-admission default)', () => {
    expect(html).toMatch(/A dog docked on or after 6 April 2007/i);
  });

  // ── Hot weather warning ────────────────────────────────────────────────────

  it('includes the forcible-entry hot-vehicle warning', () => {
    expect(html).toMatch(/FORCIBLE ENTRY TO YOUR VEHICLE MAY BE NECESSARY/i);
  });

  // ── F(B) Preparation Regulations page ──────────────────────────────────────

  it('includes the F(B) Preparation regulations page', () => {
    expect(html).toMatch(/These Regulations must be observed when a dog is prepared/i);
    expect(html).toMatch(/chalking, powdering or spraying/i);
  });

  // ── Class definitions preamble ─────────────────────────────────────────────

  it('explains how Challenge Certificate counts towards Champion title', () => {
    expect(html).toMatch(/Challenge Certificate includes any.*award that counts towards the title of Champion/i);
  });

  it('includes the wins-counted-up-to-7-days-before-closing rule', () => {
    expect(html).toMatch(/seventh day before the first closing date/i);
  });

  // ── Withdrawal / Transfer mechanics ────────────────────────────────────────

  it('describes Withdrawal and Transfer options for ineligible exhibits', () => {
    expect(html).toMatch(/Withdrawal/);
    expect(html).toMatch(/Transfer/);
    expect(html).toMatch(/no equivalent class.*Open class/i);
  });
});

describe('RKC schedule compliance — Northern Ireland docking branch', () => {
  it('uses the NI-specific docking statement when country is northern_ireland and public admission', () => {
    const show = baseShow();
    show.scheduleData = {
      ...show.scheduleData,
      country: 'northern_ireland',
      publicAdmission: true,
    } as ScheduleShowInfo['scheduleData'];
    const html = renderToStaticMarkup(
      ShowSchedule({ show, classes: baseClasses, judges: baseJudges }) as React.ReactElement,
    );
    expect(html).toMatch(/A dog which had its tail docked on or after 1 January 2013/i);
  });

  it('falls back to the generic statement when no public admission', () => {
    const show = baseShow();
    show.scheduleData = {
      ...show.scheduleData,
      country: 'scotland',
      publicAdmission: false,
    } as ScheduleShowInfo['scheduleData'];
    const html = renderToStaticMarkup(
      ShowSchedule({ show, classes: baseClasses, judges: baseJudges }) as React.ReactElement,
    );
    expect(html).toMatch(/Only undocked dogs and legally docked dogs/i);
  });
});

describe('RKC schedule compliance — dynamic class definitions', () => {
  function renderWithClasses(classes: ScheduleClass[]): string {
    return renderToStaticMarkup(
      ShowSchedule({ show: baseShow(), classes, judges: baseJudges }) as React.ReactElement,
    );
  }

  it('includes definitions only for classes actually scheduled (Mid Limit case)', () => {
    const html = renderWithClasses([
      { classNumber: 1, classLabel: '1', className: 'Mid Limit', classDescription: null, sex: 'dog', breedName: 'Test', classType: 'achievement' },
      { classNumber: 2, classLabel: '2', className: 'Open', classDescription: null, sex: 'dog', breedName: 'Test', classType: 'achievement' },
    ]);
    expect(html).toMatch(/MID LIMIT:/);
    expect(html).toMatch(/won 3 or more CC\/CACIB\/CAC\/Green Stars or won five or more First Prizes/);
    expect(html).toMatch(/OPEN:/);
    // Should NOT include classes not scheduled
    expect(html).not.toMatch(/MAIDEN:/);
    expect(html).not.toMatch(/POST GRADUATE:/);
  });

  it('includes Maiden, Undergraduate, Beginners definitions when scheduled', () => {
    const html = renderWithClasses([
      { classNumber: 1, classLabel: '1', className: 'Maiden', classDescription: null, sex: 'dog', breedName: 'Test', classType: 'achievement' },
      { classNumber: 2, classLabel: '2', className: 'Undergraduate', classDescription: null, sex: 'dog', breedName: 'Test', classType: 'achievement' },
      { classNumber: 3, classLabel: '3', className: 'Beginners', classDescription: null, sex: 'dog', breedName: 'Test', classType: 'achievement' },
    ]);
    expect(html).toMatch(/MAIDEN:/);
    expect(html).toMatch(/UNDERGRADUATE:/);
    expect(html).toMatch(/BEGINNERS:/);
    expect(html).toMatch(/not having won a first prize at a Championship or Open Show/i);
  });

  it('includes Stud Dog / Brood Bitch / Brace / Team / Breeders when scheduled', () => {
    const html = renderWithClasses([
      { classNumber: 1, classLabel: '1', className: 'Stud Dog', classDescription: null, sex: 'dog', breedName: 'Test', classType: 'special' },
      { classNumber: 2, classLabel: '2', className: 'Brood Bitch', classDescription: null, sex: 'bitch', breedName: 'Test', classType: 'special' },
      { classNumber: 3, classLabel: '3', className: 'Brace', classDescription: null, sex: null, breedName: 'Test', classType: 'special' },
      { classNumber: 4, classLabel: '4', className: 'Team', classDescription: null, sex: null, breedName: 'Test', classType: 'special' },
      { classNumber: 5, classLabel: '5', className: 'Breeders', classDescription: null, sex: null, breedName: 'Test', classType: 'special' },
    ]);
    expect(html).toMatch(/STUD DOG:/);
    expect(html).toMatch(/BROOD BITCH:/);
    expect(html).toMatch(/BRACE:/);
    expect(html).toMatch(/TEAM:/);
    expect(html).toMatch(/BREEDERS:/);
  });

  it('falls back to DB description for non-RKC Special classes', () => {
    const html = renderWithClasses([
      {
        classNumber: 1, classLabel: '1',
        className: 'Special Long Coat Open',
        classDescription: 'For Long Coat German Shepherd Dogs eligible for entry at the show. No restrictions.',
        sex: 'dog', breedName: 'Test', classType: 'achievement',
      },
    ]);
    expect(html).toMatch(/SPECIAL LONG COAT OPEN:/);
    expect(html).toMatch(/Long Coat German Shepherd Dogs eligible for entry/);
  });

  it('includes NFC definition when NFC entries are accepted', () => {
    const html = renderWithClasses([
      { classNumber: 1, classLabel: '1', className: 'Open', classDescription: null, sex: 'dog', breedName: 'Test', classType: 'achievement' },
    ]);
    expect(html).toMatch(/NOT FOR COMPETITION:/);
  });

  it('omits NFC definition when NFC entries are not accepted', () => {
    const show = baseShow();
    show.scheduleData = { ...show.scheduleData, acceptsNfc: false } as ScheduleShowInfo['scheduleData'];
    const html = renderToStaticMarkup(
      ShowSchedule({
        show,
        classes: [{ classNumber: 1, classLabel: '1', className: 'Open', classDescription: null, sex: 'dog', breedName: 'Test', classType: 'achievement' }],
        judges: baseJudges,
      }) as React.ReactElement,
    );
    expect(html).not.toMatch(/NOT FOR COMPETITION:/);
  });
});

describe('RKC schedule compliance — postal entry form', () => {
  function renderPostal(): string {
    return renderToStaticMarkup(
      ShowSchedule({
        show: baseShow({ acceptsPostalEntries: true }),
        classes: baseClasses,
        judges: baseJudges,
      }) as React.ReactElement,
    );
  }

  it('repeats the docking statement above the declaration box', () => {
    // Cover and form both contain it; assert at least 2 occurrences for England
    const html = renderPostal();
    const matches = html.match(/A dog docked on or after 6 April 2007/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('includes the Hot Days notice on the entry form', () => {
    const html = renderPostal();
    expect(html).toMatch(/vulnerable and AT RISK in hot weather/i);
    expect(html).toMatch(/forcible entry to your vehicle may be necessary/i);
  });

  it('includes the joint-ownership note near the owner field', () => {
    expect(renderPostal()).toMatch(/joint registered ownership the name of every owner must be given/i);
  });

  it('includes a privacy / address-publication tickbox', () => {
    expect(renderPostal()).toMatch(/Tick to object to publication of your address in the catalogue/i);
  });

  it('postal declaration includes all RKC-mandatory clauses', () => {
    const html = renderPostal();
    expect(html).toMatch(/Royal Kennel Club Limited Rules/i);
    expect(html).toMatch(/visible condition which adversely affects its health or welfare/i);
    expect(html).toMatch(/Preparation of Dogs for Exhibition F \(Annex B\)/i);
    expect(html).toMatch(/Veterinary Surgeon operating on any of my\/our dogs/i);
    expect(html).toMatch(/relevant permission to show has been granted/i);
    expect(html).toMatch(/understand the eligibility of the classes entered/i);
  });

  it('includes the in-breach disqualification NOTE', () => {
    expect(renderPostal()).toMatch(/Dogs entered in breach.*liable to disqualification.*aware of the breach/i);
  });

  it('includes the Children-under-11 safeguarding NOTE', () => {
    expect(renderPostal()).toMatch(/Children under the age of 11 are the responsibility/i);
  });
});

describe('RKC schedule compliance — advised Annex A notices', () => {
  const html = render();

  it('includes the Use of Electrical Equipment notice', () => {
    expect(html).toMatch(/Use of Electrical Equipment at Shows/i);
    expect(html).toMatch(/should be PAT tested and permission sought from the secretary/i);
  });

  it('includes the Security at Shows notice', () => {
    expect(html).toMatch(/Security at Shows/i);
    expect(html).toMatch(/notification informing exhibitors of where to report/i);
  });
});

describe('RKC schedule compliance — Best Veteran in Show', () => {
  it('omits the BVIS rule when the toggle is off', () => {
    const html = renderToStaticMarkup(
      ShowSchedule({ show: baseShow(), classes: baseClasses, judges: baseJudges }) as React.ReactElement,
    );
    expect(html).not.toMatch(/Best Veteran in Show:/);
  });

  it('shows the standard BVIS wording when toggled on with no override', () => {
    const show = baseShow();
    show.scheduleData = { ...show.scheduleData, hasBestVeteranInShow: true } as ScheduleShowInfo['scheduleData'];
    const html = renderToStaticMarkup(
      ShowSchedule({ show, classes: baseClasses, judges: baseJudges }) as React.ReactElement,
    );
    expect(html).toMatch(/Best Veteran in Show:/);
    expect(html).toMatch(/Best Veteran in their breed/i);
  });

  it('uses the custom eligibility wording when provided', () => {
    const show = baseShow();
    show.scheduleData = {
      ...show.scheduleData,
      hasBestVeteranInShow: true,
      bestVeteranInShowEligibility: 'CUSTOM CLUB BVIS WORDING',
    } as ScheduleShowInfo['scheduleData'];
    const html = renderToStaticMarkup(
      ShowSchedule({ show, classes: baseClasses, judges: baseJudges }) as React.ReactElement,
    );
    expect(html).toMatch(/CUSTOM CLUB BVIS WORDING/);
    // Standard wording should NOT appear when override is set
    expect(html).not.toMatch(/Best Veteran in their breed/i);
  });
});

describe('RKC schedule compliance — wet weather statement', () => {
  it('shows the "no wet weather" warning when the toggle is false', () => {
    const show = baseShow();
    show.scheduleData = {
      ...show.scheduleData,
      wetWeatherAccommodation: false,
    } as ScheduleShowInfo['scheduleData'];
    const html = renderToStaticMarkup(
      ShowSchedule({ show, classes: baseClasses, judges: baseJudges }) as React.ReactElement,
    );
    expect(html).toMatch(/NO WET WEATHER ACCOMMODATION IS PROVIDED/);
  });
});
