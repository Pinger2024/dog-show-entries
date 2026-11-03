import { describe, it, expect } from 'vitest';
import { buildScheduleJudges, pickSvCoverJudges, type JudgeAggregate } from '@/lib/schedule-judges';

function agg(overrides: Partial<JudgeAggregate> & { name: string }): JudgeAggregate {
  return {
    affix: null,
    breeds: new Set<string>(),
    breedIds: new Set<string>(),
    sexes: new Set<string>(),
    hasNullSexAssignment: false,
    hasJhAssignment: false,
    subjectToRkcApproval: false,
    ...overrides,
  };
}

describe('buildScheduleJudges', () => {
  it('puts breed judges before Junior Handling judges even when the JH judge was inserted first', () => {
    // Mo Lakin (JH judge, breed/sex both null) inserted BEFORE Daniel
    // Hanswillemenke (Dogs & Bitches) — mirrors the Midlands Region GSD
    // Group data that produced the 2026-09-04 cover-page bug.
    const entries = new Map<string, JudgeAggregate>([
      ['mo', agg({ name: 'Mo Lakin', hasNullSexAssignment: true })],
      [
        'daniel',
        agg({ name: 'Daniel Hanswillemenke', sexes: new Set(['dog', 'bitch']) }),
      ],
    ]);

    const judges = buildScheduleJudges(entries.values(), [], { hasJuniorHandlerClasses: true });

    expect(judges.map((j) => j.displayLabel)).toEqual([
      'Dogs & Bitches — Daniel Hanswillemenke',
      'Junior Handling — Mo Lakin',
    ]);
  });

  it('sorts alphabetically by name within each tier', () => {
    const entries = new Map<string, JudgeAggregate>([
      ['z-jh', agg({ name: 'Zara JH', hasNullSexAssignment: true })],
      ['a-jh', agg({ name: 'Alan JH', hasNullSexAssignment: true })],
      ['z-breed', agg({ name: 'Zoe Breed', sexes: new Set(['dog']) })],
      ['a-breed', agg({ name: 'Amy Breed', sexes: new Set(['bitch']) })],
    ]);

    const judges = buildScheduleJudges(entries.values(), [], { hasJuniorHandlerClasses: true });

    expect(judges.map((j) => j.name)).toEqual([
      'Amy Breed',
      'Zoe Breed',
      'Alan JH',
      'Zara JH',
    ]);
  });

  // Running order (Mandy 2026-07-28; again 3 Nov 2026 for Winter
  // Spectacular): the breed judge first, then Special Awards, then Junior
  // Handling — Special Awards used to land after the Junior Handling judge.
  it('lists breed judges, then Special Awards, then Junior Handling', () => {
    const entries = new Map<string, JudgeAggregate>([
      ['jh', agg({ name: 'Jo JH', hasNullSexAssignment: true })],
      ['breed', agg({ name: 'Bea Breed', sexes: new Set(['dog', 'bitch']) })],
    ]);

    const judges = buildScheduleJudges(
      entries.values(),
      [{ name: 'Sam SAC', subjectToRkcApproval: false }],
      { hasJuniorHandlerClasses: true },
    );

    expect(judges.map((j) => j.displayLabel)).toEqual([
      'Dogs & Bitches — Bea Breed',
      'Special Awards Classes — Sam SAC',
      'Junior Handling — Jo JH',
    ]);
  });

  it('appends an "also does JH" entry after Special Awards Classes for a judge who judges both breed and JH', () => {
    const entries = new Map<string, JudgeAggregate>([
      [
        'both',
        agg({ name: 'Pat Both', sexes: new Set(['dog', 'bitch']), hasJhAssignment: true }),
      ],
    ]);

    const judges = buildScheduleJudges(
      entries.values(),
      [{ name: 'Sam SAC', subjectToRkcApproval: false }],
      { hasJuniorHandlerClasses: true },
    );

    expect(judges.map((j) => j.displayLabel)).toEqual([
      'Dogs & Bitches — Pat Both',
      'Special Awards Classes — Sam SAC',
      'Junior Handling — Pat Both',
    ]);
  });

  it('does not label a null-sex judge as Junior Handling when the show has no JH classes', () => {
    const entries = new Map<string, JudgeAggregate>([
      ['solo', agg({ name: 'Solo Judge', hasNullSexAssignment: true })],
    ]);

    const judges = buildScheduleJudges(entries.values(), [], { hasJuniorHandlerClasses: false });

    expect(judges).toHaveLength(1);
    expect(judges[0].role).toBeUndefined();
    expect(judges[0].displayLabel).toBe('Solo Judge');
  });
});

