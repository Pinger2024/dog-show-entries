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
    expect(containing('Level 2 or above')).toEqual(['lib/judge-offer-terms.ts']);
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
