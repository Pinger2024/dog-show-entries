import { describe, it, expect } from 'vitest';
import { missingChampionshipClasses, type ChampionshipClassInput } from '../championship-class-requirements';

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
