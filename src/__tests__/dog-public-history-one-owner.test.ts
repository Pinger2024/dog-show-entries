import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { scanFiles, PROJECT_ROOT } from './helpers/static-scan';

/**
 * One owner per rule (CLAUDE.md): what anyone other than the dog's owner may
 * see of a dog's show history.
 *
 * Mandy, 1 Oct 2026: "we should never show a dog and what its upcoming shows
 * are, only shows that are in the past, have been judged" — results and any
 * critiques, never where it is entered next (a judge could look the dog up).
 *
 * Rosebud Edie of Hundark's page body showed her four past shows correctly,
 * but the same page's link preview (generateMetadata) said "6 shows entered"
 * and its share image "6 Shows" — both counted her Midlands (4 Oct) and North
 * Eastern (11 Oct) entries. The rule had been written six times and the
 * copies disagreed:
 *  - dogs.getPublicProfile          — from the MORNING of the show, before judging
 *  - dog/[id]/page.tsx metadata     — no gate at all (upcoming entries counted)
 *  - dog/[id]/opengraph-image.tsx   — no gate (upcoming entries + unpublished 1sts)
 *  - sitemap.ts                     — lists dogs whose only entries are upcoming
 *  - timeline.getForDog             — published result (the right one)
 *  - timeline.getFeed, pro.getChampionshipProgress — any result, published or not
 *
 * shows.getShowDogPhotos (public, no page used it since June) handed out the
 * entered dogs' names and photos from the morning of the show; Mandy, 1 Oct:
 * "I'd rather that strip was only displayed after judging" — removed, so
 * shows.ts no longer reads a dog's entries at all.
 *
 * The owner is lib/public-dog-history.ts. Any file that reads a dog's entries
 * must go through it, or be listed in NOT_A_DOG_HISTORY_VIEW with the reason
 * no outsider ever sees what it reads.
 */
const OWNER = 'src/lib/public-dog-history.ts';

const NOT_A_DOG_HISTORY_VIEW: Record<string, string> = {
  'src/server/db/schema/entries.ts': 'the schema itself',
  'src/server/trpc/routers/entries.ts': "the signed-in exhibitor's own entries / duplicate check",
  'src/server/trpc/routers/orders.ts': 'checkout duplicate-entry check',
  'src/server/trpc/routers/dashboard.ts': "the signed-in user's own dogs",
  'src/server/trpc/routers/secretary.ts': "the show's secretary",
  'src/server/trpc/routers/admin-dashboard.ts': 'admin only',
  'src/server/services/achievements.ts': 'records a top award on show day (steward/secretary write path)',
  'src/server/services/show-metrics.ts': "a show's money",
  'src/server/services/regional-entry.ts': 'entry rule: one regional entry per dog',
  'src/server/services/test-data-generator.ts': 'test data',
};

const READS_A_DOGS_ENTRIES = /entries\.dogId/;

function filesReadingADogsEntries(): string[] {
  const hits = scanFiles(['src'], ['.ts', '.tsx'], READS_A_DOGS_ENTRIES).filter(
    (m) => !m.file.includes('__tests__'),
  );
  return [...new Set(hits.map((m) => m.file))].sort();
}

function importsOwner(file: string): boolean {
  const src = fs.readFileSync(path.join(PROJECT_ROOT, file), 'utf8');
  return /from\s+['"]@\/lib\/public-dog-history['"]/.test(src);
}

describe("a dog's public show history has one owner (lib/public-dog-history.ts)", () => {
  it('every file that reads a dog\'s entries goes through the owner, or is not a view of a dog\'s history', () => {
    const offenders = filesReadingADogsEntries().filter(
      (file) => file !== OWNER && !(file in NOT_A_DOG_HISTORY_VIEW) && !importsOwner(file),
    );
    expect(offenders).toEqual([]);
  });

  it('nothing outside the owner decides a show has "happened" by comparing its start date to today', () => {
    // e.g. `entry.show.startDate <= today` — how getPublicProfile let an entry
    // appear on the morning of the show, before the dog's class was judged.
    const hits = scanFiles(['src'], ['.ts', '.tsx'], /\.show\.startDate\s*<=\s*today/).filter(
      (m) => m.file !== OWNER && !(m.file in NOT_A_DOG_HISTORY_VIEW) && !m.file.includes('__tests__'),
    );
    expect(hits).toEqual([]);
  });

  it('the not-a-history list stays honest — every file on it still exists and still reads a dog\'s entries', () => {
    const reading = new Set(filesReadingADogsEntries());
    const stale = Object.keys(NOT_A_DOG_HISTORY_VIEW).filter((file) => !reading.has(file));
    expect(stale).toEqual([]);
  });
});
