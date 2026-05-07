/**
 * Visual smoke-test for Phase A multi-breed schedule rendering. Builds two
 * synthetic shows entirely in memory (no DB) — one general championship
 * (group-system) and one open show (NOT group-system) — and renders both
 * PDFs to /tmp so we can eyeball:
 *   - Cover and banding
 *   - The Crufts qualification banner (open + group-system only)
 *   - Group classification headings on the all-breed class table
 *   - Class definitions list ordering with AVNSC/AVIBR/Variety entries
 *   - The new Rule 12 BIS-chain wording
 *
 * Run: npx tsx scripts/preview-multibreed-schedule.ts
 */
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { writeFileSync } from 'fs';
import { ShowScheduleMultibreed } from '../src/components/schedule/show-schedule-multibreed';
import type {
  ScheduleShowInfo,
  ScheduleClass,
  ScheduleJudge,
  SchedulePanelJudge,
} from '../src/components/schedule/shared/types';

function baseShow(overrides: Partial<ScheduleShowInfo> = {}): ScheduleShowInfo {
  return {
    slug: 'multibreed-preview',
    name: 'Phase A Preview Show',
    showType: 'open',
    showScope: 'general',
    date: '2026-09-12',
    endDate: '2026-09-12',
    startTime: '9:30',
    entriesOpenDate: '2026-07-01',
    entryCloseDate: '2026-08-29',
    postalCloseDate: '2026-08-29',
    kcLicenceNo: '5678',
    secretaryEmail: 'sec@preview.example',
    secretaryName: 'Jane Secretary',
    secretaryAddress: '1 Preview Lane, Examplestown',
    secretaryPhone: '01234 567890',
    showOpenTime: '8:00',
    onCallVet: 'Preview Veterinary Practice',
    description: null,
    firstEntryFee: 1500,
    subsequentEntryFee: 1000,
    nfcEntryFee: 500,
    juniorHandlerFee: 0,
    acceptsPostalEntries: true,
    scheduleData: {
      country: 'england',
      publicAdmission: true,
      wetWeatherAccommodation: true,
      isBenched: false,
      acceptsNfc: true,
      officers: [
        { name: 'A. Officer', position: 'Chairman' },
        { name: 'B. Treasurer', position: 'Treasurer' },
      ],
      showManager: 'C. Manager',
    } as ScheduleShowInfo['scheduleData'],
    organisation: {
      name: 'Preview All-Breeds Society',
      contactEmail: 'club@preview.example',
      contactPhone: null,
      website: null,
      logoUrl: null,
    },
    venue: { name: 'Preview Showground', address: 'Preview Road', postcode: 'AB1 2CD' },
    ...overrides,
  };
}

const judges: ScheduleJudge[] = [
  { name: 'Mr A Judge', breeds: ['Group judge'], displayLabel: 'Mr A Judge — Hound Group' },
  { name: 'Mrs B Judge', breeds: ['Group judge'], displayLabel: 'Mrs B Judge — Pastoral Group' },
];

// Multi-breed class set spanning 3 RKC groups + AVNSC + AVIBR.
const classes: ScheduleClass[] = [
  { classNumber: 1, classLabel: '1', className: 'Puppy', classDescription: null, sex: 'dog', breedName: 'Beagle', classType: 'age', breedGroupName: 'Hound', breedGroupSortOrder: 2 },
  { classNumber: 2, classLabel: '2', className: 'Junior', classDescription: null, sex: 'dog', breedName: 'Beagle', classType: 'age', breedGroupName: 'Hound', breedGroupSortOrder: 2 },
  { classNumber: 3, classLabel: '3', className: 'Open', classDescription: null, sex: 'bitch', breedName: 'Beagle', classType: 'age', breedGroupName: 'Hound', breedGroupSortOrder: 2 },
  { classNumber: 4, classLabel: '4', className: 'Puppy', classDescription: null, sex: 'dog', breedName: 'Whippet', classType: 'age', breedGroupName: 'Hound', breedGroupSortOrder: 2 },
  { classNumber: 5, classLabel: '5', className: 'Open', classDescription: null, sex: 'dog', breedName: 'Whippet', classType: 'age', breedGroupName: 'Hound', breedGroupSortOrder: 2 },
  { classNumber: 6, classLabel: '6', className: 'Puppy', classDescription: null, sex: 'dog', breedName: 'Cocker Spaniel', classType: 'age', breedGroupName: 'Gundog', breedGroupSortOrder: 1 },
  { classNumber: 7, classLabel: '7', className: 'Open', classDescription: null, sex: 'bitch', breedName: 'Cocker Spaniel', classType: 'age', breedGroupName: 'Gundog', breedGroupSortOrder: 1 },
  { classNumber: 8, classLabel: '8', className: 'Junior', classDescription: null, sex: 'dog', breedName: 'Labrador Retriever', classType: 'age', breedGroupName: 'Gundog', breedGroupSortOrder: 1 },
  { classNumber: 9, classLabel: '9', className: 'Open', classDescription: null, sex: 'dog', breedName: 'German Shepherd Dog', classType: 'age', breedGroupName: 'Pastoral', breedGroupSortOrder: 3 },
  { classNumber: 10, classLabel: '10', className: 'Open', classDescription: null, sex: 'bitch', breedName: 'Border Collie', classType: 'age', breedGroupName: 'Pastoral', breedGroupSortOrder: 3 },
  { classNumber: 11, classLabel: '11', className: 'AVNSC', classDescription: null, sex: null, breedName: null, classType: 'age' },
  { classNumber: 12, classLabel: '12', className: 'AVIBR', classDescription: null, sex: null, breedName: null, classType: 'age' },
  { classNumber: 13, classLabel: '13', className: 'Variety Class', classDescription: null, sex: null, breedName: null, classType: 'age' },
];

