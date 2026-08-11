import { describe, it, expect } from 'vitest';
import { DEFAULT_BEST_AWARDS, OPTIONAL_AWARDS } from '../best-awards';
import { awardNameToType } from '../top-awards';

// The Awards Picker (src/components/awards/awards-picker.tsx) replaces
// free-typed award names with a tick-list drawn from DEFAULT_BEST_AWARDS and
// OPTIONAL_AWARDS. The whole point of ticking instead of typing is that
// everything pickable is guaranteed recordable — Mandy found live shows
// where a misspelt award name printed fine in the catalogue but silently
// never reached the results recording page (2026-08-11). This test locks
// that invariant: every name a secretary can tick maps to a real
// AchievementType.

describe('award vocabulary — everything pickable is recordable', () => {
  it('every DEFAULT_BEST_AWARDS name maps via awardNameToType', () => {
    const unrecordable: string[] = [];
    for (const [showType, names] of Object.entries(DEFAULT_BEST_AWARDS)) {
      for (const name of names) {
        if (!awardNameToType(name)) unrecordable.push(`${showType}: "${name}"`);
      }
    }
    expect(unrecordable).toEqual([]);
  });

  it('every OPTIONAL_AWARDS name maps via awardNameToType', () => {
    const unrecordable = OPTIONAL_AWARDS.filter((name) => !awardNameToType(name));
    expect(unrecordable).toEqual([]);
  });

  it('OPTIONAL_AWARDS has no duplicate entries', () => {
    const canon = (a: string) => a.trim().toLowerCase();
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const name of OPTIONAL_AWARDS) {
      const key = canon(name);
      if (seen.has(key)) dupes.push(name);
      seen.add(key);
    }
    expect(dupes).toEqual([]);
  });
});
