import { describe, it, expect } from 'vitest';
import {
  resolveJudgeForClass,
  type JudgeAssignmentInput,
  type JudgeForClassInput,
} from '@/lib/judge-resolution';

// Michael, 2026-07-30 (caught by an independent artefact check with
// pdftotext, which reads judge text off rendered prize-card pages —
// something the page-count-only integration test can't see): a judge
// assignment with BOTH breedId AND sex set overwrote judgeByBreed on every
// later same-breed assignment ("last write wins"), because the class
// lookup checks judgeByBreed BEFORE judgeBySex. On a single-breed show
// (classes carry the show's breedId), a dog judge + a distinct bitch judge
// — both assigned with breedId AND sex set — collapsed to whichever was
// processed last for EVERY class, dog or bitch. South Western has this
// exact shape today (2 both-set rows) but it's silently masked because
// both rows happen to be the same judge (Hugh De Zutter).
describe('resolveJudgeForClass — breed+sex BOTH set on the assignment', () => {
  const BREED_X = 'breed-x';

  const dogClass: JudgeForClassInput = {
    id: 'class-dog',
    classNumber: 1,
    breedId: BREED_X,
    sex: 'dog',
    classDefinition: { type: 'age', name: 'Yearling' },
  };
  const bitchClass: JudgeForClassInput = {
    id: 'class-bitch',
    classNumber: 2,
    breedId: BREED_X,
    sex: 'bitch',
    classDefinition: { type: 'age', name: 'Yearling' },
  };

  it('resolves a same-breed dog judge and bitch judge to their OWN sex — not last-write-wins', () => {
    const assignments: JudgeAssignmentInput[] = [
      { judge: { id: 'judge-a', name: 'AAA DOGJUDGE' }, breedId: BREED_X, sex: 'dog', ring: { number: 1 } },
      { judge: { id: 'judge-b', name: 'BBB BITCHJUDGE' }, breedId: BREED_X, sex: 'bitch', ring: { number: 1 } },
    ];
    const judgeForClass = resolveJudgeForClass(assignments);
    expect(judgeForClass(dogClass)?.name).toBe('AAA DOGJUDGE');
    expect(judgeForClass(bitchClass)?.name).toBe('BBB BITCHJUDGE');
  });

  it('is order-independent — the same result whichever assignment is inserted first', () => {
    const assignments: JudgeAssignmentInput[] = [
      { judge: { id: 'judge-b', name: 'BBB BITCHJUDGE' }, breedId: BREED_X, sex: 'bitch', ring: { number: 1 } },
      { judge: { id: 'judge-a', name: 'AAA DOGJUDGE' }, breedId: BREED_X, sex: 'dog', ring: { number: 1 } },
    ];
    const judgeForClass = resolveJudgeForClass(assignments);
    expect(judgeForClass(dogClass)?.name).toBe('AAA DOGJUDGE');
    expect(judgeForClass(bitchClass)?.name).toBe('BBB BITCHJUDGE');
  });

  it('the South Western shape — both-set rows sharing the SAME judge — resolves correctly (this already worked; must keep working)', () => {
    const assignments: JudgeAssignmentInput[] = [
      { judge: { id: 'judge-h', name: 'Hugh De Zutter' }, breedId: BREED_X, sex: 'dog', ring: { number: 1 } },
      { judge: { id: 'judge-h', name: 'Hugh De Zutter' }, breedId: BREED_X, sex: 'bitch', ring: { number: 1 } },
    ];
    const judgeForClass = resolveJudgeForClass(assignments);
    expect(judgeForClass(dogClass)?.name).toBe('Hugh De Zutter');
    expect(judgeForClass(bitchClass)?.name).toBe('Hugh De Zutter');
  });
});

describe('resolveJudgeForClass — existing conventions must not regress', () => {
  it('sex-only assignment (breedId null) resolves by sex — single-breed shows leave breed implicit', () => {
    const assignments: JudgeAssignmentInput[] = [
      { judge: { id: 'judge-dog', name: 'Dog Judge' }, breedId: null, sex: 'dog', ring: { number: 1 } },
      { judge: { id: 'judge-bitch', name: 'Bitch Judge' }, breedId: null, sex: 'bitch', ring: { number: 1 } },
    ];
    const judgeForClass = resolveJudgeForClass(assignments);
    expect(judgeForClass({ id: 'c1', classNumber: 1, breedId: 'breed-x', sex: 'dog', classDefinition: { type: 'age', name: 'Yearling' } })?.name).toBe('Dog Judge');
    expect(judgeForClass({ id: 'c2', classNumber: 2, breedId: 'breed-x', sex: 'bitch', classDefinition: { type: 'age', name: 'Yearling' } })?.name).toBe('Bitch Judge');
  });

  it('breed-only assignment (sex null) resolves by breed — one judge for both sexes', () => {
    const assignments: JudgeAssignmentInput[] = [
      { judge: { id: 'judge-both', name: 'Hugh De Zutter' }, breedId: 'breed-x', sex: null, ring: { number: 1 } },
    ];
    const judgeForClass = resolveJudgeForClass(assignments);
    expect(judgeForClass({ id: 'c1', classNumber: 1, breedId: 'breed-x', sex: 'dog', classDefinition: { type: 'age', name: 'Yearling' } })?.name).toBe('Hugh De Zutter');
    expect(judgeForClass({ id: 'c2', classNumber: 2, breedId: 'breed-x', sex: 'bitch', classDefinition: { type: 'age', name: 'Yearling' } })?.name).toBe('Hugh De Zutter');
  });

  it('Junior Handling and Special Award Class tiers still win over the breed+sex exact-pair tier', () => {
    const BREED_X = 'breed-x';
    const assignments: JudgeAssignmentInput[] = [
      { judge: { id: 'judge-a', name: 'AAA DOGJUDGE' }, breedId: BREED_X, sex: 'dog', ring: { number: 1 } },
      { judge: { id: 'judge-b', name: 'BBB BITCHJUDGE' }, breedId: BREED_X, sex: 'bitch', ring: { number: 1 } },
      { judge: { id: 'judge-jh', name: 'Mandy McAteer' }, breedId: null, sex: null, ring: { number: 2 } },
      { judge: { id: 'judge-sac', name: 'Ms K Salamon' }, breedId: null, sex: null, ring: { number: 1 }, isSpecialAwardsClassesJudge: true },
    ];
    const judgeForClass = resolveJudgeForClass(assignments);
    // JH class carries breedId=BREED_X, sex=null on a single-breed show (real shape).
    expect(judgeForClass({ id: 'jh', classNumber: 3, breedId: BREED_X, sex: null, classDefinition: { type: 'junior_handler', name: 'Junior Handling' } })?.name).toBe('Mandy McAteer');
    // SAC class carries breedId=BREED_X too (the documented trap shape).
    expect(judgeForClass({ id: 'sac', classNumber: 4, breedId: BREED_X, sex: null, classDefinition: { type: 'special', name: 'Special Award Class - Open' } })?.name).toBe('Ms K Salamon');
    // And the breed+sex exact-pair tier still resolves the ordinary classes correctly.
    expect(judgeForClass({ id: 'dog', classNumber: 1, breedId: BREED_X, sex: 'dog', classDefinition: { type: 'age', name: 'Yearling' } })?.name).toBe('AAA DOGJUDGE');
  });
});
