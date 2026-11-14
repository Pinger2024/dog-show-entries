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
  breedPhrase,
  JUDGE_OFFER_TERMS_VERSION,
  ALREADY_AGREED_MAX_LENGTH,
} from '@/lib/judge-offer-terms';
import { isRkcOpenShow, isRegionalShow } from '@/lib/show-types';

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

describe('judgeOfferTerms — which shows carry what', () => {
  it('a regional carries nothing, whatever its type', () => {
    for (const t of ['championship', 'open', 'limited']) {
      expect(judgeOfferTerms({ showType: t, showRuleset: 'wusv', breedNames: GSD })).toBeNull();
    }
  });

  it('an RKC championship (and every other non-open type) carries the F(1).21.b wording only', () => {
    for (const t of ['championship', 'limited', 'companion', 'primary']) {
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
    expect(breedPhrase([])).toEqual({
      one: 'the breeds in this appointment',
      any: 'any of the breeds in this appointment',
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

  it('no named breed reads "the breeds in this appointment"', () => {
    const terms = judgeOfferTerms({ showType: 'open', showRuleset: 'rkc', breedNames: [] })!;
    expect(terms.societyTerms).toEqual([
      'The Judge confirms that they are at Level 2 or above of the Royal Kennel Club Judges Education Programme (JEP) for the breeds in this appointment. This does not apply to a judge who lives overseas.',
      'From accepting this offer, the Judge will not accept any other appointment to judge any of the breeds in this appointment before the date of this show.',
      'The Judge must tell the Society of every appointment to judge any of the breeds in this appointment that they have already agreed to. The Judge does this when accepting.',
    ]);
    expect(terms.alreadyAgreedQuestion).toBe(
      'Have you already agreed to judge any of the breeds in this appointment anywhere before the date of this show?',
    );
  });

  it('a repeated breed name is listed once', () => {
    expect(breedPhrase(['Beagle', 'Beagle']).one).toBe('this breed (Beagle)');
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
