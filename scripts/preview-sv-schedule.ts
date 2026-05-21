/**
 * Render the new "Sieger Editorial" SvShowSchedule using static sample data
 * — the same shape as the design's `data.js` — and write it to
 * /tmp/sv-schedule-preview.pdf so we can spot-check the six pages without
 * needing a live WUSV show in the DB.
 *
 * Usage: `npx tsx scripts/preview-sv-schedule.ts`
 */
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { writeFileSync } from 'fs';
import { SvShowSchedule } from '../src/components/schedule/sv-show-schedule';
import type {
  ScheduleShowInfo,
  ScheduleClass,
  ScheduleJudge,
} from '../src/components/schedule/shared/types';

async function main() {
  const show: ScheduleShowInfo = {
    slug: 'clyde-valley-regional-2026',
    name: 'Clyde Valley GSD Club — 18th Annual Regional',
    showType: 'championship',
    showScope: 'single_breed',
    date: '2026-09-19',
    endDate: '2026-09-19',
    startTime: '10:00',
    showOpenTime: '09:00',
    entriesOpenDate: '2026-06-01T09:00:00Z',
    entryCloseDate: '2026-09-07T23:59:00Z',
    postalCloseDate: '2026-09-04T23:59:00Z',
    kcLicenceNo: 'GSDL-BRG / WUSV 2026-019',
    secretaryEmail: 'mandy@hundarkgsd.co.uk',
    secretaryName: 'Amanda McAllister',
    secretaryAddress: 'Parenwell Cottage, Blairadam, Kelty KY4 0HU',
    secretaryPhone: '07876 210 243',
    onCallVet: 'Strathaven Veterinary Clinic — 01357 521 234',
    description: null,
    firstEntryFee: 2000,
    subsequentEntryFee: null,
    nfcEntryFee: null,
    juniorHandlerFee: 0,
    multiDogThreshold: 3,
    multiDogPackagePence: 5600,
    discountGroups: [
      { label: 'GSDL-BRG members', firstEntryFeePence: 1700, multiDogPackagePence: 4500 },
    ],
    acceptsPostalEntries: true,
    showRuleset: 'wusv',
    breedName: 'German Shepherd Dog',
    scheduleData: {
      firstAiders: ['Heather Macdonald'],
    },
    organisation: {
      name: 'Clyde Valley German Shepherd Dog Club',
      contactEmail: 'secretary@clydevalleygsd.co.uk',
      contactPhone: '07876 210 243',
      website: 'clydevalleygsd.co.uk',
      logoUrl: null,
    },
    venue: {
      name: 'Strathaven Showground',
      address: 'Hamilton Road, Strathaven',
      postcode: 'ML10 6SY',
    },
  };

  const ages = ['Minor Puppy', 'Puppy', 'Junior', 'Yearling', 'Adult', 'Working'];
  const classes: ScheduleClass[] = [];
  let n = 1;
  for (const age of ages) {
    for (const sex of ['bitch', 'dog'] as const) {
      for (const coat of ['stock', 'long_stock'] as const) {
        classes.push({
          classNumber: n,
          classLabel: String(n),
          className: `SV ${age}`,
          classDescription: null,
          sex,
          breedName: 'German Shepherd Dog',
          classType: 'sv_age',
          svCoatType: coat,
          entryFee: null,
        });
      }
      n++;
    }
  }
  // Junior handling
  classes.push({
    classNumber: null,
    classLabel: 'JH1',
    className: 'Junior Handler 6-11 yrs',
    classDescription: null,
    sex: null,
    breedName: null,
    classType: 'junior_handler',
    svCoatType: null,
    entryFee: null,
  });
  classes.push({
    classNumber: null,
    classLabel: 'JH2',
    className: 'Junior Handler 12-16 yrs',
    classDescription: null,
    sex: null,
    breedName: null,
    classType: 'junior_handler',
    svCoatType: null,
    entryFee: null,
  });

  const judges: ScheduleJudge[] = [
    {
      name: 'Heinrich Wittkopp',
      affix: 'vom Burgaltendorf',
      breeds: ['German Shepherd Dog'],
      sex: null,
      role: 'Breed Judge — Classes 1 to 12',
    },
    {
      name: 'Susan Carmichael',
      affix: 'Glenfaulds',
      breeds: ['German Shepherd Dog'],
      sex: null,
      role: 'Junior Handling',
    },
  ];

  const element = React.createElement(SvShowSchedule, {
    show,
    classes,
    judges,
    sponsors: [],
    adverts: [],
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(element as any);
  const out = '/tmp/sv-schedule-preview.pdf';
  writeFileSync(out, buffer);
  console.log(`✅ Wrote ${out} (${buffer.length.toLocaleString()} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
