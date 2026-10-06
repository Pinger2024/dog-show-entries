import { describe, it, expect } from 'vitest';
import React from 'react';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { renderToBuffer } from '@react-pdf/renderer';
import { SvShowSchedule } from '@/components/schedule/sv-show-schedule';
import { pdfPageCount } from '@/server/services/schedule-render';
import type { ScheduleShowInfo, ScheduleClass } from '@/components/schedule/shared/types';
import type { ScheduleData } from '@/server/db/schema/shows';

/**
 * Mandy, 6 Oct 2026, setting up the BRG Winter Spectacular: "what3words isn't
 * showing up on the schedule". The regional (SV) schedule never printed the
 * what3words the secretary had typed in, though the club schedules always have.
 * It now prints under the venue on the cover — still six pages.
 */

const DIRECTIONS =
  'Please drive past the cafe on your left towards the large barns, turn left between the barns and park down by the horse arena';

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
  return execFileSync('pdftotext', ['-f', String(page), '-l', String(page), '-layout', file, '-']).toString('utf8');
}

describe('SV schedule — what3words', () => {
  it('prints the what3words under the venue on the cover, however the secretary typed it', async () => {
    for (const typed of ['///toasters.acclaim.prompt', 'toasters.acclaim.prompt']) {
      const buf = await renderToBuffer(
        <SvShowSchedule show={winterSpectacular({ what3words: typed })} classes={classes} judges={[]} />,
      );
      expect(await pageText(buf, 1)).toContain('///toasters.acclaim.prompt');
    }
  }, 60_000);

  it('a show with a what3words is still six pages', async () => {
    const buf = await renderToBuffer(
      <SvShowSchedule
        show={winterSpectacular({ what3words: '///toasters.acclaim.prompt', directions: DIRECTIONS })}
        classes={classes}
        judges={[]}
      />,
    );
    expect(await pdfPageCount(buf)).toBe(6);
  }, 60_000);

  it('prints no what3words line when none is set', async () => {
    const buf = await renderToBuffer(<SvShowSchedule show={winterSpectacular(null)} classes={classes} judges={[]} />);
    expect(await pageText(buf, 1)).not.toContain('what3words');
    expect(await pdfPageCount(buf)).toBe(6);
  }, 60_000);
});
