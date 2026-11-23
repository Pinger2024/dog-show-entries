import { getRkcRegulationYear, type RkcRegulationYear } from '@/lib/rkc-schedule-profile';

/**
 * The entry declaration an exhibitor accepts — the load-bearing consent for
 * the whole entry, and the one piece of wording the RKC specifies word for
 * word.
 *
 * ONE owner (CLAUDE.md, "One owner per rule"). It used to be hand-copied into
 * three files — the online checkout, the single-breed schedule's postal entry
 * form and the multi-breed schedule's — and `rkc-entry-declaration.test.ts`
 * fails the suite if a fourth copy appears. A declaration written down twice
 * is one that will disagree with itself, and here the disagreement would be
 * between what an exhibitor agreed to online and what the printed form says
 * they agreed to.
 *
 * Found by the 2027 amendment: F(1)8.h inserts eight words into it, which
 * would have meant three separate edits.
 */

/**
 * F(1)8.h, effective for shows from 1 January 2027: the declaration must also
 * record agreement to comply with the schedule's requirements. Verbatim from
 * the 2027 specimen schedules, which read "…abide by the Regulations of this
 * Show and to comply with the requirements of the schedule, and not to bring…"
 */
const SCHEDULE_COMPLIANCE_CLAUSE = 'and to comply with the requirements of the schedule, ';

/** The RKC declaration, per the specimen schedule for `regulationYear`. */
export function rkcEntryDeclaration(regulationYear: RkcRegulationYear): string {
  const scheduleClause = regulationYear >= 2027 ? SCHEDULE_COMPLIANCE_CLAUSE : '';
  return (
    'I/We agree to submit to and be bound by Royal Kennel Club Limited Rules & Regulations in their '
    + 'present form or as they may be amended from time to time in relation to all canine matters with '
    + 'which the Royal Kennel Club is concerned and that this entry is made upon the basis that all '
    + 'current single or joint registered owners of this dog(s) have authorised/consented to this entry. '
    + 'I/We also undertake to abide by the Regulations of this Show '
    + scheduleClause
    + 'and not to bring to the Show any dog which has contracted or been knowingly exposed to any '
    + 'infectious or contagious disease during the 21 days prior to the Show, or which is suffering from '
    + 'a visible condition which adversely affects its health or welfare or to bring any dog which has '
    + 'been prepared for exhibition contrary to Royal Kennel Club Regulations for the Preparation of Dogs '
    + 'for Exhibition F (Annex B). I/We agree without reservation that any Veterinary Surgeon operating on '
    + 'any of my/our dogs in such a way that the operation alters the natural conformation of the dog or '
    + 'part thereof may report such operations to the Royal Kennel Club. I/We declare that where any '
    + 'alteration has been made to the natural conformation of the dog(s) the relevant permission to show '
    + 'has been granted by the Royal Kennel Club. I/We further declare that I believe to the best of my '
    + 'knowledge that the dogs are not liable to disqualification under Royal Kennel Club Show '
    + 'Regulations. I/We also confirm that I/we understand the eligibility of the classes entered.'
  );
}

/**
 * Regional (SV/WUSV) events are not RKC-licensed, so the F regulations — and
 * the 2027 amendments with them — do not apply. Placeholder wording pending
 * the official SV declaration (Mandy 2026-05-20).
 */
export const GSDL_BRG_ENTRY_DECLARATION =
  'I/We agree to abide by the GSDL-British Regional Group Rules & Regulations (based on WUSV/SV Rules '
  + '& Regulations) for this Regional Event. I/We confirm that the information provided about the dog is '
  + 'accurate, and that the dog meets the eligibility requirements for the classes entered — including '
  + 'any health test disclosure, DNA recording, Koerung or working title requirements that apply to the '
  + 'class. I/We undertake not to bring to the Event any dog which has contracted or been knowingly '
  + 'exposed to any infectious or contagious disease during the 21 days prior to the Event, or which is '
  + 'suffering from a visible condition that adversely affects its health or welfare. I/We acknowledge '
  + 'that exhibitors are obligated to make true statements about their dog(s) and to show sportsmanlike '
  + 'conduct; any attempt at deception may result in disqualification and disciplinary action by the '
  + 'GSDL-BRG.';

/**
 * The declaration for one show — the only function any render path should
 * call. `startDate` is the show's first day, which decides the RKC regulation
 * edition (see `getRkcRegulationYear`).
 */
export function entryDeclaration({
  isRegional = false,
  startDate = null,
}: {
  isRegional?: boolean;
  startDate?: string | Date | null;
}): string {
  if (isRegional) return GSDL_BRG_ENTRY_DECLARATION;
  return rkcEntryDeclaration(getRkcRegulationYear(startDate));
}
