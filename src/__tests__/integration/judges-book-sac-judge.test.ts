import { describe, it, expect } from 'vitest';
import {
  resolveJudgeForClass,
  type JudgeAssignmentInput,
  type JudgeForClassInput,
} from '@/app/api/judges-book/[showId]/route';

// Mandy, South Western, printing for 9 Aug 2026: the judge's book printed
// "Hugh De Zutter" (the breed judge) on all 3 Special Award class pages —
// the actual judge is Ms K Salamon. Root cause: the assignment loop did
// `if (ja.isSpecialAwardsClassesJudge) continue;` BEFORE capturing her into
// any bucket, so judgeForClass fell through to the breed match — and on a
// single-breed show the SAC show_classes carry that breed's breedId, so the
// breed judge silently won. This reproduces the exact shape that triggered
// it: a single-breed show with a breed judge on dog+bitch classes, a Junior
// Handling judge, a Special Awards Classes judge, and a special-award class
// that (like the real data) carries the breed_id.
describe('resolveJudgeForClass — Special Awards Classes judge carve-out', () => {
  const BREED_ID = 'breed-gsd';

  const assignments: JudgeAssignmentInput[] = [
    {
      judge: { id: 'judge-breed', name: 'Hugh De Zutter' },
      breedId: BREED_ID,
      sex: null,
      ring: { number: 1 },
      isSpecialAwardsClassesJudge: false,
    },
    {
      judge: { id: 'judge-jh', name: 'Mandy McAteer' },
      breedId: null,
      sex: null,
      ring: { number: 2 },
      isSpecialAwardsClassesJudge: false,
    },
    {
      judge: { id: 'judge-sac', name: 'Ms K Salamon' },
      breedId: null,
      sex: null,
      ring: { number: 1 },
      isSpecialAwardsClassesJudge: true,
    },
  ];

  const dogClass: JudgeForClassInput = {
    id: 'class-dog',
    classNumber: 1,
    breedId: BREED_ID,
    sex: 'dog',
    classDefinition: { type: 'age', name: 'Yearling' },
  };
  const bitchClass: JudgeForClassInput = {
    id: 'class-bitch',
    classNumber: 2,
    breedId: BREED_ID,
    sex: 'bitch',
    classDefinition: { type: 'age', name: 'Yearling' },
  };
  const jhClass: JudgeForClassInput = {
    id: 'class-jh',
    classNumber: 3,
    breedId: null,
    sex: null,
    classDefinition: { type: 'junior_handler', name: 'Junior Handling' },
  };
  // Carries the show's single breedId, same as the real data Mandy hit —
  // this is exactly what let the breed judge win before the fix.
  const sacClass: JudgeForClassInput = {
    id: 'class-sac',
    classNumber: 4,
    breedId: BREED_ID,
    sex: null,
    classDefinition: { type: 'special', name: 'Special Award Class - Open' },
  };

  it('resolves the Special Award class to the SAC judge, not the breed judge', () => {
    const judgeForClass = resolveJudgeForClass(assignments);
    expect(judgeForClass(sacClass)?.name).toBe('Ms K Salamon');
  });

  it('still resolves breed classes to the breed judge', () => {
    const judgeForClass = resolveJudgeForClass(assignments);
    expect(judgeForClass(dogClass)?.name).toBe('Hugh De Zutter');
    expect(judgeForClass(bitchClass)?.name).toBe('Hugh De Zutter');
  });

  it('still resolves the Junior Handling class to the JH judge, not the SAC judge', () => {
    const judgeForClass = resolveJudgeForClass(assignments);
    expect(judgeForClass(jhClass)?.name).toBe('Mandy McAteer');
  });
});
