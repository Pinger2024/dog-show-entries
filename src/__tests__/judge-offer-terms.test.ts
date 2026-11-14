/**
 * The standard terms a judge's offer carries — one owner,
 * src/lib/judge-offer-terms.ts.
 *
 * RKC Show Regulations 2026, F(1).21.b: societies "are required to include
 * the following wording in judges' invitation letters". On top of that, every
 * RKC open show offer carries three terms of the society's own (agreed with
 * the domain expert, 14 Nov 2026): same breed only, JEP Level 2 or above (not
 * for overseas judges), and the judge declares appointments already agreed.
 */
import { describe, it, expect } from 'vitest';
import {
  judgeOfferTerms,
  readStoredJudgeOfferTerms,
  checkAlreadyAgreedAnswer,
  alreadyAgreedAnswerText,
  alreadyAgreedSentence,
  breedPhrase,
  JUDGE_OFFER_TERMS_VERSION,
  ALREADY_AGREED_MAX_LENGTH,
} from '@/lib/judge-offer-terms';
import { isRkcOpenShow, isRegionalShow, isRkcF1Show } from '@/lib/show-types';

const F121B_PARAGRAPH_1 =
  'In accepting this invitation you agree to be bound by Royal Kennel Club Rules and Regulations and the Royal Kennel Club Code of Best Practice for Judges. In doing so you also recognise that you are obliged to notify us in writing of any change in your personal circumstances or additional information which may affect your ability and standing to fulfil this judging appointment.';
const F121B_PARAGRAPH_2 =
  'You should also note that we reserve the right to cancel this contract before the date of the show if there is a change in your circumstances, which in our reasonable opinion would adversely affect your ability to fulfil the appointment.';

const GSD = ['German Shepherd Dog'];

describe('show-types: regional and RKC open', () => {
  it('a wusv show is a regional, whatever its stored type', () => {
    expect(isRegionalShow('wusv')).toBe(true);
    expect(isRegionalShow('rkc')).toBe(false);
    expect(isRegionalShow(null)).toBe(false);
  });

  it('open and premier open are RKC open shows; a regional never is', () => {
    expect(isRkcOpenShow('open', 'rkc')).toBe(true);
    expect(isRkcOpenShow('premier_open', 'rkc')).toBe(true);
    expect(isRkcOpenShow('open', null)).toBe(true);
    expect(isRkcOpenShow('open', 'wusv')).toBe(false);
    for (const t of ['championship', 'limited', 'companion', 'primary']) {
      expect(isRkcOpenShow(t, 'rkc')).toBe(false);
    }
  });
});

describe('show-types: held under RKC Regulation F(1)', () => {
  // F(1) covers championship, open and limited shows; matches are F(2) and
  // companion dog shows F(3). A regional is never an RKC show.
  it('championship, open, premier open and limited are F(1) shows', () => {
    for (const t of ['championship', 'open', 'premier_open', 'limited']) {
      expect(isRkcF1Show(t, 'rkc')).toBe(true);
      expect(isRkcF1Show(t, null)).toBe(true);
    }
  });
  it('companion and primary are not; nor is any regional', () => {
    expect(isRkcF1Show('companion', 'rkc')).toBe(false);
    expect(isRkcF1Show('primary', 'rkc')).toBe(false);
    expect(isRkcF1Show('championship', 'wusv')).toBe(false);
  });
});

describe('judgeOfferTerms — which shows carry what', () => {
  it('a regional carries nothing, whatever its type', () => {
    for (const t of ['championship', 'open', 'limited']) {
      expect(judgeOfferTerms({ showType: t, showRuleset: 'wusv', breedNames: GSD })).toBeNull();
    }
  });

  it('companion and primary shows (not F(1)) carry nothing', () => {
    expect(judgeOfferTerms({ showType: 'companion', showRuleset: 'rkc', breedNames: GSD })).toBeNull();
    expect(judgeOfferTerms({ showType: 'primary', showRuleset: 'rkc', breedNames: GSD })).toBeNull();
  });

  it('an RKC championship or limited show carries the F(1).21.b wording only', () => {
    for (const t of ['championship', 'limited']) {
      const terms = judgeOfferTerms({ showType: t, showRuleset: 'rkc', breedNames: GSD });
      expect(terms).not.toBeNull();
      expect(terms!.invitationParagraphs).toEqual([F121B_PARAGRAPH_1, F121B_PARAGRAPH_2]);
      expect(terms!.societyTerms).toEqual([]);
      expect(terms!.alreadyAgreedQuestion).toBeNull();
      expect(terms!.alreadyAgreedNotice).toBeNull();
      expect(terms!.version).toBe(JUDGE_OFFER_TERMS_VERSION);
    }
  });

  it('an RKC open show carries the wording, the three society terms and the question', () => {
    const terms = judgeOfferTerms({ showType: 'open', showRuleset: 'rkc', breedNames: GSD })!;
    expect(terms.invitationParagraphs).toEqual([F121B_PARAGRAPH_1, F121B_PARAGRAPH_2]);
    expect(terms.societyTerms).toEqual([
      'The Judge confirms that they are at Level 2 or above of the Royal Kennel Club Judges Education Programme (JEP) for this breed (German Shepherd Dog). This does not apply to a judge who lives overseas.',
      'From accepting this offer, the Judge will not accept any other appointment to judge this breed (German Shepherd Dog) before the date of this show.',
      'The Judge must tell the Society of every appointment to judge this breed (German Shepherd Dog) that they have already agreed to. The Judge does this when accepting.',
    ]);
    expect(terms.alreadyAgreedQuestion).toBe(
      'Have you already agreed to judge this breed (German Shepherd Dog) anywhere before the date of this show?',
    );
    expect(terms.alreadyAgreedNotice).toMatch(/when you accept/i);
  });

  it('a premier open show carries the same as an open show', () => {
    const open = judgeOfferTerms({ showType: 'open', showRuleset: 'rkc', breedNames: GSD });
    const premier = judgeOfferTerms({ showType: 'premier_open', showRuleset: 'rkc', breedNames: GSD });
    expect(premier).toEqual(open);
  });

  it('the F(1).21.b wording is plain ASCII', () => {
    const terms = judgeOfferTerms({ showType: 'open', showRuleset: 'rkc', breedNames: GSD })!;
    for (const s of [...terms.invitationParagraphs, ...terms.societyTerms, terms.alreadyAgreedQuestion!]) {
      expect(s).toMatch(/^[\x20-\x7e]+$/);
    }
  });
});

