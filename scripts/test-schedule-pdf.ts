import 'dotenv/config';
import { db } from '@/server/db/index.js';
import { eq, asc } from 'drizzle-orm';
import * as schema from '@/server/db/schema/index.js';
import { renderToBuffer } from '@react-pdf/renderer';
import { ShowSchedule } from '@/components/schedule/show-schedule.js';
import type { ScheduleShowInfo, ScheduleClass, ScheduleJudge } from '@/components/schedule/show-schedule.js';
import React from 'react';
import { writeFileSync } from 'fs';

async function main() {
  if (db === null) { console.log('No db'); return; }
  
  const showId = 'a6883cdf-abb0-4f46-a6f9-d63fb9b4523c';
  
  const show = await db.query.shows.findFirst({
    where: eq(schema.shows.id, showId),
    with: { organisation: true, venue: true },
  });
  
  if (show === undefined) { console.log('Show not found'); return; }
  
  const [showClasses, judgeAssignments] = await Promise.all([
    db.query.showClasses.findMany({
      where: eq(schema.showClasses.showId, showId),
      with: { classDefinition: true, breed: true },
      orderBy: [asc(schema.showClasses.sortOrder), asc(schema.showClasses.classNumber)],
    }),
    db.query.judgeAssignments.findMany({
      where: eq(schema.judgeAssignments.showId, showId),
      with: { judge: true, breed: true },
    }),
  ]);
  
  const classes: ScheduleClass[] = showClasses.map((sc) => ({
    classNumber: sc.classNumber,
    className: sc.classDefinition?.name ?? 'Unknown Class',
    classDescription: sc.classDefinition?.description ?? null,
    sex: sc.sex,
    breedName: sc.breed?.name ?? null,
  }));
  
  const judgeMap = new Map<string, Set<string>>();
  for (const ja of judgeAssignments) {
    if (ja.judge?.name === undefined && ja.judge?.name === null) continue;
    if (ja.judge === null) continue;
    if (ja.judge.name === undefined || ja.judge.name === null) continue;
    if (judgeMap.has(ja.judge.name) === false) {
      judgeMap.set(ja.judge.name, new Set());
    }
    if (ja.breed?.name) {
      judgeMap.get(ja.judge.name)?.add(ja.breed.name);
    }
  }
  
  const judges: ScheduleJudge[] = Array.from(judgeMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, breeds]) => ({
      name,
      breeds: Array.from(breeds).sort(),
    }));
  
  const showInfo: ScheduleShowInfo = {
    name: show.name,
    showType: show.showType,
    showScope: show.showScope,
    date: show.startDate,
    endDate: show.endDate,
    startTime: show.startTime,
    entriesOpenDate: show.entriesOpenDate?.toISOString() ?? null,
    entryCloseDate: show.entryCloseDate?.toISOString() ?? null,
    postalCloseDate: show.postalCloseDate?.toISOString() ?? null,
    kcLicenceNo: show.kcLicenceNo,
    secretaryEmail: show.secretaryEmail,
    secretaryName: show.secretaryName,
    secretaryAddress: show.secretaryAddress,
    secretaryPhone: show.secretaryPhone,
    showOpenTime: show.showOpenTime,
    onCallVet: show.onCallVet,
    description: show.description,
    firstEntryFee: show.firstEntryFee,
    subsequentEntryFee: show.subsequentEntryFee,
    nfcEntryFee: show.nfcEntryFee,
    acceptsPostalEntries: show.acceptsPostalEntries,
    scheduleData: show.scheduleData ?? null,
    organisation: show.organisation
      ? {
          name: show.organisation.name,
          contactEmail: show.organisation.contactEmail,
          contactPhone: show.organisation.contactPhone,
          website: show.organisation.website,
          logoUrl: show.organisation.logoUrl,
        }
      : null,
    venue: show.venue
      ? {
          name: show.venue.name,
          address: show.venue.address,
          postcode: show.venue.postcode,
        }
      : null,
  };
  
  console.log('Show:', show.name);
  console.log('Classes:', classes.length);
  console.log('Judges:', judges.length);
  console.log('Schedule data keys:', Object.keys(show.scheduleData ?? {}));
  console.log('\nGenerating PDF...');
  
  try {
    const pdfDocument = React.createElement(ShowSchedule, {
      show: showInfo,
      classes,
      judges,
    });
    const buffer = await renderToBuffer(pdfDocument);
    const outputPath = '/tmp/test-schedule.pdf';
    writeFileSync(outputPath, buffer);
    console.log(`PDF generated successfully: ${outputPath}`);
    console.log(`Size: ${buffer.length} bytes (${(buffer.length / 1024).toFixed(1)} KB)`);
  } catch (err) {
    console.error('PDF generation FAILED:', err);
  }
}
main();
