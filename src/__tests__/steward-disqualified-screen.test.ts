/**
 * The steward's class page at a regional (Mandy, 16 Nov 2026): a dog
 * disqualified for growling at the judge could only be marked Unplaced, or
 * given a placing AND the grade Disqualified — which the screen then read as
 * "3rd". The Status menu now offers Disqualified at regionals, and the dog
 * moves to its own Disqualified group at the foot of the class.
 *
 * The groups are decided by `groupStewardClassEntries` (lib/steward-class-groups.ts),
 * tested here as behaviour; the menu and the group's markup are pinned by a
 * source test, as the page is a client component full of tRPC hooks.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { groupStewardClassEntries } from '@/lib/steward-class-groups';
import { stewardStatusWrite } from '@/lib/sv-grading';
import { PROJECT_ROOT, scanFiles } from './helpers/static-scan';

type E = {
  id: string;
  absent: boolean;
  result: { placement: number | null; placementStatus: string | null; svGrade: string | null } | null;
};
const dog = (id: string, result: E['result'], absent = false): E => ({ id, absent, result });
const ids = (list: E[]) => list.map((e) => e.id);

describe('groupStewardClassEntries — a Disqualified dog has its own group', () => {
  const dq = { ...stewardStatusWrite('disqualified') };
  const entries: E[] = [
    dog('first', { placement: 1, placementStatus: null, svGrade: 'v' }),
    dog('waiting', null),
    dog('withheld', { placement: null, placementStatus: 'withheld', svGrade: null }),
    dog('unplaced', { placement: null, placementStatus: 'unplaced', svGrade: null }),
    dog('growler', dq),
    dog('away', null, true),
  ];
  const g = groupStewardClassEntries(entries);

  it('puts the Disqualified dog in the Disqualified group only — not Unplaced, not the ladder', () => {
    expect(ids(g.disqualified)).toEqual(['growler']);
    expect(ids(g.unplaced)).toEqual(['unplaced']);
    expect(ids(g.withheld)).toEqual(['withheld']);
    expect(ids(g.absent)).toEqual(['away']);
    expect([...g.placedByValue.entries()].map(([n, e]) => [n, e.id])).toEqual([[1, 'first']]);
  });

  it('counts the Disqualified dog as dealt with — it is not waiting to be placed', () => {
    expect(ids(g.remaining)).toEqual(['waiting']);
    const done = groupStewardClassEntries(entries.filter((e) => e.id !== 'waiting'));
    expect(done.remaining).toEqual([]);
  });

  it('a dog recorded the old way ("3rd" and Disqualified) stays on the ladder, not in the group', () => {
    const legacy = groupStewardClassEntries([dog('old', { placement: 3, placementStatus: null, svGrade: 'disqualified' })]);
    expect(legacy.disqualified).toEqual([]);
    expect(legacy.placedByValue.get(3)?.id).toBe('old');
  });
});

describe('steward class page — the Status menu and the Disqualified group', () => {
  const page = fs.readFileSync(
    path.join(PROJECT_ROOT, 'src/app/(steward)/steward/shows/[id]/classes/[classId]/page.tsx'),
    'utf8',
  );

  it('offers "Disqualified" in the Status menu at regionals only, recorded through the shared helper', () => {
    // The DogCard gets the handler only on a regional.
    expect(page).toMatch(/onDisqualify=\{isWusv \?/);
    expect(page).toMatch(/\{onDisqualify && \(/);
    expect(page).toContain("setStatus(entry.entryClassId, 'disqualified'");
    expect(page).toContain('...stewardStatusWrite(status)');
    expect(page).toMatch(/>\s*Disqualified\s*</);
  });

  it('Withheld and Unplaced go through the same helper, so they clear a Disqualified grade', () => {
    expect(page).toContain('stewardStatusWrite(status)');
    expect(page).not.toMatch(/placementStatus: status,/);
  });

  it('shows the Disqualified group with the other groups at the foot of the class', () => {
    expect(page).toMatch(/title="Disqualified"/);
    expect(page).toContain('groupStewardClassEntries(entries)');
  });

  it('Status menu items and the group buttons are at least 44px tall', () => {
    const menu = page.slice(page.indexOf('<PopoverContent'), page.indexOf('</PopoverContent>'));
    const menuButtons = menu.match(/<button[\s\S]*?>/g) ?? [];
    expect(menuButtons.length).toBeGreaterThanOrEqual(4);
    for (const b of menuButtons) expect(b).toContain('min-h-11');
    const card = page.slice(page.indexOf('function CategoryCard'));
    expect(card).toMatch(/<Button[\s\S]*?className="[^"]*min-h-11/);
  });
});

describe('one owner for the Disqualified shape', () => {
  it('nothing outside lib/sv-grading.ts writes or tests "disqualified" by hand', () => {
    const pattern = /(?:===|!==)\s*'disqualified'|svGrade\s*:\s*'disqualified'/;
    const hits = scanFiles(['src/app', 'src/components', 'src/server', 'src/lib'], ['.ts', '.tsx'], pattern).filter(
      (m) => m.file !== 'src/lib/sv-grading.ts' && !m.file.includes('__tests__'),
    );
    expect(hits.map((h) => `${h.file}:${h.line}`)).toEqual([]);
  });
});

describe('public results page — the Disqualified rating fits its badge', () => {
  // Badges are overflow-hidden; a fixed 4rem (sm:w-16) clipped "Disqualified"
  // to "Disqualifi" on anything wider than a phone. A minimum width keeps the
  // short ratings (V1, SG2) lined up and lets the long one grow.
  it('the regional rating badge has a minimum width, not a fixed one', () => {
    const page = fs.readFileSync(path.join(PROJECT_ROOT, 'src/app/(shows)/shows/[id]/results/page.tsx'), 'utf8');
    const svBadge = page.slice(page.indexOf('svRatings?.get(result.entryClassId) ?'), page.indexOf('{svRatings.get(result.entryClassId)}'));
    expect(svBadge).toContain('sm:min-w-16');
    expect(svBadge).not.toMatch(/sm:w-16/);
  });
});
