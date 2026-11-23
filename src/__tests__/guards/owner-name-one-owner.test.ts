import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { findFiles } from '../helpers/static-scan';

// GUARD (3 Nov 2026): two people typed into one owner's name box, or an
// address typed into the name, are refused (Mandy 8175/8178). The rule lives
// in lib/owner-name.ts and nowhere else; every screen that takes an owner's
// or account holder's name and every server path that saves one uses it.
// Repro: integration/owner-name-refused.test.ts.

const R = (...p: string[]) => path.join('src', ...p);

const SERVER_WRITERS = [
  R('server', 'trpc', 'routers', 'dogs.ts'),
  R('server', 'trpc', 'routers', 'secretary.ts'),
  R('server', 'trpc', 'routers', 'onboarding.ts'),
  R('server', 'trpc', 'routers', 'users.ts'),
];
const SCREENS = [
  R('components', 'dogs', 'dog-form.tsx'),
  R('app', '(auth)', 'onboarding', 'onboarding-wizard.tsx'),
  R('app', '(dashboard)', 'settings', 'profile-form.tsx'),
  R('app', '(secretary)', 'secretary', 'shows', '[id]', 'entries', 'page.tsx'),
];

describe('the owner-name rule has one owner', () => {
  it.each(SERVER_WRITERS)('%s refuses a bad name with refineOwnerName', (file) => {
    expect(readFileSync(file, 'utf8')).toMatch(/refineOwnerName\('(owner|account)'\)/);
  });

  it('dogs.create and dogs.update share one owner-row schema', () => {
    const src = readFileSync(R('server', 'trpc', 'routers', 'dogs.ts'), 'utf8');
    expect(src).toMatch(/const dogOwnerInput = z\.object\(/);
    expect(src.match(/z\.array\(dogOwnerInput\)/g)).toHaveLength(2);
    expect(src).not.toMatch(/ownerName: z\.string\(\)\.min\(1, 'Owner name is required'\),/);
  });

  it.each(SCREENS)('%s checks the name with lib/owner-name', (file) => {
    expect(readFileSync(file, 'utf8')).toMatch(/from '@\/lib\/owner-name'/);
  });

  it('only the known server paths write owner rows', () => {
    const writers = findFiles('src', ['.ts', '.tsx'])
      .filter((f) => !f.includes(`${path.sep}__tests__${path.sep}`))
      .filter((f) => /\.insert\(dogOwners\)/.test(readFileSync(f, 'utf8')));
    expect(writers.map((f) => path.relative(process.cwd(), f)).sort()).toEqual(
      [R('server', 'trpc', 'routers', 'dogs.ts'), R('server', 'trpc', 'routers', 'secretary.ts')].sort(),
    );
  });

  it('the catalogue data checks call the same detection instead of keeping their own', () => {
    const src = readFileSync(R('lib', 'catalogue-data-checks.ts'), 'utf8');
    expect(src).toMatch(/ownerNameProblem\(name\) === 'two_people'/);
    expect(src).not.toMatch(/MULTI_PERSON_RE|TITLE_PAIR_RE/);
  });
});
