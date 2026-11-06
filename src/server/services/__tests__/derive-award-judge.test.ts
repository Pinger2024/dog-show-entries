import { describe, it, expect } from 'vitest';
import { deriveTopAwardJudgeFromAssignments, type JudgeAssignmentForDerivation, type ShowForJudgeDerivation } from '../derive-award-judge';

/**
 * GSD Club of Scotland, 30 Aug 2026 (prod facts, read-only — see the SPEC B
 * facts file): show is single_breed with breedId set, but ALL 3 of its
 * judge_assignments rows have breed_id NULL — so deriveTopAwardJudge's old
 * `eq(judgeAssignments.breedId, show.breedId)` filter matched 0 rows and
 * returned null for EVERY award. Clyde Valley shows the identical pattern
 * (single_breed, breed set on the show, 0 of 3 assignments carry a breedId).
 *
 * Diagnosis (traced through add-judge-wizard.tsx's showBreedSexCombos and
 * secretary.ts's addAndAssignJudge): a single-breed show's OWN classes don't
 * carry a breedId per showClass — the breed is implicit at the SHOW level
 * (confirmed by the steward page's own comment: "on BAGSD the Veteran class
 * carries a breed id while the other 20 are breed-null"). The wizard builds
 * its breed/sex combos from `sc.breed?.id ?? null`, so assigning the show's
 * one breed judge via the wizard legitimately inserts breedId=NULL. That is
 * BY DESIGN on the creation side — the bug is in the derivation, which must
 * treat a null-breed assignment on a single-breed show as that show's own
 * breed. Fixed here as a pure function so the derivation is testable without
 * a database.
 */

const scotlandShow: ShowForJudgeDerivation = { breedId: 'gsd-breed-id', showScope: 'single_breed' };

function assignment(overrides: Partial<JudgeAssignmentForDerivation> = {}): JudgeAssignmentForDerivation {
  return {
    judgeId: 'judge-1',
    sex: null,
    breedId: null,
    breedGroupId: null,
    judgeRoleId: null,
    isSpecialAwardsClassesJudge: false,
    ...overrides,
  };
}

describe('deriveTopAwardJudgeFromAssignments — single-breed show, breed-null assignments (Scotland 2026-08-30)', () => {
  it('resolves a single both-sexes judge from breed-null assignments to a non-sex award (Best of Breed)', () => {
    const assignments: JudgeAssignmentForDerivation[] = [
      assignment({ judgeId: 'ms-smeaton', sex: null }),
    ];
    expect(deriveTopAwardJudgeFromAssignments(scotlandShow, assignments, 'best_of_breed')).toBe('ms-smeaton');
  });

  it('resolves the sex-specific judge from breed-null assignments to a sex-specific award (Best Bitch)', () => {
    // Mirrors the facts file: Ms L R Smeaton once, Ms A Swift twice — plausibly
    // one dog judge + one bitch judge, all breed-null.
    const assignments: JudgeAssignmentForDerivation[] = [
      assignment({ judgeId: 'ms-smeaton', sex: 'dog' }),
      assignment({ judgeId: 'ms-swift', sex: 'bitch' }),
    ];
    expect(deriveTopAwardJudgeFromAssignments(scotlandShow, assignments, 'best_bitch')).toBe('ms-swift');
    expect(deriveTopAwardJudgeFromAssignments(scotlandShow, assignments, 'best_dog')).toBe('ms-smeaton');
  });

  it('a breed-tagged assignment (some shows DO set it) still resolves — the fix accepts BOTH null and matching breedId', () => {
    const assignments: JudgeAssignmentForDerivation[] = [
      assignment({ judgeId: 'ms-smeaton', sex: null, breedId: 'gsd-breed-id' }),
    ];
    expect(deriveTopAwardJudgeFromAssignments(scotlandShow, assignments, 'best_of_breed')).toBe('ms-smeaton');
  });

  it('never picks up the Special Awards Classes judge as the breed judge, even though they are also breed-null', () => {
    const assignments: JudgeAssignmentForDerivation[] = [
      assignment({ judgeId: 'the-real-breed-judge', sex: null }),
      assignment({ judgeId: 'sac-judge', sex: null, isSpecialAwardsClassesJudge: true }),
    ];
    expect(deriveTopAwardJudgeFromAssignments(scotlandShow, assignments, 'best_of_breed')).toBe('the-real-breed-judge');
  });

  it('never picks up a breed-group-level assignment as the breed judge', () => {
    const assignments: JudgeAssignmentForDerivation[] = [
      assignment({ judgeId: 'the-real-breed-judge', sex: null }),
      assignment({ judgeId: 'group-judge', sex: null, breedGroupId: 'hound-group-id' }),
    ];
    expect(deriveTopAwardJudgeFromAssignments(scotlandShow, assignments, 'best_of_breed')).toBe('the-real-breed-judge');
  });

  it('stays ambiguous (null) when more than one breed-null judge could cover a non-sex award', () => {
    const assignments: JudgeAssignmentForDerivation[] = [
      assignment({ judgeId: 'ms-smeaton', sex: 'dog' }),
      assignment({ judgeId: 'ms-swift', sex: 'bitch' }),
    ];
    // Best in Show has no sex filter, so both dog- and bitch-judges are
    // "relevant" and it's genuinely ambiguous which one gets credit.
    expect(deriveTopAwardJudgeFromAssignments(scotlandShow, assignments, 'best_in_show')).toBeNull();
  });
});

describe('deriveTopAwardJudgeFromAssignments — guardrails unchanged', () => {
  it('returns null for a multi-breed show, regardless of assignments', () => {
    const multiBreedShow: ShowForJudgeDerivation = { breedId: 'some-breed', showScope: 'multi_breed' };
    const assignments: JudgeAssignmentForDerivation[] = [assignment({ judgeId: 'j1' })];
    expect(deriveTopAwardJudgeFromAssignments(multiBreedShow, assignments, 'best_of_breed')).toBeNull();
  });

  it('returns null for a single-breed show with no breedId set', () => {
    const noBreedShow: ShowForJudgeDerivation = { breedId: null, showScope: 'single_breed' };
    const assignments: JudgeAssignmentForDerivation[] = [assignment({ judgeId: 'j1' })];
    expect(deriveTopAwardJudgeFromAssignments(noBreedShow, assignments, 'best_of_breed')).toBeNull();
  });

  it('returns null when there are no assignments at all', () => {
    expect(deriveTopAwardJudgeFromAssignments(scotlandShow, [], 'best_of_breed')).toBeNull();
  });

  it('excludes panel judges (judgeRoleId set) exactly as before', () => {
    const assignments: JudgeAssignmentForDerivation[] = [
      assignment({ judgeId: 'panel-judge', judgeRoleId: 'group-judge-role' }),
    ];
    expect(deriveTopAwardJudgeFromAssignments(scotlandShow, assignments, 'best_of_breed')).toBeNull();
  });
});
