import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { writeFileSync } from 'fs';
import { JudgesBook } from '../src/components/judges-book/judges-book';
import type { JudgesBookClass, JudgesBookShowInfo } from '../src/app/api/judges-book/[showId]/route';

/**
 * Dry-run preview of the redesigned Judge's Book — a deliberately wide
 * entry spread across a small and a large class so we can visually check:
 *   - 4-column grid reads cleanly at narrow & tall layouts
 *   - continuation-page header + grid-header repetition fire when a class
 *     overflows one page
 *   - the results summary lands after the last row of the grid, not before
 */

const show: JudgesBookShowInfo = {
  name: 'Clyde Valley GSD Spring Championship Show',
  showType: 'championship',
  date: '2026-05-16',
  organisation: 'Clyde Valley German Shepherd Dog Club',
  bestAwards: [
    'Best of Breed',
    'Dog Challenge Certificate',
    'Reserve Dog Challenge Certificate',
    'Bitch Challenge Certificate',
    'Reserve Bitch Challenge Certificate',
    'Best Puppy Dog',
    'Best Puppy Bitch',
    'Best Puppy in Show',
    // Breed-specific customs a secretary would add:
    'Best Long Coat in Show',
    'Best Veteran in Show',
  ],
};

function makeExhibits(start: number, count: number): JudgesBookClass['exhibits'] {
  return Array.from({ length: count }, (_, i) => ({
    catalogueNumber: String(start + i),
    dogName: `Dog ${start + i}`, // intentionally present in the data; the component must NOT render it
    absent: false,
  }));
}

const classes: JudgesBookClass[] = [
  {
    classNumber: 1,
    className: 'Minor Puppy',
    sex: 'dog',
    breedName: 'German Shepherd Dog',
    judgeName: 'Mr Andrew Winfrow',
    ringNumber: 1,
    exhibits: makeExhibits(1, 6),
  },
  {
    classNumber: 2,
    className: 'Puppy',
    sex: 'dog',
    breedName: 'German Shepherd Dog',
    judgeName: 'Mr Andrew Winfrow',
    ringNumber: 1,
    exhibits: makeExhibits(10, 12),
  },
  {
    // Deliberately large to force a 2-page overflow and check that the grid
    // header repeats on the continuation page.
    classNumber: 8,
    className: 'Open',
    sex: 'dog',
    breedName: 'German Shepherd Dog',
    judgeName: 'Mr Andrew Winfrow',
    ringNumber: 1,
    exhibits: makeExhibits(100, 28),
  },
];

(async () => {
  const buffer = await renderToBuffer(
    React.createElement(JudgesBook, { show, classes })
  );
  const out = '/tmp/judges-book-preview.pdf';
  writeFileSync(out, buffer);
  console.log(`wrote ${out}`);
})();