describe('the {breed} forms — never a plural breed name', () => {
  it('phrases', () => {
    expect(breedPhrase(['Beagle'])).toEqual({ one: 'this breed (Beagle)', any: 'this breed (Beagle)' });
    expect(breedPhrase(['Beagle', 'Basset Hound'])).toEqual({
      one: 'these breeds (Beagle, Basset Hound)',
      any: 'any of these breeds (Beagle, Basset Hound)',
    });
  });

  it('several named breeds read as correct English in every sentence', () => {
    const terms = judgeOfferTerms({ showType: 'open', showRuleset: 'rkc', breedNames: ['Beagle', 'Basset Hound'] })!;
    expect(terms.societyTerms).toEqual([
      'The Judge confirms that they are at Level 2 or above of the Royal Kennel Club Judges Education Programme (JEP) for these breeds (Beagle, Basset Hound). This does not apply to a judge who lives overseas.',
      'From accepting this offer, the Judge will not accept any other appointment to judge any of these breeds (Beagle, Basset Hound) before the date of this show.',
      'The Judge must tell the Society of every appointment to judge any of these breeds (Beagle, Basset Hound) that they have already agreed to. The Judge does this when accepting.',
    ]);
    expect(terms.alreadyAgreedQuestion).toBe(
      'Have you already agreed to judge any of these breeds (Beagle, Basset Hound) anywhere before the date of this show?',
    );
  });

  it('an open-show appointment that names no breed (Junior Handling only) gets the invitation wording only', () => {
    const terms = judgeOfferTerms({ showType: 'open', showRuleset: 'rkc', breedNames: [] })!;
    expect(terms.invitationParagraphs).toEqual([F121B_PARAGRAPH_1, F121B_PARAGRAPH_2]);
    expect(terms.societyTerms).toEqual([]);
    expect(terms.alreadyAgreedQuestion).toBeNull();
    expect(terms.alreadyAgreedNotice).toBeNull();
  });

  it('a repeated breed name is listed once', () => {
    expect(breedPhrase(['Beagle', 'Beagle'])?.one).toBe('this breed (Beagle)');
  });
});

describe('readStoredJudgeOfferTerms — the copy on the contract', () => {
  it('round-trips what judgeOfferTerms returns', () => {
    const terms = judgeOfferTerms({ showType: 'open', showRuleset: 'rkc', breedNames: GSD });
    expect(readStoredJudgeOfferTerms(JSON.parse(JSON.stringify(terms)))).toEqual(terms);
  });

  it('NULL (an offer sent before this feature) reads as no terms', () => {
    expect(readStoredJudgeOfferTerms(null)).toBeNull();
    expect(readStoredJudgeOfferTerms(undefined)).toBeNull();
  });

  it('a malformed value reads as no terms rather than crashing', () => {
    expect(readStoredJudgeOfferTerms({ nonsense: true })).toBeNull();
    expect(readStoredJudgeOfferTerms('text')).toBeNull();
  });
});

