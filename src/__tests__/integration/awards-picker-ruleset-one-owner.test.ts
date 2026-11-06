/**
 * Guard: every <AwardsPicker> and <EditAwardsDialog> in the app passes
 * `showRuleset`. A regional is showType 'championship' + showRuleset 'wusv';
 * without the ruleset the picker offers the RKC list. On 21 Sept 2026 the
 * Sponsors page's dialog call site omitted it (the prop was optional, so
 * tsc said nothing) and a regional secretary was offered Challenge
 * Certificates. The prop is now required; this test catches a future
 * `showRuleset={undefined}`-shaped regression tsc would still allow.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');
function tsxFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      tsxFiles(full, acc);
    } else if (name.endsWith('.tsx')) acc.push(full);
  }
  return acc;
}

describe('awards picker — every call site passes the show ruleset', () => {
  it('no <AwardsPicker or <EditAwardsDialog usage without a showRuleset prop', () => {
    const offenders: string[] = [];
    for (const file of tsxFiles(SRC)) {
      const src = readFileSync(file, 'utf8');
      const re = /<(AwardsPicker|EditAwardsDialog)\b([^>]*?)\/?>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const props = m[2] ?? '';
        if (!/\bshowRuleset=/.test(props)) {
          offenders.push(`${file.slice(SRC.length + 1)}: <${m[1]} …> without showRuleset`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
