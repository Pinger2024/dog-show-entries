import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PROJECT_ROOT, scanFiles } from './helpers/static-scan';

/**
 * The public show feed (`/api/shows`) is the ONE place Remi tells the outside
 * world which shows exist and whether they are open. It exists because the GSD
 * Breed Council's static site kept its own hand-typed copy of exactly that —
 * slugs, venues and closing dates in a Python dict — which went wrong the day
 * a show's entries closed.
 *
 * So this guard watches for the same mistake coming back INSIDE Remi: a second
 * place that answers "which shows may the public see" or "can you enter this
 * one" with its own inline test, instead of calling the owners.
 */
const read = (file: string) => fs.readFileSync(path.resolve(PROJECT_ROOT, file), 'utf-8');

const SERVICE = 'src/server/services/public-show-feed.ts';
const ROUTE = 'src/app/api/shows/route.ts';

describe('public show feed — one owner', () => {
  const service = read(SERVICE);

  it('derives every field from its owner, not inline', () => {
    // Which shows the public may see.
    expect(service).toMatch(/PUBLIC_SHOW_STATUSES/);
    // The badge-lag trap: close date passed, cron not yet run.
    expect(service).toMatch(/publicShowStatus\(/);
    // "Can money still be spent on an entry".
    expect(service).toMatch(/entryWindowOpen\(/);
    // "Has this show published results".
    expect(service).toMatch(/showIdsWithPublishedResults\(/);
    expect(service).toMatch(/showResultsState\(/);
    // A regional must not print as a Championship Show.
    expect(service).toMatch(/displayShowTypeTitle\(/);
    // "23:59", never "midnight" (Mandy, 23 July 2026).
    expect(service).toMatch(/formatCloseTimeUK\(/);
    // Club columns by allow-list — bank details leaked once.
    expect(service).toMatch(/publicOrgColumns/);
  });

  it('never hand-compares a status or a close date', () => {
    expect(service).not.toMatch(/status\s*===\s*['"]entries_open['"]/);
    expect(service).not.toMatch(/status\s*!==\s*['"]entries_open['"]/);
    expect(service).not.toMatch(/entryCloseDate[^\n]*<\s*(Date\.now|now)/);
  });

  it('asks for the organisation by allow-list, never wholesale', () => {
    expect(service).not.toMatch(/organisation:\s*true/);
  });

  it('the route stays thin — it asks the service, it does not query shows', () => {
    const route = read(ROUTE);
    expect(route).toMatch(/listPublicShowFeed\(/);
    expect(route).not.toMatch(/db\.query\.shows/);
    expect(route).not.toMatch(/publicShowStatus\(|entryWindowOpen\(/);
  });

  it('nothing hand-writes Remi’s own show URLs any more', () => {
    // `lib/app-url.ts` owns the origin and `showHref`/`showResultsHref` own the
    // path. A literal site URL with a /shows/ path in it is a third copy — the
    // calendar route had one, and it is what made this worth owning.
    const offenders = scanFiles(
      ['src'],
      ['.ts', '.tsx'],
      /['"`]https:\/\/remishowmanager\.co\.uk\/shows\//,
    )
      // Tests are where the literal BELONGS: the feed's own test asserts the
      // exact public URL a consumer will publish, which is the one place that
      // should notice if the origin ever changes.
      .filter((m) => !m.file.startsWith('src/__tests__'));
    expect(offenders.map((m) => `${m.file}:${m.line}`)).toEqual([]);
  });
});
