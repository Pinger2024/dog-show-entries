import { describe, it, expect } from 'vitest';
import { scanFiles, type Match } from '../helpers/static-scan';

/**
 * What a show's TYPE is called has ONE owner: `displayShowTypeLabel` /
 * `displayShowTypeTitle` / `displayShowType` in src/lib/show-types.ts.
 *
 * Mandy, 25 Oct 2026: a dog's public page called the SV/WUSV regionals
 * "Championship". Regionals are stored as showType 'championship' with
 * showRuleset 'wusv'; ~13 files carried their own copy of the label table, so
 * the one that knew about regionals was the exception, not the rule.
 *
 * Behaviour gates (`showType === 'championship'` deciding steward sections,
 * CC headers and so on) are RULES, not labels, and are not policed here.
 */

const OWNER = 'src/lib/show-types.ts';
const OWNER_MSG = `use displayShowTypeLabel / displayShowTypeTitle / displayShowType (${OWNER})`;

const sourceMatches = (pattern: RegExp): Match[] =>
  scanFiles(['src'], ['.ts', '.tsx'], pattern).filter(
    (m) => m.file !== OWNER && !m.file.includes('__tests__'),
  );
const show = (matches: Match[]) => matches.map((m) => `  ${m.file}:${m.line}  ${m.content}`).join('\n');

describe('show type label — one owner', () => {
  it('no second label table', () => {
    // Catches 'Premier Open' and 'Premier Open Show' tables alike.
    const found = sourceMatches(/premier_open\s*:\s*['"]Premier Open/);
    expect(found, `a second show-type label table; ${OWNER_MSG}:\n${show(found)}`).toEqual([]);
  });

  it('no hand-written regional rule', () => {
    const found = sourceMatches(/\?\s*['"]Regional['"]/);
    expect(found, `a hand-written wusv -> "Regional" ternary; ${OWNER_MSG}:\n${show(found)}`).toEqual([]);
  });

  it('showTypeLabels[...] is read only by the owner and the shows-list filter', () => {
    // src/components/shows/shows-list.tsx labels the enum FILTER chip and
    // dropdown (the list of types a person can filter by), not a show.
    const found = sourceMatches(/\bshowTypeLabels\[/).filter(
      (m) => m.file !== 'src/components/shows/shows-list.tsx',
    );
    expect(found, `indexing the enum table ignores the regional ruleset; ${OWNER_MSG}:\n${show(found)}`).toEqual([]);
  });

  it('no humanised raw enum', () => {
    const found = sourceMatches(/\.showType\.replace\(/);
    expect(found, `humanising the raw showType prints "Championship" for a regional; ${OWNER_MSG}:\n${show(found)}`).toEqual([]);
  });
});
