/**
 * The standard terms a judge's offer carries. ONE owner (CLAUDE.md, "One owner
 * per rule"): the offer email, the judge's accept page, the contract PDF and
 * the secretary's screens all render what this module returns. No other file
 * may contain a term's words.
 *
 *   Regional (ruleset wusv), any type      → no terms at all (null)
 *   RKC companion or primary show (not     → no terms at all (null)
 *     held under Regulation F(1))
 *   RKC championship or limited show       → the F(1).21.b invitation wording
 *   RKC open show (incl. premier open)     → the F(1).21.b wording, the
 *                                            Society's three terms, and the
 *                                            "already agreed" question
 *
 * RKC Show Regulations 2026, F(1).21.b: "Societies are required to include the
 * following wording in judges' invitation letters" — the two paragraphs below,
 * word for word (plain ASCII quotes in our copy).
 *
 * The Society's three terms were agreed with the domain expert on 14 Nov 2026:
 * same breed only; "a minimum of level 2", not applicable to overseas judges;
 * always on, no tick box. Remi cannot check a judge's JEP level, so term 1 is
 * the judge's own declaration.
 *
 * The terms are STORED on the contract when the offer is sent
 * (`judge_contracts.offer_terms`), so a contract only ever shows the terms its
 * judge was actually sent. Surfaces that render an existing contract read the
 * stored copy through `readStoredJudgeOfferTerms`; they never call
 * `judgeOfferTerms` themselves.
 *
 * Pure (no db / node imports): the secretary's offer dialog imports it too.
 */
import { isRkcF1Show, isRkcOpenShow } from './show-types';

/** Bump when the shape or the wording of the stored terms changes. */
export const JUDGE_OFFER_TERMS_VERSION = 1;

/** The longest answer a judge may type about appointments already agreed. */
export const ALREADY_AGREED_MAX_LENGTH = 2000;

/** Heading over the whole block (the PDF's section; the secretary's dialog). */
export const JUDGE_OFFER_TERMS_HEADING = 'Terms of this appointment';
/** Heading over the Society's numbered terms. */
export const SOCIETY_TERMS_HEADING = "The Society's terms";
/** Label for the judge's answer, wherever it is shown. */
export const ALREADY_AGREED_LABEL = 'Appointments already agreed';
/** What the judge's "No" reads as. */
export const ALREADY_AGREED_NONE = 'None declared';
/** The prompt over the text box when the judge answers Yes. */
export const ALREADY_AGREED_DETAILS_PROMPT = 'Please list each show and its date.';

const F121B_INVITATION_WORDING = [
  'In accepting this invitation you agree to be bound by Royal Kennel Club Rules and Regulations and the Royal Kennel Club Code of Best Practice for Judges. In doing so you also recognise that you are obliged to notify us in writing of any change in your personal circumstances or additional information which may affect your ability and standing to fulfil this judging appointment.',
  'You should also note that we reserve the right to cancel this contract before the date of the show if there is a change in your circumstances, which in our reasonable opinion would adversely affect your ability to fulfil the appointment.',
] as const;

/** The terms exactly as sent — the shape stored in `judge_contracts.offer_terms`. */
export interface JudgeOfferTerms {
  version: number;
  /** The F(1).21.b paragraphs. */
  invitationParagraphs: string[];
  /** The Society's own terms as final sentences (empty unless an RKC open show). */
  societyTerms: string[];
  /** The question the judge must answer when accepting; null = not asked. */
  alreadyAgreedQuestion: string | null;
  /** The one line in the offer email telling the judge the question is coming. */
  alreadyAgreedNotice: string | null;
}

/**
 * The `{breed}` wording. A breed name is never pluralised:
 *  one named breed     → "this breed (German Shepherd Dog)"
 *  several             → "these breeds (A, B)" / "any of these breeds (A, B)"
 *  none named          → "the breeds in this appointment" / "any of the breeds …"
 * `one` reads after "for"; `any` reads after "to judge".
 */
export function breedPhrase(breedNames: readonly string[]): { one: string; any: string } {
  const names = [...new Set(breedNames.map((b) => b.trim()).filter(Boolean))];
  if (names.length === 1) {
    const p = `this breed (${names[0]})`;
    return { one: p, any: p };
  }
  if (names.length > 1) {
    const list = names.join(', ');
    return { one: `these breeds (${list})`, any: `any of these breeds (${list})` };
  }
  return { one: 'the breeds in this appointment', any: 'any of the breeds in this appointment' };
}

export interface JudgeOfferTermsInput {
  showType: string | null | undefined;
  showRuleset: string | null | undefined;
  /** The named breeds of this judge's appointment — `breedNames` from
   *  buildJudgeBreedAndClassification, the same source as the offer's breed
   *  line. Empty when the appointment names no breed. */
  breedNames: readonly string[];
}

