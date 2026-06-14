import { describe, it, expect } from 'vitest';
import { buildScheduleJudges, type JudgeAggregate } from '../schedule-judges';

function agg(partial: Partial<JudgeAggregate> & { name: string }): JudgeAggregate {
  return {
    name: partial.name,
    breeds: partial.breeds ?? new Set(),
    sexes: partial.sexes ?? new Set(),
    hasNullSexAssignment: partial.hasNullSexAssignment ?? false,
    hasJhAssignment: partial.hasJhAssignment ?? false,
    subjectToRkcApproval: partial.subjectToRkcApproval ?? false,
  };
}

describe('buildScheduleJudges', () => {
  it('surfaces a judge who does the breeds AND the Junior Handling in BOTH places (Mandy 2026-06-14)', () => {
    // Mrs M Cowan: GSD dog + GSD bitch + a null-breed/null-sex JH assignment.
    // Previously she got the breed role only, so the JH block showed "Judge: TBC".
    const cowan = agg({
      name: 'Mrs M Cowan',
      breeds: new Set(['German Shepherd Dog']),
      sexes: new Set(['dog', 'bitch']),
      hasNullSexAssignment: true,
      hasJhAssignment: true,
    });

    const judges = buildScheduleJudges([cowan], [], true);

    const roles = judges.filter((j) => j.name === 'Mrs M Cowan').map((j) => j.role);
    expect(roles).toContain('Dogs & Bitches'); // breed sections
    expect(roles).toContain('Junior Handling'); // the JH block (the fix)
    expect(judges.filter((j) => j.role === 'Junior Handling')).toHaveLength(1);
  });

  it('a dedicated JH judge (only JH) appears once as Junior Handling, not duplicated', () => {
    const jhOnly = agg({ name: 'Mr A Steward', hasNullSexAssignment: true, hasJhAssignment: true });

    const jh = buildScheduleJudges([jhOnly], [], true).filter((j) => j.role === 'Junior Handling');
    expect(jh).toHaveLength(1);
    expect(jh[0]!.name).toBe('Mr A Steward');
  });

  it('a pure breed judge gets a breed role and no JH entry', () => {
    const breedJudge = agg({
      name: 'Mrs B Breed',
      breeds: new Set(['Boxer']),
      sexes: new Set(['dog', 'bitch']),
    });

    const judges = buildScheduleJudges([breedJudge], [], true);
    expect(judges).toHaveLength(1);
    expect(judges[0]!.role).toBe('Dogs & Bitches');
    expect(judges.some((j) => j.role === 'Junior Handling')).toBe(false);
  });

  it('appends Special Awards Classes judges with the SAC role', () => {
    const judges = buildScheduleJudges([], [{ name: 'Mr S Awards', subjectToRkcApproval: false }], false);
    expect(judges).toHaveLength(1);
    expect(judges[0]!.role).toBe('Special Awards Classes');
  });

  it('does not add JH entries when the show has no Junior Handling classes', () => {
    const cowan = agg({
      name: 'Mrs M Cowan',
      breeds: new Set(['GSD']),
      sexes: new Set(['dog', 'bitch']),
      hasJhAssignment: true,
    });
    const judges = buildScheduleJudges([cowan], [], false);
    expect(judges.some((j) => j.role === 'Junior Handling')).toBe(false);
  });

  it('carries the subject-to-RKC-approval suffix into the JH displayLabel', () => {
    const cowan = agg({
      name: 'Mrs M Cowan',
      breeds: new Set(['GSD']),
      sexes: new Set(['dog', 'bitch']),
      hasJhAssignment: true,
      subjectToRkcApproval: true,
    });
    const jh = buildScheduleJudges([cowan], [], true).find((j) => j.role === 'Junior Handling');
    expect(jh?.displayLabel).toBe('Junior Handling — Mrs M Cowan (subject to RKC approval)');
  });
});
