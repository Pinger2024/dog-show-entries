import { describe, it, expect } from 'vitest';
import { toClassList } from '@/server/services/critique-results-graph';

describe('toClassList — legacy class names with the sex baked in', () => {
  it('strips a trailing sex word that duplicates the class sex ("Baby Puppy Dog" → "Baby Puppy")', () => {
    const rows = [
      { id: 'a', className: 'Baby Puppy Dog', sex: 'dog' as const, entries: [] },
      { id: 'b', className: 'Baby Puppy Bitch', sex: 'bitch' as const, entries: [] },
      { id: 'c', className: 'Junior', sex: 'dog' as const, entries: [] },
    ];
    const list = toClassList(rows);
    expect(list.find((e) => e.showClassId === 'a')?.className).toBe('Baby Puppy');
    expect(list.find((e) => e.showClassId === 'b')?.className).toBe('Baby Puppy');
    expect(list.find((e) => e.showClassId === 'c')?.className).toBe('Junior');
  });

  it('leaves a cross-sex word alone (a "…Dog" name on a bitch class is not stripped)', () => {
    const rows = [{ id: 'x', className: 'Gun Dog', sex: 'bitch' as const, entries: [] }];
    expect(toClassList(rows)[0].className).toBe('Gun Dog');
  });
});
