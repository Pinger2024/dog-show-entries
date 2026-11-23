import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { findFiles } from '../helpers/static-scan';
import { isCcShow, effectiveCcType } from '@/lib/effective-achievement-type';

// GUARD (3 Nov 2026): a Best Bitch at an SV regional counted as a CC — on the
// dog's record, its class choices, Limited-show eligibility and title tracking
// — because regionals are stored show_type 'championship' and the CC rule
// never looked at the ruleset (support request, Arnis Meijers). The rule now
// takes the whole show; every caller must load showRuleset for it.
// Repro: integration/regional-best-is-not-a-cc.test.ts.

describe('the CC rule knows a regional awards no CCs', () => {
  it('a regional Best Dog/Bitch stays a Best Dog/Bitch; an RKC one is the CC', () => {
    const regional = { showType: 'championship', showScope: 'single_breed', showRuleset: 'wusv' };
    const rkc = { showType: 'championship', showScope: 'single_breed', showRuleset: 'rkc' };
    expect(isCcShow(regional)).toBe(false);
    expect(effectiveCcType('best_bitch', regional)).toBe('best_bitch');
    expect(effectiveCcType('best_dog', regional)).toBe('best_dog');
    expect(effectiveCcType('best_bitch', rkc)).toBe('bitch_cc');
  });

  it('every caller of effectiveCcType loads the show ruleset', () => {
    const callers = findFiles('src', ['.ts', '.tsx'])
      .filter((f) => !f.includes(`${path.sep}__tests__${path.sep}`))
      .filter((f) => !f.endsWith(path.join('lib', 'effective-achievement-type.ts')))
      .filter((f) => /\beffectiveCcType\(/.test(readFileSync(f, 'utf8')));
    expect(callers.length).toBeGreaterThan(0);
    for (const f of callers) {
      const src = readFileSync(f, 'utf8');
      expect(src, `${f} must select showRuleset for the CC rule`).toMatch(/showRuleset(: true|: shows\.showRuleset)/);
      // The old positional form (type, showType, showScope) cannot see the ruleset.
      expect(src, f).not.toMatch(/effectiveCcType\([^)]*showType[^)]*showScope/);
    }
  });
});
