/**
 * Which breed a new show class is saved with has ONE owner:
 * newShowClassBreed (src/lib/show-class-breed.ts). Mandy, Telegram 8355
 * (19 Nov 2026): a mixed class saved with no breed on a single-breed show gave
 * its judge the Junior Handling shape, so the offer said "/ Junior Handling".
 *
 * The guard below lists every place that inserts show_classes. A new one fails
 * this test until it either calls the owner or is shown here to never save a
 * breed-less, sex-less class that is not Junior Handling.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { newShowClassBreed } from '@/lib/show-class-breed';

const SINGLE = { showScope: 'single_breed', breedId: 'gsd' };
const GENERAL = { showScope: 'general', breedId: null };

describe('newShowClassBreed', () => {
  it('a mixed class on a single-breed show takes the show breed', () => {
    expect(newShowClassBreed(SINGLE, { sex: null, classDefinitionType: 'age' })).toEqual({ breedId: 'gsd', isBreedSpecific: true });
    expect(newShowClassBreed(SINGLE, { sex: undefined, classDefinitionType: 'special' })).toEqual({ breedId: 'gsd', isBreedSpecific: true });
  });

  it('Dog and Bitch classes on a single-breed show stay breed-less', () => {
    expect(newShowClassBreed(SINGLE, { sex: 'dog', classDefinitionType: 'age' })).toEqual({ breedId: null, isBreedSpecific: false });
    expect(newShowClassBreed(SINGLE, { sex: 'bitch', classDefinitionType: 'achievement' })).toEqual({ breedId: null, isBreedSpecific: false });
  });

  it('Junior Handling never takes a breed, even one the caller chose', () => {
    expect(newShowClassBreed(SINGLE, { sex: null, classDefinitionType: 'junior_handler' })).toEqual({ breedId: null, isBreedSpecific: false });
    expect(newShowClassBreed(GENERAL, { sex: null, classDefinitionType: 'junior_handler', breedId: 'lab' })).toEqual({ breedId: null, isBreedSpecific: false });
  });

  it('a breed the caller chose is kept', () => {
    expect(newShowClassBreed(GENERAL, { sex: 'dog', classDefinitionType: 'age', breedId: 'lab' })).toEqual({ breedId: 'lab', isBreedSpecific: true });
    expect(newShowClassBreed(SINGLE, { sex: null, classDefinitionType: 'age', breedId: 'gsd' })).toEqual({ breedId: 'gsd', isBreedSpecific: true });
  });

  it('an all-breed show, or a single-breed show with no breed set, leaves a breed-less class breed-less', () => {
    expect(newShowClassBreed(GENERAL, { sex: null, classDefinitionType: 'achievement' })).toEqual({ breedId: null, isBreedSpecific: false });
    expect(newShowClassBreed({ showScope: 'single_breed', breedId: null }, { sex: null, classDefinitionType: 'age' })).toEqual({ breedId: null, isBreedSpecific: false });
  });
});

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

/** The text of one tRPC procedure, from its name to the next procedure. */
function procedureBody(src: string, name: string): string {
  const start = src.indexOf(`  ${name}: `);
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  const rest = src.slice(start + name.length + 4);
  const next = rest.search(/\n  [a-zA-Z]+: (secretaryProcedure|protectedProcedure|publicProcedure|adminProcedure)/);
  return next === -1 ? rest : rest.slice(0, next);
}

describe('show class breed — one owner (guard)', () => {
  it('the rule is written only in lib/show-class-breed.ts', () => {
    const definers = sourceFiles(SRC)
      .filter((f) => /function newShowClassBreed\b/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(SRC.length + 1));
    expect(definers).toEqual(['lib/show-class-breed.ts']);
  });

  it('every place that inserts show classes is known', () => {
    const sites: Record<string, number> = {};
    for (const f of sourceFiles(SRC)) {
      const rel = f.slice(SRC.length + 1);
      if (rel === 'server/db/seed.ts') continue; // dev seed data, not an app path
      const n = (readFileSync(f, 'utf8').match(/insert\((?:schema\.|s\.)?showClasses\)/g) ?? []).length;
      if (n > 0) sites[rel] = n;
    }
    // A new insert site: route its breed through newShowClassBreed, then add it here.
    expect(sites).toEqual({
      'server/trpc/routers/shows.ts': 3,
      'server/trpc/routers/secretary.ts': 3,
    });
  });

  const secretary = readFileSync(join(SRC, 'server/trpc/routers/secretary.ts'), 'utf8');
  const showsRouter = readFileSync(join(SRC, 'server/trpc/routers/shows.ts'), 'utf8');

  it('Add Individual Class and bulk class creation call the owner', () => {
    for (const name of ['addShowClass', 'bulkCreateClasses']) {
      const body = procedureBody(secretary, name);
      expect(body, name).toContain('newShowClassBreed(');
      // No hand-set breed on an inserted class: it comes from the owner.
      expect(body, name).not.toMatch(/breedId: (null|breedId|input\.breedId \?\? null),/);
      expect(body, name).not.toMatch(/isBreedSpecific: (true|false|!!input\.breedId),/);
    }
  });

  it("the show wizard's single-breed classes call the owner", () => {
    const create = procedureBody(showsRouter, 'create');
    const singleBreed = create.slice(create.indexOf('single-breed flow'), create.indexOf('all-breed shows (per-breed classes)'));
    expect(singleBreed.length).toBeGreaterThan(0);
    expect(singleBreed).toContain('newShowClassBreed(');
    expect((singleBreed.match(/values\.push\(\{/g) ?? []).length).toBe((singleBreed.match(/\.\.\.breedFor\(/g) ?? []).length);
  });

  it('the paths exempt from the owner never save a breed-less mixed class', () => {
    const create = procedureBody(showsRouter, 'create');
    // All-breed wizard: every class carries the breed it is created for.
    const allBreed = create.slice(create.indexOf('all-breed shows (per-breed classes)'), create.indexOf('SV/WUSV ruleset auto-setup'));
    expect(allBreed).not.toMatch(/breedId: null/);
    // Regional (SV) wizard: every class is Dog or Bitch.
    const sv = create.slice(create.indexOf('SV/WUSV ruleset auto-setup'));
    expect(sv).toContain('SV_CLASS_AUTO_CREATE_COMBOS');
    expect(sv.slice(0, sv.indexOf('insert(showClasses)'))).not.toMatch(/sex: null/);
    // Regional class editor: its only sex-less classes are Junior Handling.
    const wusv = procedureBody(secretary, 'setupWusvClasses');
    const sexless = wusv.split('values.push({').slice(1).filter((push) => /sex: null/.test(push.slice(0, push.indexOf('});'))));
    expect(sexless.length).toBeGreaterThan(0);
    for (const push of sexless) expect(wusv.slice(wusv.indexOf(push) - 200, wusv.indexOf(push))).toMatch(/Junior Handler/);
  });
});
