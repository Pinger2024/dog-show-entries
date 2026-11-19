import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PROJECT_ROOT } from './helpers/static-scan';

/**
 * "Which shows are upcoming" has ONE owner: upcomingShowsCondition() in
 * server/services/upcoming-shows.ts (statuses from UPCOMING_SHOW_STATUSES in
 * lib/show-status.ts).
 *
 * Before 7 Oct 2026 it was hand-written four times — Find a Show's list, "near
 * me", the /shows JSON-LD and the Results page's "next show" — and they
 * disagreed: the list dropped a show the moment entries closed, so with North
 * Eastern (entries closed, Sun 11 Oct) the default list was empty. Mandy: it
 * should stay visible, marked "Entries closed", right up to the day.
 */
const FILES = [
  'src/server/trpc/routers/shows.ts',
  'src/app/(shows)/shows/page.tsx',
  'src/server/services/results-shows.ts',
];

// A `[ ... ]` literal naming both 'published' and 'entries_open' is a status
// list for "upcoming". (The updateStatus transition map is keyed, not an array
// of both, and the results-hub "held" pool has no 'published'.) A literal that
// also names 'draft' is the full status enum in a zod schema (shows.update), not
// a selection of upcoming shows, so it is ignored.
const ARRAY_LITERAL = /\[[^\]]*\]/g;
const handWrittenUpcomingList = (source: string) =>
  (source.match(ARRAY_LITERAL) ?? []).filter((arr) => /['"]published['"]/.test(arr) && /['"]entries_open['"]/.test(arr) && !/['"]draft['"]/.test(arr));

describe('upcoming shows — one owner', () => {
  for (const file of FILES) {
    const source = fs.readFileSync(path.resolve(PROJECT_ROOT, file), 'utf-8');

    it(`${file} asks upcomingShowsCondition()`, () => {
      expect(source).toMatch(/upcomingShowsCondition\(/);
    });

    it(`${file} has no hand-written published + entries_open status list`, () => {
      expect(handWrittenUpcomingList(source), 'use upcomingShowsCondition (services/upcoming-shows.ts)').toEqual([]);
    });
  }
});