describe('pickSvCoverJudges', () => {
  it('picks the single breed judge name only, stripping the role prefix, when the JH judge label comes first', () => {
    const labels = ['Junior Handling — Mo Lakin', 'Dogs & Bitches — Daniel Hanswillemenke'];
    expect(pickSvCoverJudges(labels)).toEqual(['Daniel Hanswillemenke']);
  });

  it('keeps the "(subject to RKC approval)" suffix when stripping the role prefix', () => {
    const labels = ['Dogs & Bitches — Daniel Hanswillemenke (subject to RKC approval)'];
    expect(pickSvCoverJudges(labels)).toEqual(['Daniel Hanswillemenke (subject to RKC approval)']);
  });

  it('prints one label per line, with role prefixes, when there are two breed judges', () => {
    const labels = ['Dogs — Alan Dogs', 'Bitches — Bea Bitches', 'Junior Handling — Jo JH'];
    expect(pickSvCoverJudges(labels)).toEqual(['Dogs — Alan Dogs', 'Bitches — Bea Bitches']);
  });

  it('returns Judge TBC when only a Junior Handling (and/or SAC) label is present', () => {
    expect(pickSvCoverJudges(['Junior Handling — Mo Lakin'])).toEqual(['Judge TBC']);
    expect(
      pickSvCoverJudges(['Junior Handling — Mo Lakin', 'Special Awards Classes — Sam SAC']),
    ).toEqual(['Judge TBC']);
  });

  it('returns Judge TBC for an empty list', () => {
    expect(pickSvCoverJudges([])).toEqual(['Judge TBC']);
  });
});

describe('judge naming — one owner', () => {
  it('prints the affix after the name, then the RKC approval note', () => {
    const entries = new Map<string, JudgeAggregate>([
      ['sami', agg({ name: 'Sami Baggstrom', affix: 'Sensen Mann', sexes: new Set(['dog', 'bitch']), subjectToRkcApproval: true })],
      ['lynne', agg({ name: 'Lynne Harvey', affix: 'Muscava', breeds: new Set(['German Shepherd Dog']), breedIds: new Set(['gsd']), hasNullSexAssignment: true })],
    ]);
    const judges = buildScheduleJudges(entries.values(), [{ name: 'Sam SAC', affix: 'Sacaffix', subjectToRkcApproval: false }], {
      hasJuniorHandlerClasses: true,
      juniorClassBreedIds: new Set(['gsd']),
      breedClassBreedIds: new Set(['gsd']),
    });
    // Lynne's Junior Handling row also names the breed — she is still the
    // Junior Handling judge, and comes after the breed judge (Winter
    // Spectacular, Mandy 3 Nov 2026).
    expect(judges.map((j) => j.displayLabel)).toEqual([
      'Dogs & Bitches — Sami Baggstrom (Sensen Mann) (subject to RKC approval)',
      'Special Awards Classes — Sam SAC (Sacaffix)',
      'Junior Handling — Lynne Harvey (Muscava)',
    ]);
    expect(judges.map((j) => j.affix)).toEqual(['Sensen Mann', 'Sacaffix', 'Muscava']);
  });
});
