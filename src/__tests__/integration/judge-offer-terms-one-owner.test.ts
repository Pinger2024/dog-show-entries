/**
 * Guard: the standard terms on a judge's offer have ONE owner,
 * src/lib/judge-offer-terms.ts, and the offer email is built in ONE place,
 * src/server/services/judge-offer-email.ts (CLAUDE.md, "One owner per rule").
 *
 * History: the offer email was hand-built three times in secretary.ts
 * (sendJudgeOffer, sendBulkJudgeOffers, resendJudgeOffer), each saying
 * something different. Collapsed 2026-11-14.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      sourceFiles(full, acc);
    } else if (/\.tsx?$/.test(name)) {
      acc.push(full);
    }
  }
  return acc;
}

const files = sourceFiles(SRC);
const rel = (f: string) => f.slice(SRC.length + 1);
const containing = (needle: string | RegExp) =>
  files
    .filter((f) => {
      const src = readFileSync(f, 'utf8');
      return typeof needle === 'string' ? src.includes(needle) : needle.test(src);
    })
    .map(rel)
    .sort();

describe('judge offer terms — one owner', () => {
  it('the F(1).21.b wording lives in exactly one source file', () => {
    expect(containing('agree to be bound by Royal Kennel Club Rules and Regulations')).toEqual([
      'lib/judge-offer-terms.ts',
    ]);
  });

  it('the JEP term lives in exactly one source file', () => {
    // Matches the owner's template ("Level ${jepLevel} or above") and any
    // hand-written copy with a digit ("Level 2 or above", "Level 4 or above").
    expect(containing(/Level (\d|\$\{[^}]+\}) or above/)).toEqual(['lib/judge-offer-terms.ts']);
    expect(containing('or above of the Royal Kennel Club Judges Education Programme')).toEqual([
      'lib/judge-offer-terms.ts',
    ]);
  });

  it('which JEP level a show asks for is decided in one place', () => {
    // societyTermsJepLevel owns "open → 2, championship → 4". The level is a
    // template value in the owner, so no file may write the term at a fixed level.
    expect(containing(/Level [0-9] or above/)).toEqual([]);
    expect(containing('export function societyTermsJepLevel')).toEqual(['lib/judge-offer-terms.ts']);
  });

  it('the "already agreed" question lives in exactly one source file', () => {
    expect(containing('anywhere before the date of this show')).toEqual(['lib/judge-offer-terms.ts']);
  });

  it('the offer email is built in exactly one place', () => {
    // The subject line is the stable marker of the offer email.
    expect(containing(/Judging Offer — \$\{/)).toEqual(['server/services/judge-offer-email.ts']);
  });

  it('every send path calls the one renderer', () => {
    const src = readFileSync(join(SRC, 'server/trpc/routers/secretary.ts'), 'utf8');
    expect((src.match(/renderJudgeOfferEmail\(/g) ?? []).length).toBe(3);
    expect((src.match(/offerTerms: terms/g) ?? []).length).toBe(3);
  });
});

describe('a judge who lives overseas — one rule, the judge\'s real flag everywhere', () => {
  // Mandy, 15 Nov 2026: an overseas judge gets the two F(1).21.b paragraphs
  // only. judgeOfferTerms owns that; its `judgeLivesOverseas` input is
  // required, and nothing may pass a made-up value.
  it('judgeOfferTerms is called only by the send paths\' one helper and the Send Offer dialog\'s preview', () => {
    const callers = containing(/judgeOfferTerms\(\{/).filter((f) => f !== 'lib/judge-offer-terms.ts');
    expect(callers).toEqual([
      'app/(secretary)/secretary/shows/[id]/_components/judge-section.tsx',
      'server/services/judge-offer-email.ts',
    ]);
  });

  it('no caller hard-codes the flag', () => {
    expect(containing(/judgeLivesOverseas:\s*(true|false)\b/)).toEqual([]);
    expect(containing(/judgeLivesOverseas:\s*[^,}\n]*\?\?\s*(true|false)/)).toEqual([]);
  });

  it('the send helper passes the judge row\'s own flag, and all three send paths hand it the judge', () => {
    const email = readFileSync(join(SRC, 'server/services/judge-offer-email.ts'), 'utf8');
    expect(email).toContain('judgeLivesOverseas: judge.livesOverseas,');
    const src = readFileSync(join(SRC, 'server/trpc/routers/secretary.ts'), 'utf8');
    const calls = src.match(/judgeOfferDetails\(show, assignments, [^)]+\)/g) ?? [];
    expect(calls).toEqual([
      'judgeOfferDetails(show, assignments, judge)', // sendJudgeOffer
      'judgeOfferDetails(show, assignments, contract.judge)', // resendJudgeOffer: the judge as they are now
      'judgeOfferDetails(show, assignments, judge)', // sendBulkJudgeOffers
    ]);
    expect((src.match(/judgeOfferDetails\(/g) ?? []).length).toBe(3);
  });

  it('the overseas rule is decided in the owner alone', () => {
    // Only the owner reads the input; every other file just passes it on.
    expect(containing('input.judgeLivesOverseas')).toEqual(['lib/judge-offer-terms.ts']);
  });

  it('the box\'s words live in exactly one source file', () => {
    expect(containing("gets the RKC's two paragraphs only")).toEqual(['lib/judge-offer-terms.ts']);
    // The label as code (a string, a JSX attribute or JSX text), not a comment.
    expect(containing(/['`]Lives overseas['`]|=\s*"Lives overseas"|>\s*Lives overseas\s*</)).toEqual([
      'lib/judge-offer-terms.ts',
    ]);
  });

  it('the box is one component', () => {
    expect(containing('export function LivesOverseasField')).toEqual(['components/judges/judge-offer-terms-view.tsx']);
  });
});
