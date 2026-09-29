import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { isVisibleToViewer } from '@/lib/result-visibility';

describe('isVisibleToViewer', () => {
  it('published → everyone; unpublished → only viewers allowed early; missing → nobody', () => {
    expect(isVisibleToViewer({ publishedAt: new Date() }, false)).toBe(true);
    expect(isVisibleToViewer({ publishedAt: null }, false)).toBe(false);
    expect(isVisibleToViewer({ publishedAt: null }, true)).toBe(true);
    expect(isVisibleToViewer(null, true)).toBe(false);
  });
});

/** Guard (bug hunt 2026-09-22): dog-level views gate through the owner. */
describe('result visibility — one owner guard (dog views)', () => {
  it.each(['dogs.ts', 'timeline.ts'])('%s has no hand-written publishedAt gate', (f) => {
    const src = readFileSync(join(__dirname, '../server/trpc/routers', f), 'utf8');
    expect(src).not.toMatch(/publishedAt\s*!==?\s*null/);
  });
  it('dogs.getShowResults gates on isVisibleToViewer', () => {
    const src = readFileSync(join(__dirname, '../server/trpc/routers/dogs.ts'), 'utf8');
    const block = src.slice(src.indexOf('getShowResults: protectedProcedure'));
    expect(block.slice(0, 4000)).toMatch(/isVisibleToViewer\(ec\.result, viewerMaySeeUnpublished\)/);
  });
});