/** What standard terms this judge's offer carries. Null = none (a regional). */
export function judgeOfferTerms(input: JudgeOfferTermsInput): JudgeOfferTerms | null {
  // F(1).21.b binds only shows held under Regulation F(1); a regional,
  // companion or primary show carries no standard terms at all.
  if (!isRkcF1Show(input.showType, input.showRuleset)) return null;

  const invitationParagraphs = [...F121B_INVITATION_WORDING];
  if (!isRkcOpenShow(input.showType, input.showRuleset)) {
    return {
      version: JUDGE_OFFER_TERMS_VERSION,
      invitationParagraphs,
      societyTerms: [],
      alreadyAgreedQuestion: null,
      alreadyAgreedNotice: null,
    };
  }

  const breed = breedPhrase(input.breedNames);
  return {
    version: JUDGE_OFFER_TERMS_VERSION,
    invitationParagraphs,
    societyTerms: [
      `The Judge confirms that they are at Level 2 or above of the Royal Kennel Club Judges Education Programme (JEP) for ${breed.one}. This does not apply to a judge who lives overseas.`,
      `From accepting this offer, the Judge will not accept any other appointment to judge ${breed.any} before the date of this show.`,
      `The Judge must tell the Society of every appointment to judge ${breed.any} that they have already agreed to. The Judge does this when accepting.`,
    ],
    alreadyAgreedQuestion: `Have you already agreed to judge ${breed.any} anywhere before the date of this show?`,
    alreadyAgreedNotice: `When you accept, you will be asked whether you have already agreed to judge ${breed.any} anywhere before the date of this show.`,
  };
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

/**
 * Read the stored copy off a contract row. NULL (an offer sent before this
 * feature) and anything malformed read as null, which every surface renders
 * exactly as it did before the feature.
 */
export function readStoredJudgeOfferTerms(stored: unknown): JudgeOfferTerms | null {
  if (!stored || typeof stored !== 'object') return null;
  const t = stored as Record<string, unknown>;
  if (typeof t.version !== 'number') return null;
  if (!isStringArray(t.invitationParagraphs) || !isStringArray(t.societyTerms)) return null;
  const q = t.alreadyAgreedQuestion;
  const n = t.alreadyAgreedNotice;
  if (q !== null && typeof q !== 'string') return null;
  if (n !== null && typeof n !== 'string') return null;
  return {
    version: t.version,
    invitationParagraphs: t.invitationParagraphs,
    societyTerms: t.societyTerms,
    alreadyAgreedQuestion: q,
    alreadyAgreedNotice: n,
  };
}

export type AlreadyAgreedCheck =
  | { ok: true; answer: boolean | null; details: string | null }
  | { ok: false; message: string };

/**
 * The gate on Accept. When the stored terms ask the question, the judge must
 * answer it, and a Yes needs the list. Returns what to store on the contract
 * (`answer` null = never asked).
 */
export function checkAlreadyAgreedAnswer(
  terms: JudgeOfferTerms | null,
  form: { answer?: string | null; details?: string | null },
): AlreadyAgreedCheck {
  if (!terms?.alreadyAgreedQuestion) return { ok: true, answer: null, details: null };
  const answer = (form.answer ?? '').trim().toLowerCase();
  if (answer === 'no') return { ok: true, answer: false, details: null };
  if (answer !== 'yes') {
    return { ok: false, message: 'Please answer this question by choosing No or Yes.' };
  }
  const details = (form.details ?? '').trim();
  if (!details) {
    return { ok: false, message: 'You chose Yes. Please list each show and its date in the box.' };
  }
  if (details.length > ALREADY_AGREED_MAX_LENGTH) {
    return {
      ok: false,
      message: `Please keep your list shorter. It can be up to ${ALREADY_AGREED_MAX_LENGTH.toLocaleString('en-GB')} characters.`,
    };
  }
  return { ok: true, answer: true, details };
}

/** The judge's answer as words: null when never asked. */
export function alreadyAgreedAnswerText(contract: {
  alreadyAgreedElsewhere: boolean | null;
  alreadyAgreedDetails: string | null;
}): string | null {
  if (contract.alreadyAgreedElsewhere == null) return null;
  if (!contract.alreadyAgreedElsewhere) return ALREADY_AGREED_NONE;
  return contract.alreadyAgreedDetails?.trim() || ALREADY_AGREED_NONE;
}

/** The answer as one line — "Appointments already agreed: none declared" or the
 *  judge's text. Null when never asked. */
export function alreadyAgreedSentence(contract: {
  alreadyAgreedElsewhere: boolean | null;
  alreadyAgreedDetails: string | null;
}): string | null {
  const text = alreadyAgreedAnswerText(contract);
  if (text == null) return null;
  return `${ALREADY_AGREED_LABEL}: ${text === ALREADY_AGREED_NONE ? 'none declared' : text}`;
}
