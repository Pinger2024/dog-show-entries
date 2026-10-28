import React from 'react';
import { Text, View } from '@react-pdf/renderer';
import { formatCurrency, NFC_MIN_AGE_WEEKS } from '@/lib/date-utils';
import { getRkcScheduleProfile, type RkcRegulationYear } from '@/lib/rkc-schedule-profile';
import { RKC_JUDGES_WELFARE_STATEMENT } from '@/lib/rkc-statements';
import type { ScheduleShowInfo } from './types';
import { C, formatTime, s } from './styles';
import { Rule } from './elements';

function entryFees(show: ScheduleShowInfo): string {
  const parts = [
    show.firstEntryFee != null ? formatCurrency(show.firstEntryFee) + ' first entry' : null,
    show.subsequentEntryFee != null ? formatCurrency(show.subsequentEntryFee) + ' each subsequent entry with the same dog' : null,
    ...show.discountGroups.map((group) => group.label + ': ' + formatCurrency(group.firstEntryFeePence) + ' first entry'),
    show.nfcEntryFee != null ? 'NFC: ' + formatCurrency(show.nfcEntryFee) : null,
    show.juniorHandlerFee != null ? 'Junior Handling: ' + formatCurrency(show.juniorHandlerFee) : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join('; ') : 'See the entry form';
}

/** Approved instructions from the current RKC postal entry-form specimens. */
export function RkcPostalEntryInstructions({ show }: { show: ScheduleShowInfo }) {
  const profile = getRkcScheduleProfile({
    showType: show.showType,
    showScope: show.showScope,
    judgedOnGroupSystem: show.scheduleData?.judgedOnGroupSystem,
    startDate: show.date,
  });
  const puppyAge = profile.minimumPuppyAgeMonths === 4 ? '4' : '6';
  // F(1)8.e as amended for 2027: the proof-of-postage sentence goes, and the
  // responsibility for an entry having arrived sits with the exhibitor, who is
  // advised to enclose an SAE if they want it acknowledged.
  const receiptAdvice = profile.regulationYear >= 2027
    ? 'Exhibitors who require acknowledgement of receipt are advised to include a stamped, self-addressed envelope with their entry.'
    : 'In case of dispute proof of postage of such applications may be required by The Royal Kennel Club.';

  return (
    <Text style={{ fontFamily: 'Times', fontSize: 6.2, lineHeight: 1.35, color: C.textMedium, marginTop: 4 }}>
      <Text style={{ fontWeight: 'bold' }}>INSTRUCTIONS: </Text>
      This form must be used by one person only (or partnership). Writing MUST BE IN INK OR INDELIBLE PENCIL. Use one line only for each dog. The name of the dog and all the details as recorded with The Royal Kennel Club must be given on this entry form. If an error is made the dog may be disqualified by the Committee of The Royal Kennel Club. All dogs must be REGISTERED at The Royal Kennel Club in the name of the exhibitor. If the registration or transfer of ownership has not been confirmed it must be applied for before the closing date of entries. {receiptAdvice} Puppies under {puppyAge} months of age on the first day of the Show cannot be entered for competition. On no account will entries be accepted without fees. If a dog is in the process of Registration or Transfer at the time entry is made, add the letters NAF or TAF as appropriate after its name. NAF means Name Applied For; TAF means Transfer Applied For. Please put classes in numerical order and USE BLOCK CAPITALS throughout when completing this entry form. The Royal Kennel Club Authority to Compete number (for dogs registered and resident outside the UK) must be stated or the entry will be returned. PLEASE CHECK ALL DETAILS BEFORE POSTING. Send completed postal entries and fees to: {show.secretaryName || 'Show Secretary'}, {show.secretaryAddress || 'the secretary address shown in the schedule'}.
    </Text>
  );
}

/**
 * Mandatory judges' undertaking, deliberately positioned on the first inside
 * page by both schedule renderers instead of being buried in the rules block.
 */
export function RkcJudgesWelfareCommitment() {
  return (
    <View style={s.welfareCommitment} wrap={false}>
      <Text style={s.welfareCommitmentEyebrow}>Royal Kennel Club welfare undertaking</Text>
      <Text style={s.welfareCommitmentTitle}>Judges&apos; Welfare Commitment</Text>
      <Text style={s.welfareCommitmentText}>{RKC_JUDGES_WELFARE_STATEMENT}</Text>
    </View>
  );
}

/**
 * Who may lodge an objection — RKC Regulation F(B)5, which the RKC requires to
 * be printed in the schedule or on the back of the entry form. ONE owner: both
 * schedule renderers print this same rule, and 2027 rewords it, so it lives
 * here rather than being hand-mirrored in each.
 *
 * 2027 (F(B)5 and F(1)28.c.(2) as amended): the restriction to an owner or
 * handler of a dog in the same breed or class becomes explicit ("only if"),
 * closing the reading that anyone not under suspension could object.
 */
export function rkcObjectionEligibilityRule(regulationYear: RkcRegulationYear): string {
  const opening = regulationYear >= 2027
    ? 'Any individual has the right to lodge an objection to a dog, only if he/she is the owner or handler of a dog competing in the same breed or class. An objection may also, however, be lodged by an official of the Show or by anyone so deputed by the Royal Kennel Club.'
    : 'An individual has the right to lodge an objection to a dog if he/she is the owner or handler of a dog competing in the same breed or class. An objection may however, be lodged by an official of the Show or by anyone so deputed by the Royal Kennel Club.';
  return `${opening} It will be the responsibility of the individual who lodges the objection or the official (as appropriate) to substantiate the grounds for the objection. The Royal Kennel Club will substantiate the grounds for an objection made on its behalf.`;
}

/**
 * The Best Veteran in Show eligibility sentence a club gets when it hasn't
 * written its own (`scheduleData.bestVeteranInShowEligibility`).
 *
 * F(1)27 as amended for 2027 standardises this and — at breed club shows, our
 * whole product today — widens the pool: a Best Veteran is declared from ANY
 * veteran entered in ANY breed class, not just from the Veteran classes. The
 * regulation also finally puts a number on veteran age: 7 years on the first
 * day. The awards engine (`lib/top-awards.ts`) still infers the veteran band
 * from class names; that change is held pending Mandy's confirmation.
 */
export function defaultBestVeteranEligibility({
  multiBreed,
  showType,
  regulationYear,
}: {
  multiBreed: boolean;
  showType: string;
  regulationYear: RkcRegulationYear;
}): string {
  if (regulationYear < 2027) {
    return 'Eligible dogs are those declared Best Veteran in their breed, or Best Veteran of Sex where applicable.';
  }
  const age = 'A Veteran is a dog of 7 years or more on the first day of the show.';
  if (!multiBreed) {
    return `${age} A Best Veteran is declared from any Veterans entered in any breed classes.`;
  }
  if (showType === 'championship') {
    return `${age} Best Veteran in Show must be selected from the Best Veteran in Group winners.`;
  }
  return `${age} The Best Veteran in Show is the exhibit which has been declared Best from the Any Variety Veteran classes scheduled.`;
}

/** The age band, unchanged by the 2027 amendment and so shared by both years. */
const BABY_PUPPY_AGE_SENTENCE =
  'A Baby Puppy is a dog of four and less than six calendar months of age on the first day of the show.';

/**
 * F(1)26.f's lettered clauses for 2027, verbatim and in the RKC's own order.
 * Declared as the three clauses they are rather than run into one string, so
 * the lettering cannot drift out of step with the regulation it copies.
 */
const BABY_PUPPY_2027_CLAUSES: readonly string[] = [
  '(a) Baby Puppy classes may be scheduled at any breed club show.',
  '(b) Any Variety Baby Puppy classes may be scheduled at any breed club show.',
  '(c) Best Baby Puppy in Breed may be declared in each breed from the dogs entered in the Baby Puppy breed classes. There must be no progression to further competition and Baby Puppies must not be entered in any other classes at a show.',
];

/**
 * F(1)26.f as amended for 2027: Any Variety Baby Puppy classes are named,
 * Best Baby Puppy in Breed is declared per breed from the Baby Puppy BREED
 * classes, and — the substantive change — a baby puppy may not be entered in
 * any other class at the show.
 *
 * **Laid out as the RKC lay it out** — a lead sentence, then lettered (a), (b)
 * and (c) one per line. Mandy, 27 Oct 2026, after reading the run-on version
 * on the practice site: *"yes I would lay it out the exact same as RKC have
 * laid it out"*. She had queried the paragraph as self-contradictory, and she
 * was reading it correctly: (b) permits an Any Variety Baby Puppy class at a
 * breed club show while (c) bars a baby puppy from "any other classes". The
 * contradiction is the regulation's own, resolved by the amendment's own title
 * — "Amendment to ensure Baby Puppies should only enter Baby Puppy classes" —
 * which we do not print. The lettering is what makes that legible at a glance
 * on the page, so this is the RKC's layout restored, not wording of ours.
 *
 * 2026 is deliberately untouched and stays one paragraph: the lettered clauses
 * arrived with the 2027 amendment, and every 2026 baseline must stay byte-
 * identical (see research/RKC-2027-CHANGES-2026-10-26.md).
 */
export function babyPuppyRule(regulationYear: RkcRegulationYear): string {
  if (regulationYear >= 2027) {
    return [BABY_PUPPY_AGE_SENTENCE, ...BABY_PUPPY_2027_CLAUSES].join('\n');
  }
  return `${BABY_PUPPY_AGE_SENTENCE} Baby Puppy classes may be scheduled at any breed Club show. Best Baby Puppy in Breed may be declared from the dogs entered in the Baby Puppy class. There must be no progression to further competitions.`;
}

/**
 * The two printed Not For Competition sentences — the formal schedule rule
 * (F(1)18) and the friendly summary card — both of which quote the minimum
 * age. ONE owner for the printed text, reading {@link NFC_MIN_AGE_WEEKS} so
 * the schedule can never disagree with the gate that actually refuses the
 * entry (`isOldEnoughForNfc`).
 *
 * Why this exists: the age was a constant in `date-utils.ts` but a
 * hand-typed "12 weeks" in three printed strings — rkc-rules.tsx (this
 * rule), show-schedule.tsx and show-schedule-multibreed.tsx (the summary,
 * byte-identical in both). Found 2026-10-27 while checking our rendered 2027
 * schedule against the RKC's specimens, which print "3 calendar months" for
 * the same rule: if that figure ever has to move, it must move in one place.
 */
export function nfcScheduleRule(accepted: boolean): string {
  if (!accepted) return 'Not for Competition entries will not be accepted.';
  return `Not for Competition entries will be accepted. Details of each dog so entered must be recorded on the entry form and must be Royal Kennel Club registered. Dogs must be at least ${NFC_MIN_AGE_WEEKS} weeks of age on the first day of the show.`;
}

/** The exhibitor-facing summary card version of {@link nfcScheduleRule}. */
export function nfcSummaryText(accepted: boolean): string {
  if (!accepted) return 'Not For Competition entries are not accepted at this show.';
  return `Not For Competition entries are accepted. NFC dogs must be registered with the Royal Kennel Club and aged ${NFC_MIN_AGE_WEEKS} weeks or over.`;
}

function BestPuppyRule({ multiBreed, groupSystem, regulationYear }: { multiBreed: boolean; groupSystem: boolean; regulationYear: RkcRegulationYear }) {
  if (!multiBreed) {
    return (
      <Text style={s.ruleText}>
        <Text style={s.ruleNumber}>10.</Text>{' '}
        <Text style={s.ruleTextBold}>Best Puppy in Show:</Text>{' '}
        Where a Best Puppy in Show competition is scheduled the Best Puppy in Show is a puppy which has competed and is unbeaten by any other puppy exhibited at the show. A puppy is a dog of six and not exceeding twelve calendar months of age on the first day of the show.
        {'\n'}{babyPuppyRule(regulationYear)}
      </Text>
    );
  }

  return (
    <Text style={s.ruleText}>
      <Text style={s.ruleNumber}>10.</Text>{' '}
      <Text style={s.ruleTextBold}>Best Puppy in Show:</Text>{' '}
      Where a Best Puppy in Show competition is scheduled the Best Puppy in Show is a puppy which has competed and has been declared Best Puppy in Breed, Best Any Variety Not Separately Classified Puppy or Best Any Variety Imported Breed Register Puppy. A puppy is a dog of six and not exceeding twelve calendar months of age on the first day of the Show.
      {groupSystem
        ? ' Best Puppy in Group must be selected from the Best Puppy in Breed winners, Best Any Variety Not Separately Classified Puppy and Best Any Variety Imported Breed Register Puppy in each group. Best Puppy in Show must be selected from the Best Puppy in Group winners.'
        : ''}
    </Text>
  );
}

function BestInShowRule({ multiBreed, groupSystem }: { multiBreed: boolean; groupSystem: boolean }) {
  if (!multiBreed) {
    return (
      <Text style={s.ruleText}>
        <Text style={s.ruleNumber}>11.</Text>{' '}
        <Text style={s.ruleTextBold}>Best in Show:</Text>{' '}
        Best in Show must be selected from the exhibits declared Best of Sex. If a Reserve Best in Show is to be selected, the eligible dogs are those declared Best Opposite Sex and Reserve Best of Sex to the exhibit declared Best in Show.
      </Text>
    );
  }
  return (
    <Text style={s.ruleText}>
      <Text style={s.ruleNumber}>11.</Text>{' '}
      <Text style={s.ruleTextBold}>{groupSystem ? 'Best of Group, Best in Show:' : 'Best in Show:'}</Text>{' '}
      Where a breed is separately classified a Best of Breed may be declared but only from those dogs which have received a first prize in a breed class at the show. Where separate classes are provided for each sex of a breed a Best of each Sex must be declared.
      {'\n'}{groupSystem
        ? 'Best of Group and subsequent placings must be selected from the Best of Breed winners in each group, the dog declared Best Any Variety Not Separately Classified in each group, and the Best dog from Any Variety Imported Breed Register classes in each group. Best in Show must be selected from the Best of Group winners. Reserve Best in Show must be selected from the remaining Group winners following the selection of Best in Show.'
        : 'Best in Show and subsequent placings must be selected from those dogs declared Best of Breed, Best Any Variety Not Separately Classified and Best Any Variety Imported Breed Register.'}
    </Text>
  );
}

export function RkcNumberedRules({ show, multiBreed }: { show: ScheduleShowInfo; multiBreed: boolean }) {
  const sd = show.scheduleData;
  const profile = getRkcScheduleProfile({
    showType: show.showType,
    showScope: show.showScope,
    judgedOnGroupSystem: sd?.judgedOnGroupSystem,
    startDate: show.date,
  });

  return (
    <>
      {profile.isGroupSystem && (show.showType === 'open' || show.showType === 'premier_open') && (
        <View style={{ marginBottom: 10, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: C.cardBg, borderRadius: 4, borderLeftWidth: 3, borderLeftColor: C.primary }} wrap={false}>
          <Text style={{ fontFamily: 'Inter', fontSize: 7, fontWeight: 'bold', color: C.primary, letterSpacing: 0.5, marginBottom: 2 }}>CRUFTS QUALIFICATION</Text>
          <Text style={{ fontFamily: 'Times', fontSize: 7.5, lineHeight: 1.5, color: C.textDark }}>
            Dogs placed 1&ndash;4 in each group, and 1&ndash;4 in each puppy group, will qualify for Crufts the following year.
          </Text>
        </View>
      )}

      <Rule num="1">The show will open at {show.showOpenTime ? formatTime(show.showOpenTime) : '[time to be confirmed]'}.</Rule>
      <Rule num="2">
        {sd?.latestArrivalTime
          ? 'Dogs will be received until ' + formatTime(sd.latestArrivalTime) + '.'
          : 'Dogs will be received at any time but it is the exhibitor’s responsibility to ensure that exhibits are available for judging when required.'}
      </Rule>
      <Rule num="3">Judging will commence at {show.startTime ? formatTime(show.startTime) : '[time to be confirmed]'}.</Rule>
      <Rule num="4">
        {sd?.isBenched
          ? 'Dogs will be benched. ' + (sd.benchingRemovalTime?.trim() || 'Exhibits may be removed after their judging has been completed.')
          : 'Dogs will not be benched. Exhibits may be removed from the Show after their judging has been completed.'}{' '}
        The Show will close half an hour after all judging has been completed. Exhibits may not be removed any earlier unless by written order of the veterinary surgeon, veterinary practitioner or of the Show Management and then only in very exceptional and unforeseen circumstances which must be reported to the Royal Kennel Club.
      </Rule>
      <Rule num="5">
        ENTRY FEES: {entryFees(show)}. Online entry at remishowmanager.co.uk/shows/{show.slug}. A handling fee of £1.00 plus 1% of the order subtotal is shown before online payment.
      </Rule>
      <Rule num="6">PRIZE MONEY: {sd?.prizeMoney?.trim() || 'There is no prize money on offer at this show.'}</Rule>
      <Rule num="7">The Committee reserves to itself the right to refuse entries.</Rule>
      <Rule num="8">Puppies under {profile.minimumPuppyAgeMonths === 4 ? 'four' : 'six'} calendar months of age on the first day of the Show are not eligible for exhibition.</Rule>
      <Rule num="9">The mating of bitches within the precincts of the Show is forbidden.</Rule>
      <BestPuppyRule multiBreed={multiBreed} groupSystem={profile.isGroupSystem} regulationYear={profile.regulationYear} />
      <BestInShowRule multiBreed={multiBreed} groupSystem={profile.isGroupSystem} />
      {sd?.hasBestVeteranInShow && (
        <Text style={s.ruleText}>
          <Text style={s.ruleTextBold}>Best Veteran in Show:</Text>{' '}
          {sd.bestVeteranInShowEligibility?.trim() || defaultBestVeteranEligibility({ multiBreed, showType: show.showType, regulationYear: profile.regulationYear })}
        </Text>
      )}
      <Rule num="12">Exhibits will not be admitted to Group or Best in Show competition after a period of ten minutes has elapsed since the announcement that exhibits are required for judging, unless they have been unavoidably delayed by previous judging not being completed on time, and then only with the special permission of the Show Management.</Rule>
      <Rule num="13">Exhibitors must not pick up dogs by their tails and leads when lifting them nor handle a dog in a manner which causes its feet not to touch the ground when on the move. This is not acceptable. Exhibitors should note that such practice would constitute harsh handling and reports of such practice will be referred to the Committee under Royal Kennel Club Show Regulation F11.</Rule>
      <Rule num="14">All exhibitors must be familiar with Royal Kennel Club Regulation F (Annex B) Regulations for the Preparation of Dogs for Exhibition.</Rule>
      <Rule num="15">All dogs resident outside the UK must be issued with a Royal Kennel Club Authority to Compete number before entry to the show/event can be made. All overseas entries without an Authority to Compete number will be returned to the exhibitor/competitor.</Rule>
      <Rule num="16"><Text style={s.ruleTextBold}>DOGS IN VEHICLES ON HOT DAYS:</Text> Your dog is vulnerable and AT RISK in hot weather. Please take care of your dog. If your dog is found to be at risk, forcible entry to your vehicle may be necessary without liability for any damage caused.</Rule>
      <Rule num="17">Anyone whose dog is entered at a Royal Kennel Club licensed event should take all reasonable steps to ensure the needs of their dog(s) are met and should not put a dog&apos;s health and welfare at risk by any action, default, omission or otherwise. Breach of Royal Kennel Club Regulations in this respect may be referred to the Board for disciplinary action under the Royal Kennel Club Rules and Regulations. The use of pinch collars, electronic shock collars, or prong collars, is not permitted at any show licensed by the Royal Kennel Club. This shall apply at the venue or within the precincts of the show.</Rule>
      <Text style={s.ruleText}>
        <Text style={s.ruleNumber}>18.</Text>{' '}
        <Text style={s.ruleTextBold}>Not for Competition:</Text>{' '}
        {nfcScheduleRule(sd?.acceptsNfc !== false)}
      </Text>
      <Rule num="19">No modifications will be made to the schedule except by permission of the Board of the Royal Kennel Club, which will be followed by advertisement in the Canine press wherever possible.</Rule>
      <Rule num="20">An exhibitor or competitor should ensure that contact details for any handler are available and must be provided upon request in any investigation of a breach of this regulation by such handler.</Rule>

      <View style={{ marginTop: 6, paddingTop: 4, borderTopWidth: 0.5, borderTopColor: C.ruleLight }} wrap={false}>
        <Text style={{ fontFamily: 'Inter', fontSize: 7, color: C.textMedium, lineHeight: 1.4 }}>
          The following paragraphs of the RKC Show F(1) Regulations are applicable to this show and exhibitors should familiarise themselves with these before entering: F(1).8.a, F(1).8.l, F(1).8.m, F(1).13, F(1).18 and F(B) Preparation of Dogs for Exhibition.
        </Text>
      </View>
    </>
  );
}
