import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { findFiles, PROJECT_ROOT } from './helpers/static-scan';

/**
 * lucide-react exports an icon called `Map`. A file that imports it has lost
 * the built-in Map — `new Map()` there throws "Map is not a constructor" in
 * the browser. It crashed the secretary's documents page on demo (25 Sept
 * 2026) the moment a warning was grouped with a Map; `next build` does not
 * type-check (ignoreBuildErrors), so only this catches it before a user does.
 * Import the icon as `MapIcon` (`Map as MapIcon`) if a file needs both.
 */
describe('the lucide Map icon never hides the built-in Map', () => {
  it('no file imports the Map icon and also calls new Map', () => {
    const clashes = findFiles('src', ['.ts', '.tsx'])
      .filter((f) => !f.includes('__tests__'))
      .filter((f) => {
        const src = fs.readFileSync(f, 'utf-8');
        const lucideImport = src.match(/import\s*\{([^}]*)\}\s*from\s*['"]lucide-react['"]/);
        const importsMapIcon = !!lucideImport && /(^|[\s,])Map(\s*,|\s*$)/.test(lucideImport[1]);
        return importsMapIcon && /new\s+Map\b/.test(src);
      })
      .map((f) => path.relative(PROJECT_ROOT, f));
    expect(clashes).toEqual([]);
  });
});
