import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { SvShowSchedule } from '@/components/schedule/sv-show-schedule';
import {
  renderScheduleWithFit,
  pdfPageCount,
} from '@/server/services/schedule-render';
import type {
  ScheduleShowInfo,
  ScheduleClass,
  ScheduleJudge,
} from '@/components/schedule/shared/types';
import type { ScheduleData } from '@/server/db/schema/shows';

/**
 * SV schedule pagination — the document must render exactly its six designed
 * pages (cover · at-a-glance · classification · eligibility · grading ·
 * rules). A regional show with a rich fee config (several memberships +
 * Baby Puppy + catalogue rows + sundries) once overflowed the At-a-glance
 * A5 page and orphaned the prizes text onto a near-blank seventh page while
 * the folio still read "02 / 06" (Mandy 2026-07-11, North East regional).
 *
 * These render for real — no react-pdf mock — because the bug is layout,
 * not data assembly.
 */

const svClass = (over: Partial<ScheduleClass>): ScheduleClass => ({
  classNumber: null,
  classLabel: '',
  className: 'Adult',
  classDescription: null,
  sex: 'dog',
  breedName: 'German Shepherd Dog',
  classType: 'sv_age',
  svCoatType: 'stock',
  entryFee: null,
  ...over,
});

// Mirrors the North East GSD Regional Group show that triggered the orphan
// page: 12 breed class rows + 2 JH, four-tier fee scale, two memberships
// with their own prices, flat-fee Baby Puppy, five sundries (two of them
// catalogues), a four-sentence prizes description, and full secretary/vet
// contact blocks.
const richRegionalShow: ScheduleShowInfo = {
  slug: 'ne-regional',
  name: 'North East GSD Regional Group',
  showType: 'open',
  showScope: 'single_breed',
  date: '2026-09-05',
  endDate: '2026-09-05',
  startTime: '09:30',
  entriesOpenDate: null,
  entryCloseDate: '2026-08-20',
  postalCloseDate: null,
  kcLicenceNo: null,
  secretaryEmail: 'secretary@example.com',
  secretaryName: 'ANNE CAVE',
  secretaryAddress: '4 Warwick Square, Darlington, DL3 0DH',
  secretaryPhone: '+44 0000 000000',
  showOpenTime: '08:30',
  onCallVet:
    'White Oak Veterinary Centre Retail Park, Unit 3, Passfield Way, Durham, SR8 1BF',
  description: null,
  firstEntryFee: null,
  subsequentEntryFee: null,
  nfcEntryFee: null,
  juniorHandlerFee: 0,
  multiDogThreshold: null,
  multiDogPackagePence: null,
  regionalFeeConfig: {
    tiers: [
      { standardPence: 2000, memberPence: 2000 },
      { standardPence: 2000, memberPence: 2000 },
      { standardPence: 1600, memberPence: 1600 },
      { standardPence: 0, memberPence: 0 },
    ],
    memberships: [
      {
        label: 'BRG member',
        requiresNumber: true,
        tiers: [
          { standardPence: 1700, memberPence: 1700 },
          { standardPence: 1700, memberPence: 1700 },
          { standardPence: 1100, memberPence: 1100 },
          { standardPence: 0, memberPence: 0 },
        ],
      },
      {
        label: 'Host club member',
        requiresNumber: false,
        tiers: [
          { standardPence: 1700, memberPence: 1700 },
          { standardPence: 1700, memberPence: 1700 },
          { standardPence: 1100, memberPence: 1100 },
          { standardPence: 0, memberPence: 0 },
        ],
      },
    ],
    firstTimeEnabled: true,
    firstTimeFeePence: 0,
    donationsEnabled: true,
  },
  discountGroups: [],
  acceptsPostalEntries: false,
  sundryItems: [
    { name: 'Printed Catalogue', description: null, priceInPence: 500 },
    { name: 'Online Catalogue', description: null, priceInPence: 350 },
    { name: 'Donation', description: null, priceInPence: 500 },
    { name: 'Class Sponsorship', description: null, priceInPence: 1000 },
    { name: 'Colour Advert', description: null, priceInPence: 1000 },
  ],
  showRuleset: 'wusv',
  breedName: 'German Shepherd Dog',
  scheduleData: {
    awardsDescription:
      'Trophies for 1st place for Minor Puppy onwards. Rosettes for Baby Puppy Classes. Rosettes 1st to 3rd. Prizes for Junior Handlers.',
  } as ScheduleData,
  organisation: {
    name: 'North East GSD Regional Group',
    contactEmail: null,
    contactPhone: null,
    website: null,
    logoUrl: null,
  },
  venue: {
    name: 'Community Hall',
    address: 'Some Street, Durham',
    postcode: 'SR8 1BF',
  },
};

