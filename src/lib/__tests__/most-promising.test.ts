/**
 * Mandy, 30 Sept 2026 (before Midland Regional, 4 Oct): "the most promising
 * dog should just include the male classes and should only include the
 * winners from minor, puppy and junior including the long coat classes and
 * the bitch list should be the same but only for bitches".
 *
 * Bug hunt, 22 Sept: the secretary's Most Promising Dog picker offered
 * bitches. `awardFilter` gave the two Most Promising awards no sex (they were
 * never added to DOG_AWARDS / BITCH_AWARDS) and no class rule, so the picker
 * offered every placed dog of either sex, the server accepted either sex, and
 * the Judge's Book filed both awards with the overall awards on the back page.
 * The steward screen had its own correct copy of the rule — two owners.
 *
 * One owner now: `awardFilter` (sex + young-class-winner) and the placement
 * index's `wonYoungClass`, built from `MOST_PROMISING_CLASS_NAMES`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  awardFilter,
  bestAwardSection,
  buildPlacementIndex,
  eligibleCandidates,
  resolveTopAwards,
  type IndexClass,
} from '@/lib/top-awards';

// A Midland-shaped regional: each age class split by coat (1a Long / 1b
// Short) and by sex. Winners are the dogs named *-1.
const classes: IndexClass[] = [];
const dogsSex = new Map<string, 'dog' | 'bitch'>();
function cls(key: string, className: string, sex: 'dog' | 'bitch', dogIds: string[]) {
  classes.push({ key, className, results: dogIds.map((dogId, i) => ({ dogId, placement: i + 1 })) });
  for (const id of dogIds) dogsSex.set(id, sex);
}
cls('bp-d', 'SV Baby Puppy', 'dog', ['babyD-1']);
cls('mp-lc-d', 'SV Minor Puppy', 'dog', ['mpLcD-1', 'mpLcD-2']);
cls('mp-sc-d', 'SV Minor Puppy', 'dog', ['mpScD-1']);
cls('p-sc-d', 'SV Puppy', 'dog', ['pScD-1']);
cls('j-lc-d', 'SV Junior', 'dog', ['jLcD-1', 'jLcD-2']);
cls('y-sc-d', 'SV Yearling', 'dog', ['yScD-1']);
cls('a-sc-d', 'SV Adult', 'dog', ['aScD-1']);
cls('mp-lc-b', 'SV Minor Puppy', 'bitch', ['mpLcB-1']);
cls('j-sc-b', 'SV Junior', 'bitch', ['jScB-1', 'jScB-2']);
cls('w-sc-b', 'SV Working', 'bitch', ['wScB-1']);

const dogs = [...dogsSex].map(([dogId, sex]) => ({ dogId, sex }));
const index = buildPlacementIndex(classes);
const award = (name: string) => resolveTopAwards('open', [name], 'wusv')[0]!;

describe('Most Promising Dog / Bitch — one rule for picker, server and Judge\'s Book', () => {
  it('Most Promising Dog is for dogs and Most Promising Bitch for bitches', () => {
    expect(awardFilter('most_promising_young_dog').sex).toBe('dog');
    expect(awardFilter('most_promising_young_bitch').sex).toBe('bitch');
  });

  it("files them on the Judge's Book dog and bitch award pages, not the overall back page", () => {
    expect(bestAwardSection('Most Promising Dog')).toBe('dog');
    expect(bestAwardSection('Most Promising Bitch')).toBe('bitch');
  });

  it('Most Promising Dog offers only the dog winners of Minor Puppy, Puppy and Junior, both coats', () => {
    const offered = eligibleCandidates(award('Most Promising Dog'), dogs, index).map((d) => d.dogId);
    expect(offered.sort()).toEqual(['jLcD-1', 'mpLcD-1', 'mpScD-1', 'pScD-1']);
  });

  it('Most Promising Bitch offers only the bitch winners of Minor Puppy, Puppy and Junior', () => {
    const offered = eligibleCandidates(award('Most Promising Bitch'), dogs, index).map((d) => d.dogId);
    expect(offered.sort()).toEqual(['jScB-1', 'mpLcB-1']);
  });

  it("the steward screen reads the young classes from the shared rule, not its own list", () => {
    const page = readFileSync(join(process.cwd(), 'src', 'app', '(steward)', 'steward', 'shows', '[id]', 'page.tsx'), 'utf8');
    expect(page).not.toMatch(/new Set\(\[\s*'Minor Puppy',\s*'Puppy',\s*'Junior'\s*\]\)/);
    expect(page).toMatch(/MOST_PROMISING_CLASS_NAMES|isMostPromisingClass/);
  });
});
