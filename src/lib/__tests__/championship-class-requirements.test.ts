import { describe, it, expect } from 'vitest';
import {
  missingChampionshipClasses,
  championshipClassesComplete,
  type ChampionshipClassInput,
} from '../championship-class-requirements';

function cls(overrides: Partial<ChampionshipClassInput>): ChampionshipClassInput {
  return {
    breedId: null,
    breedName: null,
    classDefinitionName: null,
    sex: null,
    ...overrides,
  };
}

const GSD = { breedId: 'breed-gsd', breedName: 'German Shepherd Dog' };
const LAB = { breedId: 'breed-lab', breedName: 'Labrador Retriever' };

function fullSet(breed: { breedId: string; breedName: string }): ChampionshipClassInput[] {
  return [
    cls({ ...breed, classDefinitionName: 'Open', sex: 'dog' }),
    cls({ ...breed, classDefinitionName: 'Open', sex: 'bitch' }),
    cls({ ...breed, classDefinitionName: 'Limit', sex: 'dog' }),
    cls({ ...breed, classDefinitionName: 'Limit', sex: 'bitch' }),
  ];
}

describe('missingChampionshipClasses', () => {
  it('multi-breed championship show: complete for both breeds -> no missing classes', () => {
    const classes = [...fullSet(GSD), ...fullSet(LAB)];
    const missing = missingChampionshipClasses({
      showType: 'championship',
      showScope: 'multi_breed',
      classes,
    });
    expect(missing).toEqual([]);
  });

  it('multi-breed championship show: missing Limit Bitch for one breed only', () => {
    const classes = [
      ...fullSet(GSD),
      cls({ ...LAB, classDefinitionName: 'Open', sex: 'dog' }),
      cls({ ...LAB, classDefinitionName: 'Open', sex: 'bitch' }),
      cls({ ...LAB, classDefinitionName: 'Limit', sex: 'dog' }),
      // Limit Bitch missing for Labrador
    ];
    const missing = missingChampionshipClasses({
      showType: 'championship',
      showScope: 'multi_breed',
      classes,
    });
    expect(missing).toEqual([
      { breedId: 'breed-lab', breedName: 'Labrador Retriever', sex: 'bitch', className: 'Limit' },
    ]);
  });

  it('single-breed championship show with NULL breedId on every class, complete -> satisfied', () => {
    const classes: ChampionshipClassInput[] = [
      cls({ breedId: null, breedName: null, classDefinitionName: 'Open', sex: 'dog' }),
      cls({ breedId: null, breedName: null, classDefinitionName: 'Open', sex: 'bitch' }),
      cls({ breedId: null, breedName: null, classDefinitionName: 'Limit', sex: 'dog' }),
      cls({ breedId: null, breedName: null, classDefinitionName: 'Limit', sex: 'bitch' }),
    ];
    const missing = missingChampionshipClasses({
      showType: 'championship',
      showScope: 'single_breed',
      classes,
    });
    expect(missing).toEqual([]);
  });

  it('single-breed championship show with NULL breedId, missing Open Dog -> reports it', () => {
    const classes: ChampionshipClassInput[] = [
      cls({ breedId: null, breedName: null, classDefinitionName: 'Open', sex: 'bitch' }),
      cls({ breedId: null, breedName: null, classDefinitionName: 'Limit', sex: 'dog' }),
      cls({ breedId: null, breedName: null, classDefinitionName: 'Limit', sex: 'bitch' }),
    ];
    const missing = missingChampionshipClasses({
      showType: 'championship',
      showScope: 'single_breed',
      classes,
    });
    expect(missing).toEqual([
      { breedId: null, breedName: 'the breed', sex: 'dog', className: 'Open' },
    ]);
  });

  it('single-breed show with a breed name available on the class fallback -> uses that name', () => {
    const classes: ChampionshipClassInput[] = [
      cls({ breedId: null, breedName: 'German Shepherd Dog', classDefinitionName: 'Open', sex: 'bitch' }),
      cls({ breedId: null, breedName: null, classDefinitionName: 'Limit', sex: 'dog' }),
      cls({ breedId: null, breedName: null, classDefinitionName: 'Limit', sex: 'bitch' }),
    ];
    const missing = missingChampionshipClasses({
      showType: 'championship',
      showScope: 'single_breed',
      classes,
    });
    expect(missing).toEqual([
      { breedId: null, breedName: 'German Shepherd Dog', sex: 'dog', className: 'Open' },
    ]);
  });

  it('non-championship show: always empty, even with no classes at all', () => {
    const missing = missingChampionshipClasses({
      showType: 'open',
      showScope: 'multi_breed',
      classes: [],
    });
    expect(missing).toEqual([]);
  });

  it('SV/WUSV regional championship show is exempt regardless of classes', () => {
    const missing = missingChampionshipClasses({
      showType: 'championship',
      showScope: 'single_breed',
      showRuleset: 'wusv',
      classes: [],
    });
    expect(missing).toEqual([]);
  });

  it('classes present for only one sex -> the other sex is reported missing for both class types', () => {
    const classes: ChampionshipClassInput[] = [
      cls({ ...GSD, classDefinitionName: 'Open', sex: 'dog' }),
      cls({ ...GSD, classDefinitionName: 'Limit', sex: 'dog' }),
    ];
    const missing = missingChampionshipClasses({
      showType: 'championship',
      showScope: 'multi_breed',
      classes,
    });
    expect(missing).toEqual([
      { breedId: 'breed-gsd', breedName: 'German Shepherd Dog', sex: 'bitch', className: 'Open' },
      { breedId: 'breed-gsd', breedName: 'German Shepherd Dog', sex: 'bitch', className: 'Limit' },
    ]);
  });
});

