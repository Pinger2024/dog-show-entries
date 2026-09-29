import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { canChangeEntryClasses, entryClassChangeBlock } from '@/lib/entry-edit-rules';

describe('entryClassChangeBlock — only a paid entry on an open show', () => {
  it.each([
    ['confirmed', 'entries_open', null],
    ['pending', 'entries_open', 'not_paid'],
    ['withdrawn', 'entries_open', 'not_paid'],
    ['cancelled', 'entries_open', 'not_paid'],
    ['confirmed', 'entries_closed', 'show_not_open'],
    ['confirmed', 'in_progress', 'show_not_open'],
  ])('entry %s on a show %s → %s', (entryStatus, showStatus, expected) => {
    expect(entryClassChangeBlock({ status: entryStatus }, { status: showStatus })).toBe(expected);
    expect(canChangeEntryClasses({ status: entryStatus }, { status: showStatus })).toBe(expected === null);
  });
});

/** Guard (bug hunt 2026-09-22): server, button and edit page share the rule. */
describe('entry class-change rule — one owner guard', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
  it('entries.update, the entry page button and the edit page all call the owner', () => {
    // entries.update and previewUpdate both price through priceEntryClassChange,
    // which is where the gate runs — so neither can skip it.
    expect(read('server/services/entry-change-pricing.ts')).toMatch(/entryClassChangeBlock\(entry, entry\.show\)/);
    expect(read('server/trpc/routers/entries.ts')).toMatch(/priceEntryClassChange\(ctx\.db/);
    expect(read('app/(dashboard)/entries/[id]/page.tsx')).toMatch(/canChangeEntryClasses\(entry, entry\.show\)/);
    expect(read('app/(shows)/shows/[id]/entries/[entryId]/edit/page.tsx')).toMatch(/entryClassChangeBlock\(entry, entry\.show\)/);
  });
  it("no page or router allows a 'pending' entry into Edit Classes by hand", () => {
    expect(read('app/(dashboard)/entries/[id]/page.tsx')).not.toMatch(/status === 'pending'\)\s*&&/);
    for (const f of ['server/trpc/routers/entries.ts', 'server/services/entry-change-pricing.ts']) {
      expect(read(f)).not.toMatch(/Only confirmed or pending entries can be modified/);
    }
  });
  it("the show half of the rule is entryWindowOpen's — status AND close date — not a second copy", () => {
    const rules = read('lib/entry-edit-rules.ts');
    expect(rules).toMatch(/entryWindowOpen\(show\)/);
    expect(rules).not.toMatch(/show\.status !== 'entries_open'/);
  });
});
