import { describe, it, expect } from 'vitest';
import { buildJudgeBreedAndClassification } from '../judge-breed-classification';

describe('buildJudgeBreedAndClassification', () => {
  it('RKC single-breed: explicit breedId + Dogs + Bitches → "{Breed} Dogs & Bitches classes"', () => {
    const result = buildJudgeBreedAndClassification(
      [
        { breed: { name: 'German Shepherd Dog' }, sex: 'dog' },
        { breed: { name: 'German Shepherd Dog' }, sex: 'bitch' },
      ],
      ['German Shepherd Dog'],
      'GSD Champ Show',
    );
    expect(result.breedLine).toBe('German Shepherd Dog');
    expect(result.classificationLine).toBe('German Shepherd Dog Dogs & Bitches classes');
  });

  it('JH only: a single sex=null, breed=null row → "Junior Handling"', () => {
    const result = buildJudgeBreedAndClassification(
      [{ breed: null, sex: null }],
      ['German Shepherd Dog'],
    );
    expect(result.classificationLine).toBe('Junior Handling');
  });

  // Amanda 2026-05-22 — SV regional bug. The wizard saves assignments with
  // breed_id=NULL because the breed is implicit on the show row. Before the
  // fix the breed-class rows (sex='dog'/'bitch' but no breed) were dropped
  // and only the JH row survived, so the contract said "Junior Handling".
  it('SV fallback: null breedId on single-breed show resolves to the show breed', () => {
    const result = buildJudgeBreedAndClassification(
      [
        { breed: null, sex: 'dog' },
        { breed: null, sex: 'bitch' },
        { breed: null, sex: null }, // separate JH row
      ],
      ['German Shepherd Dog'],
      'Midland Regional GSD Group',
    );
    expect(result.breedLine).toBe('German Shepherd Dog');
    expect(result.classificationLine).toBe(
      'German Shepherd Dog Dogs & Bitches classes / Junior Handling',
    );
  });

  it('SV fallback does NOT apply to multi-breed shows (ambiguous breed)', () => {
    // breed=null + sex='dog' on a multi-breed show stays dropped — we can't
    // guess which breed it refers to. Only fully-specified rows render.
    const result = buildJudgeBreedAndClassification(
      [
        { breed: null, sex: 'dog' },
        { breed: { name: 'Labrador' }, sex: 'dog' },
      ],
      ['Labrador', 'Poodle'],
    );
    expect(result.classificationLine).toBe('Labrador Dogs classes');
  });

  it('SAC judge across the show breed list', () => {
    const result = buildJudgeBreedAndClassification(
      [{ breed: null, sex: null, isSpecialAwardsClassesJudge: true }],
      ['German Shepherd Dog'],
    );
    expect(result.classificationLine).toBe('German Shepherd Dog Special Award Classes');
  });

  it('returns TBC when nothing matches', () => {
    const result = buildJudgeBreedAndClassification([], ['German Shepherd Dog']);
    expect(result.classificationLine).toBe('TBC');
    expect(result.breedLine).toBe('German Shepherd Dog');
  });
});
