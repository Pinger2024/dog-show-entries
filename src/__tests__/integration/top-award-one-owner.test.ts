/**
 * Guard: recording a show's top award has ONE owner — `recordTopAward` in
 * src/server/services/achievements.ts — and the rules it owns (which previous
 * holder is replaced, the award's sex, publishing a post-publish correction)
 * are not written a second time anywhere else.
 *
 * Why (bug hunt, 22 Sept 2026): the secretary and steward routers each had
 * their own copy. The secretary's "unique award" list predated configurable
 * Best Awards, so correcting Best Dog / Most Promising Dog from A to B left
 * both dogs holding it; the steward's removed every holder in the show, so on
 * a multi-breed show one breed's Best of Breed wiped another's; and the
 * secretary's inserted post-publish corrections unpublished, forever.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(process.cwd(), 'src');
const OWNER = 'server/services/achievements.ts';
// Self-reported results on a dog's own profile: no show, so no holder rule.
// Allowed to write its own rows — checked below to stay show-less.
const SELF_REPORTED = 'server/trpc/routers/dogs.ts';

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      sourceFiles(full, acc);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      acc.push(full);
    }
  }
  return acc;
}

const files = sourceFiles(SRC).map((full) => ({
  rel: relative(SRC, full),
  src: readFileSync(full, 'utf8'),
}));

describe('top awards — one owner', () => {
  it('only the owner inserts or deletes show achievements', () => {
    const writes = /\.(insert|delete)\(\s*(schema\.)?achievements\s*\)|\b(INSERT\s+INTO|DELETE\s+FROM)\s+"?achievements"?\b/gi;
    const offenders: string[] = [];
    for (const { rel, src } of files) {
      if (rel === OWNER || rel === SELF_REPORTED) continue;
      for (const m of src.matchAll(writes)) offenders.push(`${rel}: ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });

  it("the dogs router's own achievement writes are self-reported, show-less results", () => {
    const dogsRouter = files.find((f) => f.rel === SELF_REPORTED)!.src;
    const inserts = [...dogsRouter.matchAll(/\.insert\(\s*achievements\s*\)[\s\S]*?\.values\(\{([\s\S]*?)\}\)/g)];
    expect(inserts.length).toBeGreaterThan(0);
    for (const m of inserts) expect(m[1]).toMatch(/showId:\s*null/);
  });

  it('both routers record through recordTopAward', () => {
    for (const rel of ['server/trpc/routers/secretary.ts', 'server/trpc/routers/steward.ts']) {
      const src = files.find((f) => f.rel === rel)!.src;
      expect(src, rel).toMatch(/recordAchievement:[\s\S]*?recordTopAward\(ctx\.db, input\)/);
    }
  });

  it('no hand-rolled award lists come back (holder uniqueness, sex)', () => {
    // The holder rule is awardHolderScope and the sex rule is awardFilter,
    // both in lib/top-awards.ts. These are the names the copies went by.
    const copies = /\b(UNIQUE_SHOW_AWARDS|DOG_ONLY_AWARDS|BITCH_ONLY_AWARDS|requiredSexForAward)\b/g;
    const offenders: string[] = [];
    for (const { rel, src } of files) {
      for (const m of src.matchAll(copies)) offenders.push(`${rel}: ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });
});
