import { describe, it, expect } from 'vitest';
import {
  parseChampionPrefix,
  isShowChampion,
  isRkcChampion,
  SHOW_CHAMPION_TITLES,
  RKC_CHAMPION_TITLES,
} from '../dog-champion-status';

describe('parseChampionPrefix', () => {
  it('parses a bare CH prefix', () => {
    expect(parseChampionPrefix('CH RENO DE LA PETITE LAETICIA (IMP FRA)')).toEqual(['ch']);
  });

  it('parses lower-case and dotted "Ch."', () => {
    expect(parseChampionPrefix('Ch. Some Dog')).toEqual(['ch']);
  });

  it('parses Sh Ch', () => {
    expect(parseChampionPrefix('SH CH SOME DOG')).toEqual(['sh_ch']);
  });

  it('parses Ir Ch', () => {
    expect(parseChampionPrefix('IR CH SOME DOG')).toEqual(['ir_ch']);
  });

  it('parses Ir Sh Ch', () => {
    expect(parseChampionPrefix('IR SH CH SOME DOG')).toEqual(['ir_sh_ch']);
  });

  it('parses Ir Sh Ch in either modifier order', () => {
    expect(parseChampionPrefix('SH IR CH SOME DOG')).toEqual(['ir_sh_ch']);
  });

  it('parses Int Ch', () => {
    expect(parseChampionPrefix('INT CH SOME DOG')).toEqual(['int_ch']);
  });

  it('parses "Multi CH" as a plain champion', () => {
    expect(parseChampionPrefix('Multi CH Some Dog')).toEqual(['ch']);
  });

  it('parses a country-qualified champion as a plain champion', () => {
    expect(parseChampionPrefix('GER CH Some Dog')).toEqual(['ch']);
    expect(parseChampionPrefix('VDH CH Some Dog')).toEqual(['ch']);
  });

  it('parses a country-qualified Sh Ch', () => {
    expect(parseChampionPrefix('GER SH CH Some Dog')).toEqual(['sh_ch']);
  });

  it('parses a compound "CH IR CH" as two titles', () => {
    expect(parseChampionPrefix('CH IR CH Some Dog')).toEqual(['ch', 'ir_ch']);
  });

  it('parses Ob Ch as a non-show-champion title', () => {
    expect(parseChampionPrefix('OB CH Some Dog')).toEqual(['ob_ch']);
  });

  it('parses Ft Ch and Wt Ch as non-show-champion titles', () => {
    expect(parseChampionPrefix('FT CH Some Dog')).toEqual(['ft_ch']);
    expect(parseChampionPrefix('WT CH Some Dog')).toEqual(['wt_ch']);
  });

  it('does NOT match "CHARLIE" — CH must be a whole token', () => {
    expect(parseChampionPrefix('CHARLIE OF SOMEWHERE')).toEqual([]);
  });

  it('does NOT match "CHATSWORTH" — CH must be a whole token', () => {
    expect(parseChampionPrefix('CHATSWORTH SOME DOG')).toEqual([]);
  });

  it('does NOT match CH in the middle of a name', () => {
    expect(parseChampionPrefix('SOME DOG CH FOO')).toEqual([]);
  });

  it('returns empty for a plain name with no title', () => {
    expect(parseChampionPrefix('RENO DE LA PETITE LAETICIA')).toEqual([]);
  });

  it('returns empty for null/undefined/empty', () => {
    expect(parseChampionPrefix(null)).toEqual([]);
    expect(parseChampionPrefix(undefined)).toEqual([]);
    expect(parseChampionPrefix('')).toEqual([]);
  });

  it('does not treat a stray modifier word with no following CH as a title', () => {
    expect(parseChampionPrefix('IR SETTER OF SOMEWHERE')).toEqual([]);
  });
});

describe('isShowChampion', () => {
  it('is true from a "ch" title row', () => {
    expect(isShowChampion({ titles: [{ title: 'ch' }], registeredName: 'Some Dog' })).toBe(true);
  });

  it('is true from a "sh_ch" title row', () => {
    expect(isShowChampion({ titles: [{ title: 'sh_ch' }], registeredName: 'Some Dog' })).toBe(true);
  });

  it('is true from a name-prefix CH with no title rows', () => {
    expect(
      isShowChampion({
        titles: [],
        registeredName: 'CH RENO DE LA PETITE LAETICIA (IMP FRA)',
      }),
    ).toBe(true);
  });

  it('is false for a dog with no titles and no prefix', () => {
    expect(isShowChampion({ titles: [], registeredName: 'Reno' })).toBe(false);
  });

  it('is false for an Obedience Champion only — not a show champion', () => {
    expect(isShowChampion({ titles: [{ title: 'ob_ch' }], registeredName: 'Reno' })).toBe(false);
    expect(isShowChampion({ titles: [], registeredName: 'OB CH Reno' })).toBe(false);
  });

  it('is false for Field/Working Trial champions only', () => {
    expect(isShowChampion({ titles: [{ title: 'ft_ch' }] })).toBe(false);
    expect(isShowChampion({ titles: [{ title: 'wt_ch' }] })).toBe(false);
  });

  it('handles a missing titles array and missing name gracefully', () => {
    expect(isShowChampion({})).toBe(false);
  });
});

describe('isRkcChampion', () => {
  it('is true for a "ch" title row', () => {
    expect(isRkcChampion({ titles: [{ title: 'ch' }] })).toBe(true);
  });

  it('is true for a "sh_ch" title row', () => {
    expect(isRkcChampion({ titles: [{ title: 'sh_ch' }] })).toBe(true);
  });

  it('is false for the international/Irish-only titles', () => {
    expect(isRkcChampion({ titles: [{ title: 'ir_ch' }] })).toBe(false);
    expect(isRkcChampion({ titles: [{ title: 'ir_sh_ch' }] })).toBe(false);
    expect(isRkcChampion({ titles: [{ title: 'int_ch' }] })).toBe(false);
  });

  it('is false for an Obedience/Field/Working Trial champion', () => {
    expect(isRkcChampion({ titles: [{ title: 'ob_ch' }] })).toBe(false);
    expect(isRkcChampion({ titles: [{ title: 'ft_ch' }] })).toBe(false);
    expect(isRkcChampion({ titles: [{ title: 'wt_ch' }] })).toBe(false);
  });

  it('is true from a bare "CH" name prefix', () => {
    expect(isRkcChampion({ registeredName: 'CH Reno' })).toBe(true);
  });

  it('is true from a "SH CH" name prefix', () => {
    expect(isRkcChampion({ registeredName: 'SH CH Reno' })).toBe(true);
  });

  it('is false from an "IR CH" name prefix (not the RKC title)', () => {
    expect(isRkcChampion({ registeredName: 'IR CH Reno' })).toBe(false);
  });
});

describe('constants', () => {
  it('SHOW_CHAMPION_TITLES excludes the non-conformation champion titles', () => {
    expect(SHOW_CHAMPION_TITLES).not.toContain('ob_ch');
    expect(SHOW_CHAMPION_TITLES).not.toContain('ft_ch');
    expect(SHOW_CHAMPION_TITLES).not.toContain('wt_ch');
  });

  it('RKC_CHAMPION_TITLES is exactly ch and sh_ch', () => {
    expect([...RKC_CHAMPION_TITLES].sort()).toEqual(['ch', 'sh_ch']);
  });
});
