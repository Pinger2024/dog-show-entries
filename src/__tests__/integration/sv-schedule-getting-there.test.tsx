import { describe, it, expect } from 'vitest';
import React from 'react';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { renderToBuffer } from '@react-pdf/renderer';
import { SvShowSchedule } from '@/components/schedule/sv-show-schedule';
import { pdfPageCount, renderScheduleWithFit } from '@/server/services/schedule-render';
import { svSchedulePageCount } from '@/components/schedule/sv-show-schedule';
import type { ScheduleShowInfo, ScheduleClass } from '@/components/schedule/shared/types';
import type { ScheduleData } from '@/server/db/schema/shows';

/**
 * Mandy, 6 Oct 2026, setting up the BRG Winter Spectacular: "what3words isn't
 * showing up on the schedule … the secretary has added catering info too". The
 * regional (SV) schedule printed only a few of the things the schedule form asks
 * for. The what3words now prints under the venue on the cover, and a new page 3,
 * "On the day", carries the rest: times, Event Manager and officers, getting
 * there, catering, prize money, future shows and notes — seven pages in all.
 */

const DIRECTIONS =
  'Please drive past the cafe on your left towards the large barns, turn left between the barns and park down by the horse arena';

// Midland Regional's real directions (4 Oct 2026) — the longest on file.
const MIDLAND_DIRECTIONS = [
  'Search for Ellistown FC in your Map App.',
  '•\tFrom Junction 22 of the M1 take the A511 towards Ashby/Coalville. ',
  '•\tAt the first roundabout continue on the A511 towards Ashby/Coalville. ',
  '•\tAt the next roundabout bare left onto the B585 Beveridge Lane.',
  '•\tAt the next roundabout take the first exit onto West Lane. ',
  '•\tContinue straight on at the next two roundabouts staying on West Lane. ',
  '•\tAt the T-junction turn right onto Terrace Road, the venue is approx. 300 yards on the left.',
  '',
  'Prepaid parking is available with entry for BRG Members at £4. All othere £5 on the day, paid directly to the Football Club.',
].join('\n');

const winterSpectacular = (scheduleData: Partial<ScheduleData> | null): ScheduleShowInfo => ({
  slug: 'winter-spectacular-2026',
  name: 'Winter Spectacular 2026',
  showType: 'championship',
  showScope: 'single_breed',
  date: '2026-11-15',
  endDate: '2026-11-15',
  startTime: '09:00',
  entriesOpenDate: null,
  entryCloseDate: '2026-11-01',
  postalCloseDate: null,
  kcLicenceNo: null,
  secretaryEmail: 'secretary@example.com',
  secretaryName: 'Shirley Hutchinson',
  secretaryAddress: 'Mount Farm, ST18 0NB',
  secretaryPhone: '+44 0000 000000',
  showOpenTime: '08:30',
  onCallVet: 'Pool House Vets, 17 New Road, Armitage, Staffs, WS15 4AA',
  description: null,
  firstEntryFee: 2000,
  subsequentEntryFee: null,
  nfcEntryFee: null,
  juniorHandlerFee: 0,
  multiDogThreshold: null,
  multiDogPackagePence: null,
  regionalFeeConfig: null,
  discountGroups: [],
  acceptsPostalEntries: false,
  sundryItems: [
    { name: 'Printed Catalogue', description: null, priceInPence: 500 },
    { name: 'Advert', description: null, priceInPence: 1000 },
    { name: 'Class Sponsorship', description: null, priceInPence: 1500 },
    { name: 'Donation', description: null, priceInPence: 500 },
  ],
  showRuleset: 'wusv',
  breedName: 'German Shepherd Dog',
  scheduleData: scheduleData as ScheduleData | null,
  organisation: { name: 'GSD League of Great Britain British Regional Groups', contactEmail: null, contactPhone: null, website: null, logoUrl: null },
  venue: { name: 'Tuppenhurst Farm', address: 'Handsacre, Rugeley', postcode: 'WS15 4HJ' },
});

const classes: ScheduleClass[] = (['SV Minor Puppy', 'SV Junior', 'Adult', 'Working'] as const).flatMap((name, i) =>
  (['dog', 'bitch'] as const).map((sex) => ({
    classNumber: i + 1,
    classLabel: String(i + 1),
    className: name,
    classDescription: null,
    sex,
    breedName: 'German Shepherd Dog',
    classType: 'sv_age',
    svCoatType: 'stock' as const,
    entryFee: null,
  })),
);