// Sample panel judges across three groups (Hound, Gundog, Pastoral) plus
// show-level BIS / BPIS / BVIS — gives the preview page enough variety to
// show the dynamic-column layout that adapts to whatever sub-judge roles
// the data carries.
const panelJudges: SchedulePanelJudge[] = [
  // Show-level
  { displayLabel: 'Mrs Eleanor Best (Sandcastle)', roleName: 'Best in Show Judge', roleShortLabel: 'BIS', roleSortOrder: 100, isGroupLevel: false, groupName: null, groupSortOrder: null },
  { displayLabel: 'Mr Jonathan Pup (Westwood)', roleName: 'Best Puppy in Show Judge', roleShortLabel: 'BPIS', roleSortOrder: 110, isGroupLevel: false, groupName: null, groupSortOrder: null },
  { displayLabel: 'Mrs Margaret Vet (Brackenbridge)', roleName: 'Best Veteran in Show Judge', roleShortLabel: 'BVIS', roleSortOrder: 120, isGroupLevel: false, groupName: null, groupSortOrder: null },
  // Gundog (sortOrder 1)
  { displayLabel: 'Mr Adam Gundog (Sadira)', roleName: 'Group Judge', roleShortLabel: 'Group', roleSortOrder: 10, isGroupLevel: true, groupName: 'Gundog', groupSortOrder: 1 },
  { displayLabel: 'Ms Helen PupGundog', roleName: 'Puppy Group Judge', roleShortLabel: 'Puppy Group', roleSortOrder: 20, isGroupLevel: true, groupName: 'Gundog', groupSortOrder: 1 },
  { displayLabel: 'Mr Tim Veteran', roleName: 'Veteran Group Judge', roleShortLabel: 'Veteran Group', roleSortOrder: 30, isGroupLevel: true, groupName: 'Gundog', groupSortOrder: 1 },
  // Hound (sortOrder 2)
  { displayLabel: 'Mrs Diane Hound (Camargue)', roleName: 'Group Judge', roleShortLabel: 'Group', roleSortOrder: 10, isGroupLevel: true, groupName: 'Hound', groupSortOrder: 2 },
  { displayLabel: 'Mr Francesco Cohetti (Italy)', roleName: 'Puppy Group Judge', roleShortLabel: 'Puppy Group', roleSortOrder: 20, isGroupLevel: true, groupName: 'Hound', groupSortOrder: 2 },
  { displayLabel: 'Mr Tim Veteran', roleName: 'Veteran Group Judge', roleShortLabel: 'Veteran Group', roleSortOrder: 30, isGroupLevel: true, groupName: 'Hound', groupSortOrder: 2 },
  // Pastoral (sortOrder 3)
  { displayLabel: 'Mr Edward Paterson (Camargue)', roleName: 'Group Judge', roleShortLabel: 'Group', roleSortOrder: 10, isGroupLevel: true, groupName: 'Pastoral', groupSortOrder: 3 },
  { displayLabel: 'Mr Francesco Cohetti (Italy)', roleName: 'Puppy Group Judge', roleShortLabel: 'Puppy Group', roleSortOrder: 20, isGroupLevel: true, groupName: 'Pastoral', groupSortOrder: 3 },
];

async function render(label: string, show: ScheduleShowInfo, outPath: string) {
  const tree = React.createElement(ShowScheduleMultibreed, { show, classes, judges, panelJudges });
  // Cast — react-pdf typings vs FunctionComponentElement is a known mismatch
  // (already noted as pre-existing in tsc output).
  const buf = await renderToBuffer(tree as Parameters<typeof renderToBuffer>[0]);
  writeFileSync(outPath, buf);
  console.log(`✓ ${label} → ${outPath} (${(buf.length / 1024).toFixed(1)} KB)`);
}

async function main() {
  await render(
    'Open show (group system + Crufts banner)',
    baseShow({
      showType: 'open',
      name: 'Phase A Preview — Open (Group System)',
      scheduleData: {
        ...(baseShow().scheduleData as object),
        judgedOnGroupSystem: true,
      } as ScheduleShowInfo['scheduleData'],
    }),
    '/tmp/preview-multibreed-open-groupsystem.pdf',
  );

  await render(
    'General championship (group system, no Crufts banner)',
    baseShow({
      showType: 'championship',
      name: 'Phase A Preview — General Championship',
      scheduleData: {
        ...(baseShow().scheduleData as object),
        judgedOnGroupSystem: true,
      } as ScheduleShowInfo['scheduleData'],
    }),
    '/tmp/preview-multibreed-general-champ.pdf',
  );

  await render(
    'Open show (NOT group system — flat BIS chain)',
    baseShow({
      showType: 'open',
      name: 'Phase A Preview — Open (Not Group System)',
      scheduleData: {
        ...(baseShow().scheduleData as object),
        judgedOnGroupSystem: false,
      } as ScheduleShowInfo['scheduleData'],
    }),
    '/tmp/preview-multibreed-open-flat.pdf',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
