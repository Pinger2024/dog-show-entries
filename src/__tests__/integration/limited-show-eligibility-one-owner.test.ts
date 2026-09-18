/**
 * Guard: the "Limited show eligibility" rule (RKC 2026) has ONE owner, and
 * every path that can let a dog into a Limited show uses it.
 *
 * History (CLAUDE.md, "One owner per rule"): `dogs.checkLimitedShowEligibility`
 * (the enter page's warning) applied `effectiveCcType` — the 2026-07-09 ruling
 * that a single-breed championship Best Dog/Bitch counts as the CC/RCC.
 * `orders.checkout` hand-rolled the same rule against a hardcoded CC/RCC
 * type list with no `effectiveCcType` mapping, so a dog whose only "CC" was
 * an effective one (a single-breed championship Best Dog) was warned on the
 * enter page but not blocked at checkout. Fixed 2026-09-18 by routing both
 * through `getLimitedShowEligibility`.
 *
 * This test fails if a new hardcoded CC/RCC type-list check for Limited-show
 * ineligibility appears outside the owning service, or if the two known
 * callers stop referencing the owner.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');

/** Every .ts/.tsx file under src/, excluding tests and the owning service. */
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

const OWNER = join(SRC, 'server', 'services', 'limited-show-eligibility.ts');

/**
 * A file has a hand-rolled copy of the CC/RCC hardcoded type list for THIS
 * rule only if it builds an `inArray(achievements.type, ...)` (or similar
 * membership check) over a literal list containing both a dog-CC and
 * bitch-CC type AND the file's own text ties that check to Limited-show
 * ineligibility (the message this rule throws). Just mentioning 'dog_cc' /
 * 'bitch_cc' or the word "limited" is not enough on its own — dogs.ts
 * legitimately has both for unrelated reasons (title-progress code, the
 * `checkLimitedShowEligibility` endpoint name/comment that calls the owner).
 */
function hasHardcodedCcListForLimitedShows(src: string): boolean {
  const hasCcRccLiterals = src.includes("'dog_cc'") && src.includes("'bitch_cc'");
  const hasMembershipCheck = /inArray\(\s*achievements\.type/.test(src);
  const mentionsLimitedIneligibility = /ineligible for Limited shows/.test(src);
  return hasCcRccLiterals && hasMembershipCheck && mentionsLimitedIneligibility;
}

describe('Limited show eligibility — one owner', () => {
  it('the rule itself lives in exactly one file', () => {
    const owners = sourceFiles(SRC).filter((f) =>
      readFileSync(f, 'utf8').includes('export async function getLimitedShowEligibility'),
    );
    expect(owners.map((f) => f.slice(SRC.length + 1))).toEqual([
      'server/services/limited-show-eligibility.ts',
    ]);
  });

  it('no file outside the owner hand-rolls the hardcoded CC/RCC list for Limited shows', () => {
    const offenders = sourceFiles(SRC)
      .filter((f) => f !== OWNER)
      .filter((f) => hasHardcodedCcListForLimitedShows(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([]);
  });

  it('dogs.ts and orders.ts both call getLimitedShowEligibility', () => {
    const dogsSrc = readFileSync(join(SRC, 'server', 'trpc', 'routers', 'dogs.ts'), 'utf8');
    const ordersSrc = readFileSync(join(SRC, 'server', 'trpc', 'routers', 'orders.ts'), 'utf8');
    expect(dogsSrc).toContain('getLimitedShowEligibility');
    expect(ordersSrc).toContain('getLimitedShowEligibility');
  });
});
