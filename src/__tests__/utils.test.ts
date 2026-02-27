import { describe, it, expect } from 'vitest';
import { formatDogName, getTitleDisplay } from '@/lib/utils';

describe('getTitleDisplay', () => {
  it('returns display string for known titles', () => {
    expect(getTitleDisplay('ch')).toBe('Ch.');
    expect(getTitleDisplay('sh_ch')).toBe('Sh.Ch.');
    expect(getTitleDisplay('ir_ch')).toBe('Ir.Ch.');
    expect(getTitleDisplay('ft_ch')).toBe('FT.Ch.');
    expect(getTitleDisplay('ob_ch')).toBe('Ob.Ch.');
  });

  it('returns input string for unknown titles', () => {
    expect(getTitleDisplay('unknown')).toBe('unknown');
  });
});

describe('formatDogName', () => {
  it('returns registered name when no titles', () => {
    expect(formatDogName({ registeredName: 'Dorabella Dancing Queen' })).toBe(
      'Dorabella Dancing Queen'
    );
  });

  it('returns registered name when titles is null', () => {
    expect(
      formatDogName({ registeredName: 'Dorabella Dancing Queen', titles: null })
    ).toBe('Dorabella Dancing Queen');
  });

  it('returns registered name when titles is empty', () => {
    expect(
      formatDogName({ registeredName: 'Dorabella Dancing Queen', titles: [] })
    ).toBe('Dorabella Dancing Queen');
  });

  it('prefixes with single title', () => {
    expect(
      formatDogName({
        registeredName: 'Dorabella Dancing Queen',
        titles: [{ title: 'ch' }],
      })
    ).toBe('Ch. Dorabella Dancing Queen');
  });

  it('orders multiple titles by rank (highest first)', () => {
    const result = formatDogName({
      registeredName: 'Test Dog',
      titles: [{ title: 'sh_ch' }, { title: 'ch' }],
    });
    // ch (rank 8) should come before sh_ch (rank 6)
    expect(result).toBe('Ch. Sh.Ch. Test Dog');
  });

  it('handles international champion', () => {
    expect(
      formatDogName({
        registeredName: 'Europa Star',
        titles: [{ title: 'int_ch' }],
      })
    ).toBe('Int.Ch. Europa Star');
  });
});