async function pageText(buf: Buffer, page: number): Promise<string> {
  const dir = mkdtempSync(path.join(tmpdir(), 'sv-getting-there-'));
  const file = path.join(dir, 'schedule.pdf');
  writeFileSync(file, buf);
  // -raw: text in the order it was drawn, so the two columns of a page never
  // interleave line by line (as -layout does when their wraps line up).
  return execFileSync('pdftotext', ['-f', String(page), '-l', String(page), '-raw', file, '-']).toString('utf8');
}

describe('SV schedule — what3words and On the day', () => {
  it('prints the what3words under the venue on the cover, however the secretary typed it', async () => {
    for (const typed of ['///toasters.acclaim.prompt', 'toasters.acclaim.prompt']) {
      const buf = await renderToBuffer(
        <SvShowSchedule show={winterSpectacular({ what3words: typed })} classes={classes} judges={[]} />,
      );
      expect(await pageText(buf, 1)).toContain('///toasters.acclaim.prompt');
    }
  }, 60_000);

  it('page 3, "On the day", prints everything else the secretary filled in', async () => {
    const buf = await renderToBuffer(
      <SvShowSchedule
        show={winterSpectacular({
          what3words: '///toasters.acclaim.prompt',
          directions: DIRECTIONS,
          catering: 'The cafe will be open during the show - serving excellent food and drinks.',
          showManager: 'Heather Macdonald',
          officers: [{ name: 'Jane Example', position: 'Chairman' }],
          latestArrivalTime: '08:45',
          prizeMoney: 'No prize money.',
          futureShowDates: 'Spring Show, 18 April 2027',
          additionalNotes: 'Please clean up after your dog.',
          customStatements: ['All dogs must be on a lead at all times.'],
        })}
        classes={classes}
        judges={[]}
      />,
    );
    const page3 = (await pageText(buf, 3)).replace(/\s+/g, ' ');
    for (const expected of [
      'On the day',
      'Latest arrival',
      '08:45',
      'Event Manager',
      'Heather Macdonald',
      'Chairman',
      'Jane Example',
      'Getting there',
      '///toasters.acclaim.prompt',
      'park down by the horse arena',
      'serving excellent food and drinks',
      'No prize money.',
      'Spring Show, 18 April 2027',
      'Please clean up after your dog.',
      'All dogs must be on a lead at all times.',
    ]) {
      expect(page3).toContain(expected);
    }
    expect(await pdfPageCount(buf)).toBe(7);
  }, 60_000);

  it("Midland's half-page of turn-by-turn directions, with every other box filled, still fits", async () => {
    const show = winterSpectacular({
      what3words: '///toasters.acclaim.prompt',
      directions: MIDLAND_DIRECTIONS,
      catering: 'The cafe will be open during the show - serving excellent food and drinks. Please note the cafe is a local tourist attraction and as such is not cheap but is high quality. Please bring your own refreshments if this does not suit you.',
      showManager: 'Heather Macdonald',
      officers: [
        { name: 'Jane Example', position: 'Chairman' },
        { name: 'John Example', position: 'Treasurer' },
        { name: 'Ann Example', position: 'Show Secretary' },
      ],
      latestArrivalTime: '08:45',
      prizeMoney: 'No prize money is offered at this show.',
      futureShowDates: 'Spring Show, 18 April 2027 · Summer Show, 11 July 2027',
      additionalNotes: 'Please clean up after your dog. The show is held outside; please dress for the weather.',
      customStatements: ['All dogs must be on a lead at all times.', 'No dogs may be left in cars.'],
    });
    const fitted = await renderScheduleWithFit(
      SvShowSchedule as unknown as React.ComponentType<Record<string, unknown>>,
      { show, classes, judges: [] },
      svSchedulePageCount(),
    );
    expect(await pdfPageCount(Buffer.from(fitted))).toBe(7);
    expect((await pageText(Buffer.from(fitted), 3)).replace(/\s+/g, ' ')).toContain('the venue is approx. 300 yards on the left');
  }, 120_000);

  it('prints no what3words line when none is set, and is still seven pages', async () => {
    const buf = await renderToBuffer(<SvShowSchedule show={winterSpectacular(null)} classes={classes} judges={[]} />);
    expect(await pageText(buf, 1)).not.toContain('what3words');
    expect(await pdfPageCount(buf)).toBe(7);
  }, 60_000);
});