/**
 * Review follow-ups (2026-09-18) — two behaviours the extraction lost.
 */
describe('championshipClassesComplete / mixed single-breed rows', () => {
  it('single-breed show with SOME rows carrying breedId and some not is ONE breed, not two', () => {
    // The old client grouped by breed NAME, so mixed rows merged. Keyed by id
    // they split into two half-empty groups and both read as incomplete.
    const mixed = fullSet(GSD).map((c, i) => (i % 2 === 0 ? c : { ...c, breedId: null, breedName: null }));
    expect(
      missingChampionshipClasses({ showType: 'championship', showScope: 'single_breed', showRuleset: 'rkc', classes: mixed }),
    ).toEqual([]);
  });

  it('NO classes yet → not applicable, so complete (adding classes is its own checklist item)', () => {
    const input = { showType: 'championship' as const, showScope: 'single_breed' as const, showRuleset: 'rkc' as const, classes: [] };
    expect(missingChampionshipClasses(input)).toEqual([]);
    expect(championshipClassesComplete(input)).toBe(true);
  });

  it('multi-breed show whose classes cannot be tied to ANY breed is not complete', () => {
    // Original server semantics: `breedClassMap.size > 0 && allBreedsComplete`.
    const breedless = fullSet(GSD).map((c) => ({ ...c, breedId: null, breedName: null }));
    const input = { showType: 'championship' as const, showScope: 'general' as const, showRuleset: 'rkc' as const, classes: breedless };
    expect(championshipClassesComplete(input)).toBe(false);
  });

  it('complete show → complete; one class missing → not complete', () => {
    const base = { showType: 'championship' as const, showScope: 'single_breed' as const, showRuleset: 'rkc' as const };
    expect(championshipClassesComplete({ ...base, classes: fullSet(GSD) })).toBe(true);
    expect(championshipClassesComplete({ ...base, classes: fullSet(GSD).slice(1) })).toBe(false);
  });

  it('non-championship and WUSV shows are never blocked by this rule', () => {
    expect(championshipClassesComplete({ showType: 'open', showScope: 'single_breed', showRuleset: 'rkc', classes: [] })).toBe(true);
    expect(championshipClassesComplete({ showType: 'championship', showScope: 'single_breed', showRuleset: 'wusv', classes: [] })).toBe(true);
  });
});