const richRegionalClasses: ScheduleClass[] = [
  // Flat-priced Baby Puppy (both sexes × both coats)
  ...(['dog', 'bitch'] as const).flatMap((sex) =>
    (['stock', 'long_stock'] as const).map((coat) =>
      svClass({ className: 'Baby Puppy', sex, svCoatType: coat, entryFee: 1000 }),
    ),
  ),
  // A representative spread of numbered SV age classes
  ...(['SV Minor Puppy', 'SV Junior', 'Adult', 'Working'] as const).flatMap(
    (name, i) =>
      (['stock', 'long_stock'] as const).map((coat) =>
        svClass({
          className: name,
          svCoatType: coat,
          classNumber: i + 1,
          classLabel: String(i + 1),
        }),
      ),
  ),
  // Junior Handling (outside the numbered classes)
  svClass({
    className: 'JHA Handling (6-11)',
    classType: 'junior_handler',
    classLabel: 'JHA',
    sex: null,
    svCoatType: null,
    entryFee: 0,
  }),
  svClass({
    className: 'JHA Handling (12-16)',
    classType: 'junior_handler',
    classLabel: 'JHB',
    sex: null,
    svCoatType: null,
    entryFee: 0,
  }),
];

const judges: ScheduleJudge[] = [
  {
    name: 'Mrs J Example',
    affix: 'Vonhaus',
    breeds: ['German Shepherd Dog'],
    role: 'Dogs & Bitches',
    displayLabel: 'Mrs J Example (Vonhaus) — Dogs & Bitches',
  },
  {
    name: 'Mr K Example',
    breeds: [],
    role: 'Junior Handling',
    displayLabel: 'Mr K Example — Junior Handling',
  },
];

describe('SV schedule pagination', () => {
  it('renders exactly 6 pages for a fee-rich regional show (no orphan overflow page)', async () => {
    const buf = await renderToBuffer(
      <SvShowSchedule
        show={richRegionalShow}
        classes={richRegionalClasses}
        judges={judges}
      />,
    );
    expect(await pdfPageCount(buf)).toBe(6);
  }, 60_000);

  it('renders exactly 6 pages for a lean SV show without a regional fee config', async () => {
    const lean: ScheduleShowInfo = {
      ...richRegionalShow,
      regionalFeeConfig: null,
      firstEntryFee: 500,
      sundryItems: [],
      scheduleData: null,
    };
    const buf = await renderToBuffer(
      <SvShowSchedule
        show={lean}
        classes={richRegionalClasses}
        judges={judges}
      />,
    );
    expect(await pdfPageCount(buf)).toBe(6);
  }, 60_000);

  // renderScheduleWithFit is the production render path (HTTP route +
  // print-order pipeline): when a show's data-elastic sections outgrow the
  // designed six pages at normal density, it must fall back to compact
  // density instead of shipping an orphaned extra page.
  it('fit renderer absorbs a pathological fee config via compact density', async () => {
    const pathological: ScheduleShowInfo = {
      ...richRegionalShow,
      regionalFeeConfig: {
        ...richRegionalShow.regionalFeeConfig!,
        // Six extra membership price levels and four extra sundries beyond
        // North East's config — comfortably past what the normal-density
        // layout can absorb.
        memberships: [
          ...(richRegionalShow.regionalFeeConfig!.memberships ?? []),
          ...['Associate', 'Junior', 'Overseas', 'Life', 'Honorary', 'Family'].map(
            (kind) => ({
              label: `${kind} member`,
              requiresNumber: false,
              tiers: richRegionalShow.regionalFeeConfig!.memberships![0]!.tiers,
            }),
          ),
        ],
      },
      sundryItems: [
        ...(richRegionalShow.sundryItems ?? []),
        { name: 'Raffle ticket', description: null, priceInPence: 100 },
        { name: 'Ringside lunch', description: null, priceInPence: 800 },
        { name: 'Car pass', description: null, priceInPence: 300 },
        { name: 'Commemorative pin', description: null, priceInPence: 450 },
      ],
    };
    const props = {
      show: pathological,
      classes: richRegionalClasses,
      judges,
    };

    // Sanity: this fixture genuinely overflows at normal density…
    const normal = await renderToBuffer(<SvShowSchedule {...props} />);
    expect(await pdfPageCount(normal)).toBeGreaterThan(6);

    // …and the fit renderer brings it back to the designed six pages.
    const fitted = await renderScheduleWithFit(
      SvShowSchedule as React.ComponentType<Record<string, unknown>>,
      props,
      6,
    );
    expect(await pdfPageCount(fitted)).toBe(6);
  }, 60_000);
});