describe('checkAlreadyAgreedAnswer — the server is the gate', () => {
  const open = judgeOfferTerms({ showType: 'open', showRuleset: 'rkc', breedNames: GSD });
  const champ = judgeOfferTerms({ showType: 'championship', showRuleset: 'rkc', breedNames: GSD });

  it('not asked (no terms, or no question) → nothing to store', () => {
    expect(checkAlreadyAgreedAnswer(null, {})).toEqual({ ok: true, answer: null, details: null });
    expect(checkAlreadyAgreedAnswer(champ, { answer: 'yes', details: 'x' })).toEqual({ ok: true, answer: null, details: null });
  });

  it('no answer is refused', () => {
    const r = checkAlreadyAgreedAnswer(open, {});
    expect(r.ok).toBe(false);
  });

  it('Yes with an empty box is refused', () => {
    expect(checkAlreadyAgreedAnswer(open, { answer: 'yes', details: '   ' }).ok).toBe(false);
  });

  it('a box longer than the limit is refused', () => {
    const r = checkAlreadyAgreedAnswer(open, { answer: 'yes', details: 'x'.repeat(ALREADY_AGREED_MAX_LENGTH + 1) });
    expect(r.ok).toBe(false);
  });

  it('No stores false and no text, even if text was typed', () => {
    expect(checkAlreadyAgreedAnswer(open, { answer: 'no', details: 'typed then changed mind' }))
      .toEqual({ ok: true, answer: false, details: null });
  });

  it('Yes with text stores true and the trimmed text', () => {
    expect(checkAlreadyAgreedAnswer(open, { answer: 'yes', details: '  Show A, 1 May  ' }))
      .toEqual({ ok: true, answer: true, details: 'Show A, 1 May' });
  });
});

describe('alreadyAgreedAnswerText', () => {
  it('never asked → null', () => {
    expect(alreadyAgreedAnswerText({ alreadyAgreedElsewhere: null, alreadyAgreedDetails: null })).toBeNull();
  });
  it('No → None declared', () => {
    expect(alreadyAgreedAnswerText({ alreadyAgreedElsewhere: false, alreadyAgreedDetails: null })).toBe('None declared');
  });
  it('Yes → the judge\'s text', () => {
    expect(alreadyAgreedAnswerText({ alreadyAgreedElsewhere: true, alreadyAgreedDetails: 'Show A, 1 May' })).toBe('Show A, 1 May');
  });
});

describe('the breed names come from the breed line\'s own builder', () => {
  // buildJudgeBreedAndClassification (src/lib/judge-breed-classification.ts)
  // owns the offer's breed line; the terms take their {breed} from its
  // `breedNames`, never from a second derivation or from splitting breedLine
  // (which falls back to the show's NAME when no breed is named).
  it('named breeds', async () => {
    const { buildJudgeBreedAndClassification } = await import('@/lib/judge-breed-classification');
    const r = buildJudgeBreedAndClassification(
      [{ breed: { name: 'Beagle' }, sex: 'dog' }, { breed: { name: 'Basset Hound' }, sex: null }],
      ['Beagle', 'Basset Hound'],
      'Spring Open Show',
    );
    expect(r.breedNames).toEqual(['Beagle', 'Basset Hound']);
  });

  it('a single-breed show whose assignment has no breed id still names the breed', async () => {
    const { buildJudgeBreedAndClassification } = await import('@/lib/judge-breed-classification');
    const r = buildJudgeBreedAndClassification([{ breed: null, sex: 'bitch' }], GSD, 'Spring Open Show');
    expect(r.breedNames).toEqual(GSD);
  });

  it('no named breed → empty, never the show name', async () => {
    const { buildJudgeBreedAndClassification } = await import('@/lib/judge-breed-classification');
    const r = buildJudgeBreedAndClassification([], [], 'Spring Open Show');
    expect(r.breedLine).toBe('Spring Open Show');
    expect(r.breedNames).toEqual([]);
  });
});

describe('alreadyAgreedSentence — the line in the secretary\'s email', () => {
  it('never asked → null', () => {
    expect(alreadyAgreedSentence({ alreadyAgreedElsewhere: null, alreadyAgreedDetails: null })).toBeNull();
  });
  it('No → none declared', () => {
    expect(alreadyAgreedSentence({ alreadyAgreedElsewhere: false, alreadyAgreedDetails: null }))
      .toBe('Appointments already agreed: none declared');
  });
  it('Yes → the judge\'s text', () => {
    expect(alreadyAgreedSentence({ alreadyAgreedElsewhere: true, alreadyAgreedDetails: 'Show A, 1 May' }))
      .toBe('Appointments already agreed: Show A, 1 May');
  });
});

describe('a Yes is never shown as "None declared"', () => {
  it('Yes with blank details reads "Yes (no details given)"', () => {
    expect(alreadyAgreedAnswerText({ alreadyAgreedElsewhere: true, alreadyAgreedDetails: null })).toBe('Yes (no details given)');
    expect(alreadyAgreedAnswerText({ alreadyAgreedElsewhere: true, alreadyAgreedDetails: '   ' })).toBe('Yes (no details given)');
  });
  it('the sentence follows', () => {
    expect(alreadyAgreedSentence({ alreadyAgreedElsewhere: true, alreadyAgreedDetails: '' }))
      .toBe('Appointments already agreed: Yes (no details given)');
  });
});
