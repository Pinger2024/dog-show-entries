/**
 * Guard: "does this championship show have the classes it must have" has ONE
 * owner — `missingChampionshipClasses` (src/lib/championship-class-requirements.ts,
 * CLAUDE.md "One owner per rule").
 *
 * History: the rule ("every breed needs an Open + Limit class for both sexes
 * before a championship show is ready") was written down twice and the two
 * copies disagreed for single-breed shows whose class rows carry no breedId
 * (the normal case on this scope — see the lib's doc comment):
 *
 *  - Client: class-manager.tsx's live warning grouped classes by breed NAME
 *    and folded any class with no breedId into the show's one implicit
 *    breed, so a complete single-breed show showed no warning.
 *  - Server: secretary.ts `getChecklistAutoDetect` grouped by breed ID and
 *    `continue`d past any class row with a null breedId, so those rows never
 *    joined any breed's tally — a fully-classed single-breed show with null
 *    breedIds had `breedClassMap.size === 0`, and
 *    `breedClassMap.size > 0 && allBreedsComplete` was false. The checklist
 *    tick reported the show as NOT ready while the live warning on the same
 *    page showed nothing wrong.
 *
 * Below (a) proves that disagreement existed on data of exactly that shape,
 * and now proves it is fixed via the shared function. (b)-(d) guard against a
 * second copy reappearing: they scan for the known callers and fail if either
 * stops importing the owner, or if a NEW file starts re-deriving the
 * Open/Limit-per-breed-per-sex check inline.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrgAndBreed,
  makeShow,
  makeShowClass,
  makeClassDef,
} from '../helpers/factories';

const SRC = join(process.cwd(), 'src');
const OWNER = join(SRC, 'lib', 'championship-class-requirements.ts');
const SERVER_ROUTER = join(SRC, 'server', 'trpc', 'routers', 'secretary.ts');
const CLIENT_COMPONENT = join(
  SRC,
  'app',
  '(secretary)',
  'secretary',
  'shows',
  '[id]',
  '_components',
  'class-manager.tsx',
);

async function makeCompleteSingleBreedClasses(showId: string, breedId: string | null) {
  // class_definitions.name is UNIQUE — one 'Open' row and one 'Limit' row are
  // shared across the dog/bitch class rows, which differ by `sex` instead.
  const [openDef, limitDef] = await Promise.all([
    makeClassDef({ name: 'Open' }),
    makeClassDef({ name: 'Limit' }),
  ]);
  await Promise.all([
    makeShowClass({ showId, breedId: breedId ?? undefined, classDefinitionId: openDef.id, sex: 'dog' }),
    makeShowClass({ showId, breedId: breedId ?? undefined, classDefinitionId: openDef.id, sex: 'bitch' }),
    makeShowClass({ showId, breedId: breedId ?? undefined, classDefinitionId: limitDef.id, sex: 'dog' }),
    makeShowClass({ showId, breedId: breedId ?? undefined, classDefinitionId: limitDef.id, sex: 'bitch' }),
  ]);
}

describe('championship classes — one owner', () => {
  it('(a) single-breed championship show, complete Open+Limit for both sexes, NULL breedId on every row -> checklist reports it ready', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({
      organisationId: org.id,
      breedId: breed.id,
      showType: 'championship',
      showScope: 'single_breed',
    });
    // The bug: class rows on a single-breed show may carry no breed FK at
    // all — pass breedId: null explicitly, not the show's breed.
    await makeCompleteSingleBreedClasses(show.id, null);

    const caller = createTestCaller(user);
    const checklist = await caller.secretary.getChecklistAutoDetect({ showId: show.id });

    // This is the real observable field the checklist UI reads. Against the
    // pre-fix server copy this was `false` (the disagreement) even though
    // every required class exists.
    expect(checklist.championship_classes_complete).toBe(true);
  });

  it('(a2) same shape but missing Open Dog -> checklist correctly reports NOT ready', async () => {
    const { user, org, breed } = await makeSecretaryWithOrgAndBreed();
    const show = await makeShow({
      organisationId: org.id,
      breedId: breed.id,
      showType: 'championship',
      showScope: 'single_breed',
    });
    const [openDef, limitDef] = await Promise.all([
      makeClassDef({ name: 'Open' }),
      makeClassDef({ name: 'Limit' }),
    ]);
    await Promise.all([
      makeShowClass({ showId: show.id, classDefinitionId: openDef.id, sex: 'bitch' }),
      makeShowClass({ showId: show.id, classDefinitionId: limitDef.id, sex: 'dog' }),
      makeShowClass({ showId: show.id, classDefinitionId: limitDef.id, sex: 'bitch' }),
    ]);

    const caller = createTestCaller(user);
    const checklist = await caller.secretary.getChecklistAutoDetect({ showId: show.id });

    expect(checklist.championship_classes_complete).toBe(false);
  });

  it('(b) the known callers import the shared owner', () => {
    const server = readFileSync(SERVER_ROUTER, 'utf8');
    const client = readFileSync(CLIENT_COMPONENT, 'utf8');
    expect(server).toContain("from '@/lib/championship-class-requirements'");
    expect(server).toContain('missingChampionshipClasses(');
    expect(client).toContain("from '@/lib/championship-class-requirements'");
    expect(client).toContain('missingChampionshipClasses(');
  });

  it('(c) the rule itself lives in exactly one file', () => {
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
    const owners = sourceFiles(SRC).filter((f) =>
      readFileSync(f, 'utf8').includes('export function missingChampionshipClasses'),
    );
    expect(owners).toEqual([OWNER]);
  });

  it('(d) no other file re-derives the per-breed Open/Limit-per-sex tally inline', () => {
    // Scoped narrowly to the exact shape both pre-fix copies used: a class
    // named 'open' checked against sex 'dog' inline. This would false-flag on
    // an unrelated file that happens to compare a lower-cased string to
    // 'open' for a different reason, but nothing else in the codebase does —
    // and a genuine reintroduction of this rule will match it.
    const pattern = /(className|classDefinition(Name)?)[\s\S]{0,40}===\s*'open'[\s\S]{0,80}(hasOpenDog|hasOpenBitch)/;
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
    const offenders = sourceFiles(SRC)
      .filter((f) => f !== OWNER)
      .filter((f) => pattern.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
