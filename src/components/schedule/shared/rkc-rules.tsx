import React from 'react';
import { Text, View } from '@react-pdf/renderer';
import { formatCurrency } from '@/lib/date-utils';
import { getRkcScheduleProfile } from '@/lib/rkc-schedule-profile';
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

function BestPuppyRule({ multiBreed, groupSystem }: { multiBreed: boolean; groupSystem: boolean }) {
  if (!multiBreed) {
    return (
      <Text style={s.ruleText}>
        <Text style={s.ruleNumber}>10.</Text>{' '}
        <Text style={s.ruleTextBold}>Best Puppy in Show:</Text>{' '}
        Where a Best Puppy in Show competition is scheduled the Best Puppy in Show is a puppy which has competed and is unbeaten by any other puppy exhibited at the show. A puppy is a dog of six and not exceeding twelve calendar months of age on the first day of the show.
        {'\n'}A Baby Puppy is a dog of four and less than six calendar months of age on the first day of the show. Baby Puppy classes may be scheduled at any breed Club show. Best Baby Puppy in Breed may be declared from the dogs entered in the Baby Puppy class. There must be no progression to further competitions.
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
  });

  return (
    <>
      <View style={{ marginBottom: 10, paddingHorizontal: 2 }} wrap={false}>
        <Text style={{ fontFamily: 'Times', fontStyle: 'italic', fontSize: 8, lineHeight: 1.4, color: C.textMedium }}>
          All Judges at this show agree to abide by the following statement: &ldquo;In assessing dogs, judges must penalise any features or exaggerations which they consider would be detrimental to the soundness, health and well being of the dog.&rdquo;
        </Text>
      </View>

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
      <BestPuppyRule multiBreed={multiBreed} groupSystem={profile.isGroupSystem} />
      <BestInShowRule multiBreed={multiBreed} groupSystem={profile.isGroupSystem} />
      {sd?.hasBestVeteranInShow && (
        <Text style={s.ruleText}>
          <Text style={s.ruleTextBold}>Best Veteran in Show:</Text>{' '}
          {sd.bestVeteranInShowEligibility?.trim() || 'Eligible dogs are those declared Best Veteran in their breed, or Best Veteran of Sex where applicable.'}
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
        {sd?.acceptsNfc === false
          ? 'Not for Competition entries will not be accepted.'
          : 'Not for Competition entries will be accepted. Details of each dog so entered must be recorded on the entry form and must be Royal Kennel Club registered. Dogs must be at least 12 weeks of age on the first day of the show.'}
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
