import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { findFiles, PROJECT_ROOT } from '../helpers/static-scan';
import { parseCatalogueLine, stripPlacingList } from '@/lib/critique-parse';
import { critiqueClassLabel } from '@/lib/critique-match';
import { duplicateTargetIds } from '@/lib/critique-publish-gate';

// Mandy, 30 Oct 2026: a judge's critiques by catalogue number. Three new
// rules, each with one owner:
//   - what a catalogue-number line / a heading's placing order looks like
//     → src/lib/critique-parse.ts (parseCatalogueLine, stripPlacingList);
//   - how a class is named to people in review ("Limit Dog", "Veteran")
//     → src/lib/critique-match.ts (critiqueClassLabel);
//   - two critiques on one dog block publishing
//     → src/lib/critique-publish-gate.ts (duplicateTargetIds).
// And ONE path from a document's text to reviewable blocks — the upload
// route and the secretary's "read again" both call readCritiqueDocument.

const PARSER = path.join('src', 'lib', 'critique-parse.ts');
const MATCHER = path.join('src', 'lib', 'critique-match.ts');
const READER = path.join('src', 'server', 'services', 'critique-read.ts');
const rel = (f: string) => path.relative(PROJECT_ROOT, f);
const sources = () =>
  findFiles('src', ['.ts', '.tsx']).filter((f) => !rel(f).includes(`${path.sep}__tests__${path.sep}`));

describe('the numbered critique layout has one owner', () => {
  it('src/lib/critique-parse.ts owns the catalogue-number line and the placing order', () => {
    expect(parseCatalogueLine('14. Large expressive dog.')).toEqual({ catalogueNumber: '14', rest: 'Large expressive dog.' });
    expect(parseCatalogueLine('1st. Owner, Dog, bn 1.1.25')).toBeNull();
    expect(stripPlacingList('Yearling (Dogs) (17-16-14-15)')).toEqual({
      heading: 'Yearling (Dogs)',
      placings: ['17', '16', '14', '15'],
    });
    expect(stripPlacingList('Puppy Bitch (7 entered)')).toEqual({ heading: 'Puppy Bitch (7 entered)', placings: null });
    expect(critiqueClassLabel('Limit', 'dog')).toBe('Limit Dog');
    expect(critiqueClassLabel('Veteran', null)).toBe('Veteran');
    expect([...duplicateTargetIds([])]).toEqual([]);
  });

  it('no other file hand-rolls a catalogue-number regex, and the critique screens never name a class by hand', () => {
    const offenders: string[] = [];
    const critiqueScreens = (r: string) =>
      r.includes(`${path.sep}critiques${path.sep}`) || r.endsWith(`${path.sep}critiques.ts`);
    for (const f of sources()) {
      const r = rel(f);
      if (r === PARSER || r === MATCHER) continue;
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        // A regex quantifier for a catalogue number anywhere; a hand-typed
        // "sex === 'dog' ? ' Dog'" label on a critique screen (the wider
        // app's sex-word copies are a known, older duplication).
        if (/\\d\{1,4\}/.test(line) || (critiqueScreens(r) && /=== 'dog' \? ' ?Dog'/.test(line))) {
          offenders.push(`${r}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(
      offenders,
      'Use parseCatalogueLine()/stripPlacingList() from src/lib/critique-parse.ts and critiqueClassLabel() from src/lib/critique-match.ts.',
    ).toEqual([]);
  });

  it('a document is read by readCritiqueDocument and nothing else parses or matches one', () => {
    const offenders: string[] = [];
    for (const f of sources()) {
      const r = rel(f);
      if (r === READER || r === PARSER || r === MATCHER) continue;
      const src = readFileSync(f, 'utf8');
      if (/\bparseCritiqueDocument\(/.test(src) || /\bmatchCritiqueBlocks\(/.test(src)) offenders.push(r);
    }
    expect(offenders, 'Call readCritiqueDocument() from src/server/services/critique-read.ts.').toEqual([]);
    const route = readFileSync(path.join(PROJECT_ROOT, 'src', 'app', 'api', 'critique-upload', '[token]', 'route.ts'), 'utf8');
    const router = readFileSync(path.join(PROJECT_ROOT, 'src', 'server', 'trpc', 'routers', 'critiques.ts'), 'utf8');
    expect(route).toMatch(/readCritiqueDocument\(/);
    expect(router).toMatch(/readCritiqueDocument\(/);
  });
});
