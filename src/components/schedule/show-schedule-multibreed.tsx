import { Document, Page, Text, View, Image, Link } from '@react-pdf/renderer';
import { formatCurrency } from '@/lib/date-utils';
import { lookupRkcDefinition, RKC_NFC_DEFINITION } from '@/lib/rkc-class-definitions';
import React from 'react';
import type {
  ScheduleShowInfo,
  ScheduleClass,
  ScheduleJudge,
  ScheduleSponsor,
  SchedulePanelJudge,
} from './shared/types';
import {
  C,
  formatVenue,
  formatDate,
  formatShortDate,
  formatTime,
  getEstimationDate,
  getDockingStatement,
  s,
} from './shared/styles';
import { SectionBand, InfoCard, ImportantShowNotices, GoldRule, Rule, TwoColSectionHeader } from './shared/elements';
import { sortOfficers } from './shared/officers';
import { buildEntryFeeGroups } from './shared/entry-fee-groups';
import { AdvertPage, selectAdverts } from './shared/advert-page';
import { RkcJudgesWelfareCommitment, RkcNumberedRules, RkcPostalEntryInstructions } from './shared/rkc-rules';
import type { ScheduleAdvert } from './shared/types';
import { getRkcScheduleProfile } from '@/lib/rkc-schedule-profile';
import { isRkcJudgesWelfareStatement } from '@/lib/rkc-statements';

// ── Main Component ─────────────────────────────────────────────────────────────
//
// Multi-breed schedule renderer — covers general championship, group
// championship, multi-breed open (group system), and multi-breed open (not
// group system) shows. Sibling component to ShowSchedule (single-breed).
// Both share types, palette, styles, and helper elements via ./shared/.
//
// The dispatcher in route.ts / pdf-generation.ts picks this component when
// show.showScope is 'general' or 'group'.

export function ShowScheduleMultibreed({
  show,
  classes,
  judges,
  sponsors = [],
  adverts = [],
  panelJudges = [],
}: {
  show: ScheduleShowInfo;
  classes: ScheduleClass[];
  judges: ScheduleJudge[];
  sponsors?: ScheduleSponsor[];
  adverts?: ScheduleAdvert[];
  /** Group-level + show-level judge assignments (Group Judge, Puppy Group,
   *  BIS, etc.). Drives the BIS & Group Judges panel page and the per-group
   *  judge banner above each group's classification block. Empty array when
   *  the show hasn't yet had panel-level judges assigned. */
  panelJudges?: SchedulePanelJudge[];
}) {
  const rkcProfile = getRkcScheduleProfile({
    showType: show.showType,
    showScope: show.showScope,
    judgedOnGroupSystem: show.scheduleData?.judgedOnGroupSystem,
  });
  const showDate = show.endDate && show.endDate !== show.date
    ? `${formatDate(show.date)} — ${formatDate(show.endDate)}`
    : formatDate(show.date);
  // classCount is computed after deduplication (below) for accurate display
  const sd = show.scheduleData;
  const dockingStatement = getDockingStatement(sd);
  const estimationDate = getEstimationDate(show.entryCloseDate);
  const showPageUrl = `https://remishowmanager.co.uk/shows/${show.slug}`;

  // Deduplicate Junior Handler classes — they may exist with both sex='dog' and sex='bitch'
  // in the DB from old bulk-create logic. Keep only one per classDefinitionId, treating as mixed.
  const seen = new Set<string>();
  const deduplicatedClasses = classes.reduce<ScheduleClass[]>((acc, cls) => {
    if (cls.classType === 'junior_handler') {
      // Use className as dedup key (JH classes share the same name)
      const key = `jh:${cls.className}`;
      if (seen.has(key)) return acc;
      seen.add(key);
      acc.push({ ...cls, sex: null }); // Force mixed/sex-neutral
    } else {
      acc.push(cls);
    }
    return acc;
  }, []);

  const classCount = deduplicatedClasses.length;

  // Split classes by sex for single breed two-column layout. Mixed classes
  // split further: non-JH (Veteran, etc.) render ABOVE Dog/Bitch because
  // RKC ordering requires them judged before the per-sex challenges.
  // JH-only Mixed renders BELOW as the "Junior Handling" section.
  const isGroupSystem = sd?.judgedOnGroupSystem === true;
  const footerRender = ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
    `${show.name}  ·  Schedule  ·  Page ${pageNumber} of ${totalPages}`;
  const autoStatements = new Set<string>();
  if (sd?.wetWeatherAccommodation === false) autoStatements.add('NO WET WEATHER ACCOMMODATION IS PROVIDED');
  if (!sd?.isBenched) autoStatements.add('THIS IS AN UNBENCHED SHOW \u2014 EXHIBITORS ARE RESPONSIBLE FOR ENSURING THEIR DOGS ARE AVAILABLE FOR JUDGING');
  if (sd?.outsideAttraction) autoStatements.add('PLEASE NOTE: OUTSIDE ATTRACTION \u2014 RKC REGULATION F(1) 16H WILL BE STRICTLY ENFORCED');
  const additionalScheduleStatements = (sd?.customStatements ?? []).filter((statement) => (
    !autoStatements.has(statement.toUpperCase())
    && !isRkcJudgesWelfareStatement(statement)
  ));



  return (
    <Document title={`Schedule — ${show.name}`} author="Remi Show Manager">

      {/* ════════════════════════════════════════════════════════════════════════
          COVER PAGE
          ════════════════════════════════════════════════════════════════════ */}
      <Page size="A5" style={s.coverPage}>
        {/* ── Green top band with organisation name ── */}
        {show.organisation && (
          <View style={s.coverTopBand}>
            <Text style={s.coverOrgName}>{show.organisation.name}</Text>
          </View>
        )}
        {!show.organisation && <View style={{ height: 12 }} />}

        {/* ── Main cover content ── */}
        <View style={s.coverContent}>
          {/* Logo */}
          {show.organisation?.logoUrl && (
            <Image src={show.organisation.logoUrl} style={s.coverLogo} />
          )}

          {/* Title sponsor logo — prominent, above the show name */}
          {(() => {
            const titleSponsor = sponsors.find((sp) => sp.tier === 'title' && sp.logoUrl);
            if (!titleSponsor) return null;
            return (
              <View style={{ alignItems: 'center', marginBottom: 4 }}>
                <Text style={{ fontFamily: 'Inter', fontSize: 6, color: C.textLight, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 }}>
                  {titleSponsor.customTitle ?? 'Sponsored by'}
                </Text>
                <Image src={titleSponsor.logoUrl!} style={{ maxWidth: 120, maxHeight: 40, objectFit: 'contain' }} />
              </View>
            );
          })()}

          {/* Show name */}
          <Text style={s.coverShowName}>{show.name}</Text>

          {/* Show type badge */}
          <View style={s.coverBadge}>
            <Text style={s.coverBadgeText}>{rkcProfile.title}</Text>
          </View>
          <Text style={s.coverSpecimen}>RKC specimen · {rkcProfile.specimenVersion}</Text>

          {/* Show-level sponsor logos below badge */}
          {(() => {
            const showSponsors = sponsors.filter((sp) => sp.tier === 'show' && sp.logoUrl);
            if (showSponsors.length === 0) return null;
            return (
              <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                {showSponsors.map((sp, i) => (
                  <View key={i} style={{ alignItems: 'center' }}>
                    <Image src={sp.logoUrl!} style={{ maxWidth: 80, maxHeight: 28, objectFit: 'contain' }} />
                    <Text style={{ fontFamily: 'Inter', fontSize: 5.5, color: C.textLight, marginTop: 1 }}>
                      {sp.customTitle ?? sp.name}
                    </Text>
                  </View>
                ))}
              </View>
            );
          })()}

          {/* Class count */}
          <Text style={s.coverClassCount}>
            {classCount} Class{classCount !== 1 ? 'es' : ''}
          </Text>

          {/* RKC jurisdiction */}
          <Text style={s.coverRegulatory}>
            Held under Royal Kennel Club Limited Rules &amp; Regulations
          </Text>
          {sd?.judgedOnGroupSystem && (
            <Text style={s.coverRegulatory}>Judged on the Group System</Text>
          )}

          <GoldRule />

          {/* ── Key details card ── */}
          <View style={s.coverDetailCard}>
            <View style={s.coverDetailRow}>
              <Text style={s.coverDetailLabel}>Date</Text>
              <Text style={s.coverDetailValue}>{showDate}</Text>
            </View>
            {show.venue && (
              <View style={s.coverDetailRow}>
                <Text style={s.coverDetailLabel}>Venue</Text>
                <Text style={s.coverDetailValue}>
                  {formatVenue(show.venue.name, show.venue.address, show.venue.postcode)}
                </Text>
              </View>
            )}
            {judges.length > 0 && judges.map((j, i) => (
              <View key={i} style={s.coverDetailRow}>
                <Text style={s.coverDetailLabel}>{i === 0 ? (judges.length === 1 ? 'Judge' : 'Judges') : ''}</Text>
                <Text style={s.coverDetailValue}>
                  {j.displayLabel ?? j.name}
                </Text>
              </View>
            ))}
            {show.showOpenTime && (
              <View style={s.coverDetailRow}>
                <Text style={s.coverDetailLabel}>Show Opens</Text>
                <Text style={s.coverDetailValue}>{formatTime(show.showOpenTime)}</Text>
              </View>
            )}
            {show.startTime && (
              <View style={s.coverDetailRow}>
                <Text style={s.coverDetailLabel}>Judging Starts</Text>
                <Text style={s.coverDetailValue}>{formatTime(show.startTime)}</Text>
              </View>
            )}
            {sd?.latestArrivalTime && (
              <View style={s.coverDetailRow}>
                <Text style={s.coverDetailLabel}>Dogs by</Text>
                <Text style={s.coverDetailValue}>{formatTime(sd.latestArrivalTime)}</Text>
              </View>
            )}
            {show.kcLicenceNo && (
              <View style={s.coverDetailRow}>
                <Text style={s.coverDetailLabel}>Licence</Text>
                <Text style={s.coverDetailValue}>{show.kcLicenceNo}</Text>
              </View>
            )}
          </View>

          {/* ── Secretary details ── */}
          {(show.secretaryName || show.secretaryEmail) && (
            <View style={{ ...s.coverDetailCard, borderLeftColor: C.primary }}>
              <Text style={s.coverSectionLabel}>Show Secretary</Text>
              {show.secretaryName && (
                <Text style={s.coverSectionText}>{show.secretaryName}</Text>
              )}
              {show.secretaryAddress && (
                <Text style={s.coverSectionText}>{show.secretaryAddress}</Text>
              )}
              {show.secretaryPhone && (
                <Text style={s.coverSectionText}>Tel: {show.secretaryPhone}</Text>
              )}
              {show.secretaryEmail && (
                <Text style={s.coverSectionText}>{show.secretaryEmail}</Text>
              )}
            </View>
          )}

          {/* On-call vet */}
          {show.onCallVet && (
            <View style={{ width: '100%', marginBottom: 4 }}>
              <Text style={s.coverSectionLabel}>On-Call Veterinary Surgeon</Text>
              <Text style={s.coverSectionText}>{show.onCallVet}</Text>
            </View>
          )}

          {/* First Aider(s) — RKC compliance, Amanda 2026-05-14 */}
          {sd?.firstAiders && sd.firstAiders.length > 0 && (
            <View style={{ width: '100%', marginBottom: 4 }}>
              <Text style={s.coverSectionLabel}>
                {sd.firstAiders.length === 1 ? 'First Aider' : 'First Aiders'}
              </Text>
              <Text style={s.coverSectionText}>{sd.firstAiders.join(', ')}</Text>
            </View>
          )}

          {/* Show Manager */}
          {sd?.showManager && (
            <View style={{ width: '100%', marginBottom: 4 }}>
              <Text style={s.coverSectionLabel}>Show Manager</Text>
              <Text style={s.coverSectionText}>{sd.showManager}</Text>
            </View>
          )}

          <GoldRule />

          {/* Docking statement — MANDATORY on front cover per F(1)7.c(2) */}
          <Text style={s.coverDocking}>{dockingStatement}</Text>

          {/* Outside attraction notice — prominent on cover */}
          {sd?.outsideAttraction && (
            <Text style={{ fontFamily: 'Inter', fontSize: 7.5, fontWeight: 'bold', color: C.textDark, textAlign: 'center', textTransform: 'uppercase', marginTop: 6 }}>
              Please Note: Outside Attraction — RKC Regulation F(1) 16h will be strictly enforced
            </Text>
          )}

          {/* Wet weather */}
          {sd?.wetWeatherAccommodation === false && (
            <Text style={{ fontFamily: 'Inter', fontSize: 7.5, fontWeight: 'bold', color: C.textDark, textAlign: 'center', marginTop: 4 }}>
              NO WET WEATHER ACCOMMODATION IS PROVIDED
            </Text>
          )}
          {sd?.wetWeatherAccommodation === true && (
            <Text style={{ fontFamily: 'Inter', fontSize: 7, color: C.textMedium, textAlign: 'center', marginTop: 4 }}>
              Wet weather accommodation is available
            </Text>
          )}

        </View>

        {/* Green bottom band */}
        <View style={s.coverBottomBand} />
      </Page>

      {/* Inside-front-cover adverts — render right after the cover page. */}
      {selectAdverts(adverts, 'schedule', 'inside_front').map((ad) => (
        <AdvertPage key={`ad-if-${ad.id}`} advert={ad} />
      ))}

      {additionalScheduleStatements.length > 0 && (
        <Page size="A5" style={s.page}>
          <SectionBand title="Important Information" />
          <RkcJudgesWelfareCommitment />
          <ImportantShowNotices statements={additionalScheduleStatements} />
          <Text style={s.footer} render={footerRender} fixed />
        </Page>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          ENTRY INFORMATION
          ════════════════════════════════════════════════════════════════════ */}
      <Page size="A5" style={s.page}>
        <SectionBand title="Entry Information" />

        {additionalScheduleStatements.length === 0 && <RkcJudgesWelfareCommitment />}

        {/* Fees */}
        {(show.firstEntryFee != null || show.subsequentEntryFee != null || show.nfcEntryFee != null) && (
          <InfoCard title="Entry Fees">
            {show.firstEntryFee != null && (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>First entry</Text>
                <Text style={s.infoValue}>{formatCurrency(show.firstEntryFee)}</Text>
              </View>
            )}
            {show.subsequentEntryFee != null && (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Subsequent entry (same dog)</Text>
                <Text style={s.infoValue}>{formatCurrency(show.subsequentEntryFee)}</Text>
              </View>
            )}
            {show.discountGroups.map((g) => (
              <View key={g.label} style={s.infoRow}>
                <Text style={s.infoLabel}>{g.label} (first entry)</Text>
                <Text style={s.infoValue}>{formatCurrency(g.firstEntryFeePence)}</Text>
              </View>
            ))}
            {show.multiDogThreshold != null && show.multiDogPackagePence != null && (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>{show.multiDogThreshold}+ dog package</Text>
                <Text style={s.infoValue}>{formatCurrency(show.multiDogPackagePence)}</Text>
              </View>
            )}
            {show.discountGroups
              .filter((g) => g.multiDogPackagePence != null)
              .map((g) => (
                <View key={`${g.label}-pkg`} style={s.infoRow}>
                  <Text style={s.infoLabel}>{show.multiDogThreshold ?? '3'}+ dog package ({g.label})</Text>
                  <Text style={s.infoValue}>{formatCurrency(g.multiDogPackagePence!)}</Text>
                </View>
              ))}
            {show.nfcEntryFee != null && (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Not for Competition</Text>
                <Text style={s.infoValue}>{formatCurrency(show.nfcEntryFee)}</Text>
              </View>
            )}
            {show.juniorHandlerFee != null && (
              <View style={[s.infoRow, s.infoRowNoBorder]}>
                <Text style={s.infoLabel}>Junior Handler</Text>
                <Text style={s.infoValue}>{formatCurrency(show.juniorHandlerFee)}</Text>
              </View>
            )}
            {/* Per-class fee overrides — group by class definition name,
                skip Junior Handler classes (own row), collapse SAC variants. */}
            {buildEntryFeeGroups(classes, show.firstEntryFee).map(({ label, fee }) => (
              <View key={`${label}|${fee}`} style={s.infoRow}>
                <Text style={s.infoLabel}>{label}</Text>
                <Text style={s.infoValue}>{formatCurrency(fee)}</Text>
              </View>
            ))}
          </InfoCard>
        )}

        {/* Important dates */}
        <InfoCard title="Important Dates">
          {show.entriesOpenDate && (
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Entries open</Text>
              <Text style={s.infoValue}>{formatShortDate(show.entriesOpenDate)}</Text>
            </View>
          )}
          {show.entryCloseDate && (
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Online entries close</Text>
              <Text style={s.infoValue}>{formatShortDate(show.entryCloseDate)}</Text>
            </View>
          )}
          {show.postalCloseDate && (
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Postal entries close</Text>
              <Text style={s.infoValue}>{formatShortDate(show.postalCloseDate)}</Text>
            </View>
          )}
          {estimationDate && (
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Date for estimating awards won</Text>
              <Text style={s.infoValue}>{estimationDate}</Text>
            </View>
          )}
          <View style={[s.infoRow, s.infoRowNoBorder]}>
            <Text style={s.infoLabel}>Show date</Text>
            <Text style={s.infoValue}>{formatShortDate(show.date)}</Text>
          </View>
        </InfoCard>

        {/* Show timing */}
        <InfoCard title="Show Timing">
          {show.showOpenTime && (
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Time of opening</Text>
              <Text style={s.infoValue}>{formatTime(show.showOpenTime)}</Text>
            </View>
          )}
          {sd?.latestArrivalTime && (
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Latest time dogs will be received</Text>
              <Text style={s.infoValue}>{formatTime(sd.latestArrivalTime)}</Text>
            </View>
          )}
          {show.startTime && (
            <View style={[s.infoRow, s.infoRowNoBorder]}>
              <Text style={s.infoLabel}>Judging commences</Text>
              <Text style={s.infoValue}>{formatTime(show.startTime)}</Text>
            </View>
          )}
        </InfoCard>

        <Text style={s.infoText}>
          {sd?.isBenched
            ? sd.benchingRemovalTime
              ? `Benched show. ${sd.benchingRemovalTime}`
              : 'Benched show. Dogs may only be removed from benches with the permission of the Show Secretary.'
            : 'Unbenched show. Dogs may be removed after judging of their breed is complete.'}
        </Text>
        <Text style={{ ...s.infoText, marginBottom: 8 }}>
          The show closes half an hour after all judging has been completed.
        </Text>

        {/* NFC */}
        <InfoCard title="Not For Competition">
          <Text style={s.infoText}>
            {sd?.acceptsNfc !== false
              ? 'Not For Competition entries are accepted. NFC dogs must be registered with the Royal Kennel Club and aged 12 weeks or over.'
              : 'Not For Competition entries are not accepted at this show.'}
          </Text>
        </InfoCard>

        {/* Venue */}
        {show.venue && (
          <InfoCard title="Venue">
            <Text style={s.infoText}>{show.venue.name}</Text>
            {show.venue.address && <Text style={s.infoText}>{show.venue.address}</Text>}
            {show.venue.postcode && <Text style={s.infoText}>{show.venue.postcode}</Text>}
            {sd?.what3words && (
              <Text style={{ ...s.infoText, marginTop: 4 }}>what3words: ///{sd.what3words.replace(/^\/+/, '')}</Text>
            )}
          </InfoCard>
        )}

        {/* Judges */}
        {judges.length > 0 && (
          <InfoCard title="Judges">
            {judges.map((judge, i) => {
              // Prefer the API-computed role label (includes "Junior Handling",
              // "Dogs & Bitches" etc.); fall back to breed list for multi-breed shows.
              const roleLabel = judge.role
                ?? (judge.breeds.length > 0 ? judge.breeds.join(', ') : 'Breed Classes');
              const nameWithAffix = judge.affix ? `${judge.name} (${judge.affix})` : judge.name;
              return (
                <View key={i} style={s.judgeRow}>
                  <Text style={s.judgeName}>{nameWithAffix}</Text>
                  <Text style={s.judgeBreeds}>{roleLabel}</Text>
                </View>
              );
            })}
          </InfoCard>
        )}

        {/* Online entries */}
        <InfoCard title="Online Entries">
          <Text style={s.infoText}>
            Enter online at{' '}
            <Link src={showPageUrl} style={{ color: C.primary, textDecoration: 'none' }}>
              {showPageUrl}
            </Link>
          </Text>
        </InfoCard>

        {/* Awards */}
        {sd?.awardsDescription && (
          <InfoCard title="Awards">
            <Text style={s.infoText}>{sd.awardsDescription}</Text>
          </InfoCard>
        )}

        {/* Prize money */}
        {sd?.prizeMoney && (
          <InfoCard title="Prize Money">
            <Text style={s.infoText}>{sd.prizeMoney}</Text>
          </InfoCard>
        )}

          <Text style={s.footer} render={footerRender} fixed />
      </Page>

      {/* ════════════════════════════════════════════════════════════════════════
          OFFICIALS
          ════════════════════════════════════════════════════════════════════ */}
      <Page size="A5" style={s.page}>
          <SectionBand title="Officials" />

          {sd?.officers && sd.officers.length > 0 && (
            <InfoCard title="Officers &amp; Committee">
              {sortOfficers(sd.officers).map((o, i) => (
                <View key={i} style={s.officialRow}>
                  <Text style={s.officialPosition}>{o.position}</Text>
                  <Text style={s.officialName}>{o.name}</Text>
                </View>
              ))}
            </InfoCard>
          )}

          <InfoCard title="Jurisdiction and Responsibilities">
            <Text style={{ fontFamily: 'Times', fontStyle: 'italic', fontSize: 7.5, lineHeight: 1.4, color: C.textMedium }}>
              The Officers and Committee members of the society holding the licence are deemed responsible for organising and conducting the show safely and in accordance with the Rules and Regulations of the Royal Kennel Club and agree to abide by and adopt any decision of the Board or any authority to whom the Board may delegate its powers, subject to the conditions of Regulation F17. In so doing those appointed as Officers and Committee members accept that they are jointly and severally responsible for the organisation of the show and that this is a binding undertaking (vide Royal Kennel Club General Show Regulations F4 and F5).
            </Text>
          </InfoCard>

          {sd?.showManager && (
            <InfoCard title="Show Manager">
              <Text style={s.infoText}>{sd.showManager}</Text>
            </InfoCard>
          )}

          {show.onCallVet && (
            <InfoCard title="On-Call Veterinary Surgeon">
              <Text style={s.infoText}>{show.onCallVet}</Text>
            </InfoCard>
          )}

  
          <Text style={s.footer} render={footerRender} fixed />
      </Page>

      {/* ════════════════════════════════════════════════════════════════════════
          SPONSORS & ACKNOWLEDGEMENTS
          ════════════════════════════════════════════════════════════════════ */}
      {sponsors.length > 0 && (
        <Page size="A5" style={s.page}>
          <SectionBand title="Sponsors &amp; Acknowledgements" />

          <View style={{ marginBottom: 10 }}>
            <Text style={{ fontFamily: 'Times', fontStyle: 'italic', fontSize: 8, color: C.textMedium, textAlign: 'center' }}>
              The committee gratefully acknowledges the generous support of the following sponsors.
            </Text>
            <Text style={{ fontFamily: 'Times', fontStyle: 'italic', fontSize: 7, color: C.textLight, textAlign: 'center', marginTop: 2 }}>
              Their contribution helps make this show possible.
            </Text>
          </View>

          {/* ── Title & Show sponsors — featured prominently with logos ── */}
          {sponsors.filter((sp) => sp.tier === 'title' || sp.tier === 'show').map((sp, i) => (
            <View key={i} wrap={false} style={{
              backgroundColor: sp.tier === 'title' ? '#FDFAF3' : C.cardBg,
              borderWidth: 1,
              borderColor: sp.tier === 'title' ? C.accent : C.cardBorder,
              borderRadius: 6,
              padding: '10 14',
              marginBottom: 8,
              alignItems: 'center',
            }}>
              {/* Tier label */}
              <Text style={{
                fontFamily: 'Inter', fontSize: 6, fontWeight: 'bold', color: C.accent,
                letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: sp.logoUrl ? 6 : 3,
              }}>
                {sp.customTitle ?? (sp.tier === 'title' ? 'Title Sponsor' : 'Show Sponsor')}
              </Text>
              {/* Logo — large and proud */}
              {sp.logoUrl && (
                <Image src={sp.logoUrl} style={{
                  maxWidth: sp.tier === 'title' ? 160 : 120,
                  maxHeight: sp.tier === 'title' ? 50 : 36,
                  objectFit: 'contain',
                  marginBottom: 6,
                }} />
              )}
              {/* Name */}
              <Text style={{ fontFamily: 'Inter', fontWeight: 'bold', fontSize: sp.tier === 'title' ? 11 : 9.5, color: C.textDark }}>
                {sp.name}
              </Text>
              {/* Website — clickable */}
              {sp.website && (
                <Link src={sp.website.startsWith('http') ? sp.website : `https://${sp.website}`} style={{ textDecoration: 'none', marginTop: 2 }}>
                  <Text style={{ fontFamily: 'Inter', fontSize: 7, color: C.primary }}>
                    {sp.website.replace(/^https?:\/\//, '')}
                  </Text>
                </Link>
              )}
            </View>
          ))}

          {/* ── Class Sponsors & Trophies ── */}
          {sponsors.filter((sp) => sp.classSponsorships.length > 0).length > 0 && (
            <View style={{
              backgroundColor: C.cardBg, borderWidth: 1, borderColor: C.cardBorder,
              borderRadius: 6, padding: '8 12', marginBottom: 8,
            }}>
              <Text style={{
                fontFamily: 'Inter', fontSize: 6.5, fontWeight: 'bold', color: C.accent,
                letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6,
              }}>
                Class Sponsors &amp; Trophies
              </Text>
              {sponsors
                .filter((sp) => sp.classSponsorships.length > 0)
                .flatMap((sp) =>
                  sp.classSponsorships.map((cs, j) => (
                    <View key={`${sp.name}-${j}`} wrap={false} style={{
                      flexDirection: 'row', marginBottom: 4,
                      paddingBottom: 4, borderBottomWidth: 0.5, borderBottomColor: C.ruleLight,
                    }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: 'Inter', fontSize: 8, fontWeight: 'bold', color: C.textDark }}>
                          {cs.className}
                        </Text>
                        <Text style={{ fontFamily: 'Inter', fontSize: 7, color: C.textMedium, marginTop: 1 }}>
                          Sponsored by {sp.name}
                        </Text>
                      </View>
                      {(cs.trophyName || cs.prizeDescription) && (
                        <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                          {cs.trophyName && (
                            <Text style={{ fontFamily: 'Times', fontStyle: 'italic', fontSize: 7, color: C.accent }}>
                              {cs.trophyName}
                            </Text>
                          )}
                          {cs.trophyDonor && (
                            <Text style={{ fontFamily: 'Inter', fontSize: 6, color: C.textLight }}>
                              Donated by {cs.trophyDonor}
                            </Text>
                          )}
                        </View>
                      )}
                    </View>
                  ))
                )}
            </View>
          )}

          {/* ── Special Prizes ── */}
          {sponsors.filter((sp) => sp.specialPrizes).length > 0 && (
            <View style={{
              backgroundColor: C.cardBg, borderWidth: 1, borderColor: C.cardBorder,
              borderRadius: 6, padding: '8 12', marginBottom: 8,
            }}>
              <Text style={{
                fontFamily: 'Inter', fontSize: 6.5, fontWeight: 'bold', color: C.accent,
                letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6,
              }}>
                Special Prizes
              </Text>
              {sponsors
                .filter((sp) => sp.specialPrizes)
                .map((sp, i) => (
                  <View key={i} wrap={false} style={{ marginBottom: 4 }}>
                    <Text style={{ fontFamily: 'Inter', fontWeight: 'bold', fontSize: 8, color: C.textDark }}>
                      {sp.name}
                    </Text>
                    <Text style={{ fontFamily: 'Times', fontStyle: 'italic', fontSize: 7.5, color: C.textMedium, marginTop: 1 }}>
                      {sp.specialPrizes}
                    </Text>
                  </View>
                ))}
            </View>
          )}

  
          <Text style={s.footer} render={footerRender} fixed />
        </Page>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          BIS & GROUP JUDGES PANEL — only renders when panelJudges has data.
          Lays out show-level (BIS / BPIS / BVIS) above a per-group table of
          group + sub-group judges, mirroring Higham Press house style for
          general championship schedules.
          ════════════════════════════════════════════════════════════════════ */}
      {panelJudges.length > 0 && (() => {
        const groupLevel = panelJudges.filter((p) => p.isGroupLevel);
        const showLevel = panelJudges
          .filter((p) => !p.isGroupLevel)
          .sort((a, b) => a.roleSortOrder - b.roleSortOrder);

        // Distinct roles + groups, both ordered. Cell lookup keyed by (group, role).
        const roleMeta = new Map<string, { sortOrder: number; shortLabel: string }>();
        for (const e of groupLevel) {
          if (!roleMeta.has(e.roleName)) {
            roleMeta.set(e.roleName, {
              sortOrder: e.roleSortOrder,
              shortLabel: e.roleShortLabel ?? e.roleName,
            });
          }
        }
        const orderedRoles = [...roleMeta.entries()].sort(
          (a, b) => a[1].sortOrder - b[1].sortOrder,
        );

        const groupMeta = new Map<string, number>();
        for (const e of groupLevel) {
          if (e.groupName && !groupMeta.has(e.groupName)) {
            groupMeta.set(e.groupName, e.groupSortOrder ?? 999);
          }
        }
        const orderedGroups = [...groupMeta.entries()].sort((a, b) => a[1] - b[1]);

        const cell = new Map<string, string>();
        for (const e of groupLevel) {
          if (!e.groupName) continue;
          cell.set(`${e.groupName}::${e.roleName}`, e.displayLabel);
        }

        return (
          <Page size="A5" style={s.page}>
            <SectionBand title="Best in Show & Group Judges" />

            {showLevel.length > 0 && (
              <View style={{ marginBottom: 12 }}>
                {showLevel.map((e, i) => (
                  <View key={i} style={s.judgeRow}>
                    <Text style={s.judgeName}>{e.roleName}</Text>
                    <Text style={s.judgeBreeds}>{e.displayLabel}</Text>
                  </View>
                ))}
              </View>
            )}

            {orderedGroups.length > 0 && (
              <View>
                {/* minPresenceAhead: never strand this header row at the foot
                    of a page — if less than one data row's worth of space
                    follows, it moves with its content. */}
                <View
                  style={{ flexDirection: 'row', backgroundColor: C.primary, paddingVertical: 5, paddingHorizontal: 6, borderTopLeftRadius: 4, borderTopRightRadius: 4 }}
                  minPresenceAhead={20}
                >
                  <Text style={{ width: '22%', fontFamily: 'Inter', fontSize: 7, fontWeight: 'bold', color: C.textOnPrimary, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    Group
                  </Text>
                  {orderedRoles.map(([roleName, meta]) => (
                    <Text key={roleName} style={{ flex: 1, fontFamily: 'Inter', fontSize: 7, fontWeight: 'bold', color: C.textOnPrimary, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                      {meta.shortLabel}
                    </Text>
                  ))}
                </View>
                {orderedGroups.map(([groupName], gi) => (
                  <View
                    key={groupName}
                    style={[
                      { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: C.cardBorder },
                      gi % 2 !== 0 ? { backgroundColor: C.tableRowAlt } : {},
                    ]}
                    wrap={false}
                  >
                    <Text style={{ width: '22%', fontFamily: 'Inter', fontSize: 7.5, fontWeight: 'bold', color: C.textDark }}>
                      {groupName.toUpperCase()}
                    </Text>
                    {orderedRoles.map(([roleName]) => (
                      <Text
                        key={roleName}
                        style={{ flex: 1, fontFamily: 'Inter', fontSize: 7.5, color: C.textDark, paddingRight: 4 }}
                      >
                        {cell.get(`${groupName}::${roleName}`) ?? ''}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            )}

            <Text style={s.footer} render={footerRender} fixed />
          </Page>
        );
      })()}

      {/* ════════════════════════════════════════════════════════════════════════
          SCHEDULE OF CLASSES
          ════════════════════════════════════════════════════════════════════ */}
      <Page size="A5" style={s.page}>
        <SectionBand title="Schedule of Classes" />

        {/* "Alphabetical order within group — not in ring order" disclaimer.
            Per the 2026-05-07 benchmark of seven Higham Press champ schedules,
            this disclaimer is best practice (Birmingham 2025 prints it
            verbatim above the classification block) and pre-empts exhibitor
            confusion when the schedule is published before ring allocation. */}
        <Text style={{ fontFamily: 'Times', fontSize: 7.5, fontStyle: 'italic', color: C.textMedium, textAlign: 'center', marginBottom: 8 }}>
          Classification is in alphabetical order within each Group — not in ring order.
        </Text>

        {/* All-breed table: No / Class / Sex / Breed, grouped by RKC group
            (HOUND GROUP, GUNDOG GROUP, etc.) per the RKC specimen layout.
            AVNSC / AVIBR / Variety classes that don't carry a breed-group
            association currently fall into "Variety & Other Classes" at the
            end. Phase B will let secretaries assign a Group to those classes
            so they render at the bottom of their group's breed list, matching
            Higham's house style. */}
        <View style={s.classTableHeader}>
          <View style={s.colNo}>
            <Text style={s.classTableHeaderText}>No.</Text>
          </View>
          <View style={s.colClass}>
            <Text style={s.classTableHeaderText}>Class</Text>
          </View>
          <View style={s.colSex}>
            <Text style={s.classTableHeaderText}>Sex</Text>
          </View>
          <View style={s.colBreed}>
            <Text style={s.classTableHeaderText}>Breed</Text>
          </View>
        </View>

        {(() => {
          const isSac = (c: ScheduleClass) =>
            c.classType === 'special' && c.className.startsWith('Special Award Class');
          const sacDisplayName = (c: ScheduleClass) => {
            const base = c.className.replace(/^Special Award Class\s*-\s*/, 'Special Award ');
            return c.sex == null ? `${base} Dog or Bitch` : base;
          };

          type GroupBucket = { name: string; sortOrder: number; classes: ScheduleClass[] };
          const buckets = new Map<string, GroupBucket>();
          const ungrouped: ScheduleClass[] = [];
          const sacClasses: ScheduleClass[] = [];
          const sacJudges = judges.filter((j) => j.role === 'Special Awards Classes');
          for (const cls of deduplicatedClasses) {
            // Special Award Classes go in their own section after everything else.
            if (isSac(cls)) {
              sacClasses.push(cls);
              continue;
            }
            if (cls.breedGroupName) {
              const key = cls.breedGroupName;
              if (!buckets.has(key)) {
                buckets.set(key, {
                  name: key,
                  sortOrder: cls.breedGroupSortOrder ?? 999,
                  classes: [],
                });
              }
              buckets.get(key)!.classes.push(cls);
            } else {
              ungrouped.push(cls);
            }
          }
          const orderedGroups = Array.from(buckets.values()).sort(
            (a, b) => a.sortOrder - b.sortOrder,
          );

          // Per-group judge banner: pull all group-level panel judges keyed
          // by group name, so each section heading can list the group's
          // judges underneath the band — Higham Press house style.
          const groupJudgesByGroup = new Map<string, SchedulePanelJudge[]>();
          for (const pj of panelJudges) {
            if (!pj.isGroupLevel || !pj.groupName) continue;
            const existing = groupJudgesByGroup.get(pj.groupName) ?? [];
            existing.push(pj);
            groupJudgesByGroup.set(pj.groupName, existing);
          }

          const sections: Array<{
            heading: string;
            classes: ScheduleClass[];
            judges: SchedulePanelJudge[] | null;
          }> = orderedGroups.map((g) => ({
            heading: `${g.name.toUpperCase()} GROUP`,
            classes: g.classes,
            judges: (groupJudgesByGroup.get(g.name) ?? []).sort(
              (a, b) => a.roleSortOrder - b.roleSortOrder,
            ),
          }));
          if (ungrouped.length > 0) {
            sections.push({
              heading: 'VARIETY & OTHER CLASSES',
              classes: ungrouped,
              judges: null,
            });
          }

          const renderRow = (cls: ScheduleClass, i: number) => {
            const sexLabel = cls.sex === 'dog' ? 'Dogs' : cls.sex === 'bitch' ? 'Bitches' : 'Mixed';
            return (
              <View key={`${cls.classLabel}-${i}`} style={[s.classRow, i % 2 !== 0 ? s.classRowAlt : {}]} wrap={false}>
                <View style={s.colNo}>
                  <Text style={s.cellBold}>{cls.classLabel}</Text>
                </View>
                <View style={s.colClass}>
                  <Text style={s.cellBold}>{cls.className}</Text>
                </View>
                <View style={s.colSex}>
                  <Text style={s.cellMuted}>{sexLabel}</Text>
                </View>
                <View style={s.colBreed}>
                  <Text style={s.cell}>{cls.breedName ?? ''}</Text>
                </View>
              </View>
            );
          };

          const renderCcNotices = (sectionClasses: ScheduleClass[]) => {
            if (show.showType !== 'championship') return null;
            const ccBreeds = Array.from(new Set(
              sectionClasses
                .filter((item) => item.ccOffered && item.breedName)
                .map((item) => item.breedName!),
            )).sort((a, b) => a.localeCompare(b));
            if (ccBreeds.length === 0) return null;
            return (
              <View style={{ paddingVertical: 4, paddingHorizontal: 8, backgroundColor: C.cardBg, borderBottomWidth: 0.5, borderBottomColor: C.cardBorder }}>
                {ccBreeds.map((breedName) => (
                  <Text key={breedName} style={{ fontFamily: 'Inter', fontSize: 7, fontWeight: 'bold', color: C.primary, marginVertical: 0.5 }}>
                    {breedName} — CHALLENGE CERTIFICATES OFFERED: DOG AND BITCH
                  </Text>
                ))}
              </View>
            );
          };

          const sacSection = sacClasses.length > 0 ? (
            <View key="sac-section" wrap={false} style={{ marginTop: 12 }}>
              <TwoColSectionHeader title="SPECIAL AWARD CLASSES" />
              {sacJudges.length > 0 && (
                <View
                  style={{
                    paddingVertical: 4,
                    paddingHorizontal: 8,
                    backgroundColor: C.cardBg,
                    borderBottomWidth: 0.5,
                    borderBottomColor: C.cardBorder,
                  }}
                  wrap={false}
                >
                  {sacJudges.map((j, ji) => {
                    const namePart = j.affix ? `${j.name} (${j.affix})` : j.name;
                    return (
                      <Text key={ji} style={{ fontFamily: 'Inter', fontSize: 7.5, color: C.textDark, marginVertical: 0.5 }}>
                        <Text style={{ fontWeight: 'bold', color: C.primary }}>Judge:</Text> {namePart}
                      </Text>
                    );
                  })}
                </View>
              )}
              {sacClasses.map((cls, i) => (
                <View key={`sac-${i}`} style={[s.classRow, i % 2 !== 0 ? s.classRowAlt : {}]} wrap={false}>
                  <View style={s.colNo}><Text style={s.cellBold}>{cls.classLabel}</Text></View>
                  <View style={s.colClass}><Text style={s.cellBold}>{sacDisplayName(cls)}</Text></View>
                  <View style={s.colSex}><Text style={s.cellMuted}>Mixed</Text></View>
                  <View style={s.colBreed}><Text style={s.cell}>{cls.breedName ?? ''}</Text></View>
                </View>
              ))}
              <Text style={{ fontFamily: 'Times', fontStyle: 'italic', fontSize: 7.5, lineHeight: 1.4, color: C.textMedium, marginTop: 6, paddingHorizontal: 8 }}>
                Special Awards are scheduled by kind permission of the Royal Kennel Club to enable aspiring judges to gain more experience. Exhibits beaten in Special Awards but unbeaten in the main show classes are deemed to remain unbeaten when competing for Best in Show in the main show. Entries must be made on the entry form in the usual way.
              </Text>
            </View>
          ) : null;

          // Single-group multi-breed shows (e.g. a tiny group champ within
          // one RKC group) skip the heading band to avoid visual noise.
          if (sections.length === 1 && ungrouped.length === 0) {
            return (
              <>
                {renderCcNotices(sections[0].classes)}
                {sections[0].classes.map(renderRow)}
                {sacSection}
              </>
            );
          }

          return (
            <>
              {sections.map((section, si) => (
                <View key={`section-${si}`}>
                  <TwoColSectionHeader title={section.heading} />
                  {section.judges && section.judges.length > 0 && (
                    <View
                      style={{
                        paddingVertical: 4,
                        paddingHorizontal: 8,
                        backgroundColor: C.cardBg,
                        borderBottomWidth: 0.5,
                        borderBottomColor: C.cardBorder,
                      }}
                      wrap={false}
                    >
                      {section.judges.map((j, ji) => (
                        <Text
                          key={ji}
                          style={{ fontFamily: 'Inter', fontSize: 7.5, color: C.textDark, marginVertical: 0.5 }}
                        >
                          <Text style={{ fontWeight: 'bold', color: C.primary }}>
                            {j.roleShortLabel ?? j.roleName}:
                          </Text>{' '}
                          {j.displayLabel}
                        </Text>
                      ))}
                    </View>
                  )}
                  {renderCcNotices(section.classes)}
                  {section.classes.map((cls, i) => renderRow(cls, i))}
                </View>
              ))}
              {sacSection}
            </>
          );
        })()}

        <Text style={s.footer} render={footerRender} fixed />
      </Page>

      {/* ════════════════════════════════════════════════════════════════════════
          DEFINITIONS OF CLASSES
          ════════════════════════════════════════════════════════════════════ */}
      <Page size="A5" style={s.page}>
        <SectionBand title="Definitions of Classes" />

        <Text style={{ ...s.infoText, fontSize: 7.5, color: C.textMedium, marginBottom: 4 }}>
          In the following definitions, a Challenge Certificate includes any Show award that counts towards the title of Champion under the Rules of any governing body recognised by The Royal Kennel Club.
        </Text>
        <Text style={{ ...s.infoText, fontSize: 7.5, color: C.textMedium, marginBottom: 4 }}>
          Wins at Championship Shows in breed classes where Challenge Certificates are not on offer shall be counted as wins at Open Shows.
        </Text>
        <Text style={{ ...s.infoText, fontSize: 7.5, color: C.textMedium, marginBottom: 4 }}>
          In the case of a dog owned in partnership and entered in Members&apos; classes or competing for Members&apos; Specials each partner must at the time of entry be a member of the Society.
        </Text>
        <Text style={{ ...s.infoText, fontSize: 7.5, color: C.textMedium, marginBottom: 4 }}>
          In estimating the number of awards won, all wins up to and including the seventh day before the first closing date shall be counted when entering for any class{estimationDate ? ` i.e. ${estimationDate}.` : '.'}
        </Text>
        <Text style={{ ...s.infoText, fontSize: 7.5, color: C.textMedium, marginBottom: 4 }}>
          Wins in Variety classes do not count for entry in Breed classes but when entering in Variety classes, wins in both Breed and Variety classes must be counted. First prizes awarded in any classes defined as Special do not count towards eligibility.
        </Text>

        {/* Withdrawal and Transfer */}
        <Text style={{ ...s.infoText, fontSize: 7.5, color: C.textMedium, marginBottom: 2 }}>
          If an exhibitor reports before the judging of a class or classes that a dog has been entered which is ineligible, the exhibitor may choose one of the following options:-
        </Text>
        <Text style={{ ...s.infoText, fontSize: 7.5, color: C.textMedium, marginBottom: 2 }}>
          (1) <Text style={{ fontWeight: 'bold' }}>Withdrawal</Text> - The dog may be withdrawn from competition subject to the conditions of Regulation F.(1).19.
        </Text>
        <Text style={{ ...s.infoText, fontSize: 7.5, color: C.textMedium, marginBottom: 2 }}>
          (2) <Text style={{ fontWeight: 'bold' }}>Transfer a)</Text> If a dog is ineligible for a class or classes as regards its breed, colour, sex, weight or height the Show Secretary shall transfer it to the equivalent class or classes for the correct breed, colour, sex, weight or height or, in the event of there being no equivalent class, Minor Puppy and Puppy excepted, to the Open class for the correct breed, colour, sex, weight or height.
        </Text>
        <Text style={{ ...s.infoText, fontSize: 7.5, color: C.textMedium, marginBottom: 2 }}>
          <Text style={{ fontWeight: 'bold' }}>b)</Text> For an exhibit entered incorrectly in a Minor Puppy class, Puppy class or Junior Class, which is over age but under twelve calendar months of age, eighteen calendar months of age or twenty-four calendar months of age respectively, the Show Secretary shall transfer the exhibit to the Puppy Class, Junior Class or Yearling Class respectively for the correct breed, colour, sex, weight or height and in the event of there being no Puppy, Junior or Yearling Class to the Open class for the correct breed, colour, sex, weight or height.
        </Text>
        <Text style={{ ...s.infoText, fontSize: 7.5, color: C.textMedium, marginBottom: 2 }}>
          <Text style={{ fontWeight: 'bold' }}>c)</Text> For any reason other than the above, the Show Secretary shall transfer it to the Open class for the correct breed, colour, sex, weight or height.
        </Text>
        <Text style={{ ...s.infoText, fontSize: 7.5, color: C.textMedium, marginBottom: 6 }}>
          <Text style={{ fontWeight: 'bold' }}>d)</Text> If an exhibit arrives late and misses a class, even if it is the only class in which the dog is entered, the dog may not be transferred to any other class.
        </Text>

        {/* Class definitions — driven by classes actually scheduled.
            RKC F(1) requires every scheduled class to be defined. Lookup
            falls back to the DB description for non-RKC (Special) classes. */}
        {(() => {
          type Def = { label: string; sortOrder: number; text: string };
          const seen = new Map<string, Def>();
          for (const cls of deduplicatedClasses) {
            const rkc = lookupRkcDefinition(cls.className);
            if (rkc) {
              if (!seen.has(rkc.label)) seen.set(rkc.label, rkc);
              continue;
            }
            // Non-RKC class (e.g. "Special Long Coat Open") — use DB description
            // if present, otherwise label-only.
            const label = cls.className.toUpperCase();
            if (!seen.has(label)) {
              seen.set(label, {
                label,
                sortOrder: 500,
                text: cls.classDescription ?? '',
              });
            }
          }
          if (sd?.acceptsNfc !== false) {
            seen.set(RKC_NFC_DEFINITION.label, RKC_NFC_DEFINITION);
          }
          const defs = Array.from(seen.values()).sort((a, b) => a.sortOrder - b.sortOrder);
          return defs.map((d, i) => (
            <View key={i} style={s.defBlock} wrap={false}>
              <Text style={s.defName}>{d.label}:</Text>
              {d.text && <Text style={s.defDescription}>{d.text}</Text>}
            </View>
          ));
        })()}


          <Text style={s.footer} render={footerRender} fixed />
      </Page>

      {/* ════════════════════════════════════════════════════════════════════════
          RULES AND REGULATIONS
          ════════════════════════════════════════════════════════════════════ */}
      <Page size="A5" style={s.page}>
        <SectionBand title="Rules and Regulations" />

        <RkcNumberedRules show={show} multiBreed />



          <Text style={s.footer} render={footerRender} fixed />
      </Page>

      {/* ════════════════════════════════════════════════════════════════════════
          ADDITIONAL RULES AND REGULATIONS          ════════════════════════════════════════════════════════════════════ */}
      {<Page size="A5" style={s.page}>
        <SectionBand title="Additional Rules" />

        <Rule num="i">Should any judge be prevented from fulfilling their engagement, the Committee reserves to themselves the right of appointing other judges to fulfil their duties. Exhibitors are at liberty to withdraw from competition but no entry fees can be refunded.</Rule>
        <Rule num="ii">Any owner, competitor or other person in charge of a dog is required to remove as soon as possible any fouling caused by their dog(s) at any Royal Kennel Club licensed venue and within the environs of that event including car and caravan parks and approaches. Adequate receptacles for the disposal of such fouling will be provided.</Rule>
        <Rule num="iii">The Committee will do its utmost to ensure the safety of the dogs brought for exhibition but it must be clearly understood by exhibitors and all other persons at the Show that the Committee will not be responsible for the loss or damage to any dogs or property, or personal injury whether arising from accident or any other cause whatsoever.</Rule>
        <Rule num="iv">An announcement prior to the date of closing of entries in Our Dogs of any alteration of addition made by the Committee to the schedule or in these Regulation shall be sufficient notice thereof.</Rule>
        <Rule num="v">All children must be kept under control and parents will be held responsible for any damage caused and charges incurred.</Rule>
        <Rule num="vi">Please do not obstruct gangways with cages, pens, grooming tables, trolleys and dogs. Storage space will be made available for trolleys/cages.</Rule>
        <Rule num="vii">The Committee are empowered to exclude any dog which is not in the opinion of the Show Secretary, Show Manager, or Judge in a fit state for exhibition owing to disease, savage disposition, or any other cause. If such an exclusion takes place before or after judging the entrance fee will be forfeited.</Rule>
        <Rule num="viii">No animal other than an exhibit duly entered at the show will be allowed within the precincts of the show during its continuance.</Rule>
        <Rule num="ix">The owner, exhibitor, handler or other person in charge of a dog at a Royal Kennel Club licensed event must at all times ensure that the dog is kept under proper control whilst at the licensed venue, including its environs, car and caravan parks and approaches. This regulation applies before (at any time during the set up period at the venue), during the event and afterwards (at any time during the breakdown of the event).</Rule>
        <Rule num="x">A dog may be disqualified by the Board from any award, whether an objection has been lodged or not, if proved amongst other things to have been a) registered or recorded as having been bred by the scheduled judge, this shall not apply to a judge appointed in an emergency; b) exhibited without payment of the appropriate entry fees.</Rule>
        <Rule num="xi">Every exhibitor shall ensure that whilst the dog is being exhibited, its handler shall display the correct ring number.</Rule>

        {/* Dog welfare */}
        <View style={s.warningBox} wrap={false}>
          <Text style={s.warningTitle}>YOUR DOG&apos;S WELFARE</Text>
          <Text style={s.warningText}>
            Your dog is vulnerable and at risk during hot weather and the Royal Kennel Club offers the following guidance to help you guide your dog(s) through the do&apos;s and don&apos;ts of travelling to and whilst at a RKC licensed event.
          </Text>
          <Text style={{ ...s.warningText, marginTop: 3 }}>
            {'\u2022'} When travelling to a show please take a moment to consider whether the route to the show is on a busy motorway route, and leave earlier to avoid increased time in traffic.{'\n'}
            {'\u2022'} If your vehicle is not air-conditioned seriously consider whether travelling to the show is a good idea at all.{'\n'}
            {'\u2022'} The vehicle should be as fully ventilated as possible, and plenty of stops should be taken, with water available to drink.{'\n'}
            {'\u2022'} Ensure your dog is not sitting in full sunlight. There should be plenty of free flowing air around the dog.{'\n'}
            {'\u2022'} When at the Show, never leave your dog in the vehicle.{'\n'}
            {'\u2022'} Keep the dog in the shade — take your own shade for example and always have plenty of water available to drink so your dogs stay well hydrated.{'\n'}
            {'\u2022'} Avoid your dog taking part in unnecessary exercise or from standing in exposed sunlight for extended lengths of time.{'\n'}
            {'\u2022'} Remember, if you feel hot your dog is very likely to feel much hotter and dehydrated, and this could lead to dire results. Please look after your dog&apos;s welfare.
          </Text>
        </View>


          <Text style={s.footer} render={footerRender} fixed />
      </Page>}

      {/* ════════════════════════════════════════════════════════════════════════
          REGULATIONS FOR PREPARATION F(B)          ════════════════════════════════════════════════════════════════════ */}
      {<Page size="A5" style={s.page}>
        <SectionBand title="Regulations for Preparation F(B)" />

        <Text style={s.ruleText}>
          <Text style={s.ruleNumber}>1.</Text> These Regulations must be observed when a dog is prepared for exhibition for any Royal Kennel Club Licensed event.{'\n'}
          Objections may be referred to the Board for disciplinary action under these Show Regulations and/or for disciplinary action under Royal Kennel Club Rule A11.
        </Text>
        <Text style={{ ...s.ruleText, marginLeft: 12 }}>
          a) A dog found to have been in breach of these Regulations will automatically be disqualified from exhibition at the show and from any award thereat.
        </Text>
        <Text style={{ ...s.ruleText, marginLeft: 12 }}>
          b) Unless the exhibitor provides a satisfactory explanation for the dog being exhibited in breach of these Regulations then he/she may be subject to further penalties of either a fine or as listed under Rule A11.
        </Text>
        <Rule num="2">(a) No substance which alters the natural colour, texture or body of the coat may be present in the DOG&apos;s coat for any purpose at any time during the show. No substance which alters the natural colour of any external part of the dog may be present on the dog for any purpose at any time during the show. (b) Any other substance (other than water) which may be used in preparation of the dog for exhibition must not be allowed to remain in the coat or on any other part of the dog at the time of exhibition.</Rule>
        <Rule num="3">No act or operation which alters the natural conformation of a dog or any part thereof may be performed except:- (a) Operations certified to the satisfaction of the Board. (b) The removal of dew-claws of any breed. (c) Operations to prevent breeding provided that such operations are notified to the Royal Kennel Club before neutered dogs are shown. Nor must anything be done calculated in the opinion of the General Committee to deceive.</Rule>
        <Rule num="4">The Board without previous notice may order an examination of any dog or dogs at any Show. Any examination thus ordered will be made by a person having executive authority who shall have a written directive from the Royal Kennel Club in their possession. Samples may be taken for further examination and analysis.</Rule>
        <Rule num="5">An individual has the right to lodge an objection to a dog if he/she is the owner or handler of a dog competing in the same breed or class. An objection may however, be lodged by an official of the Show or by anyone so deputed by the Royal Kennel Club. It will be the responsibility of the individual who lodges the objection or the official (as appropriate) to substantiate the grounds for the objection. The Royal Kennel Club will substantiate the grounds for an objection made on its behalf.</Rule>
        <Rule num="6">Any objection by an individual related to an infringement of these regulations must be made in writing to the Show Secretary or his/her office before the close of the Show and the individual must produce evidence of identity at the time of lodging the complaint.</Rule>
        <Rule num="7">The chalking, powdering or spraying (with the exception of water) of exhibits within the precincts of the show is prohibited.</Rule>


          <Text style={s.footer} render={footerRender} fixed />
      </Page>}

      {/* ════════════════════════════════════════════════════════════════════════
          ADVISED NOTICES (RKC Annex A) — Electrical Equipment + Security
          ════════════════════════════════════════════════════════════════════ */}
      <Page size="A5" style={s.page}>
        <SectionBand title="Notices to Exhibitors" />

        <View style={{ marginBottom: 14 }} wrap={false}>
          <Text style={{ fontFamily: 'Inter', fontSize: 9, fontWeight: 'bold', color: C.primary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Use of Electrical Equipment at Shows
          </Text>
          <Text style={{ ...s.infoText, marginBottom: 3 }}>
            The Royal Kennel Club is becoming increasingly concerned at the amount of electrical equipment being used by exhibitors at shows, including hair dryers, hair straighteners and other grooming devices.
          </Text>
          <Text style={{ ...s.infoText, marginBottom: 3 }}>
            Electrical equipment should not be brought to shows unless absolutely necessary. In rare instances where it might be required, it should be PAT tested and permission sought from the secretary of the show before it is used.
          </Text>
          <Text style={s.infoText}>
            The Royal Kennel Club has also been informed of recent instances of exhibitors commandeering certain areas of a venue in order to have access to power points so as to use electrical grooming equipment. This is totally unacceptable and particularly unfair on the breeds whose allocated areas have been cramped because of this selfish behaviour.
          </Text>
        </View>

        <View wrap={false}>
          <Text style={{ fontFamily: 'Inter', fontSize: 9, fontWeight: 'bold', color: C.primary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Security at Shows
          </Text>
          <Text style={{ ...s.infoText, marginBottom: 3 }}>
            In light of recent events the Royal Kennel Club would like to issue a reminder to all Societies of the importance of security at dog shows.
          </Text>
          <Text style={{ ...s.infoText, marginBottom: 3 }}>
            The Royal Kennel Club understands that due to the nature of dog shows and the quantity of paraphernalia exhibitors bring it would be extremely difficult for show organisers to take on the issue of security alone, therefore we would reiterate the advice being given by the Police and security services, that everyone in the UK should remain vigilant and this applies to those organising and taking part in dog shows.
          </Text>
          <Text style={{ ...s.infoText, marginBottom: 3 }}>
            The importance of exhibitors feeling that they and their dogs are safe when attending a show cannot be underestimated. We would therefore remind you of the importance of the need for show organisers and exhibitors to remain mindful of potential dangers and that all visitors generally need to be vigilant and alert.
          </Text>
          <Text style={s.infoText}>
            Furthermore the society should provide robust notification informing exhibitors of where to report to should they see anything suspicious or of concern, and of the evacuation procedures in place.
          </Text>
        </View>


          <Text style={s.footer} render={footerRender} fixed />
      </Page>

      {/* ════════════════════════════════════════════════════════════════════════
          ADDITIONAL INFORMATION (optional)
          ════════════════════════════════════════════════════════════════════ */}
      {(sd?.directions || sd?.catering || sd?.futureShowDates || sd?.additionalNotes) && (
        <Page size="A5" style={s.page}>
          <SectionBand title="Additional Information" />

          {sd?.directions && (
            <InfoCard title="Directions to Venue">
              <Text style={s.infoText}>{sd.directions}</Text>
            </InfoCard>
          )}

          {sd?.catering && (
            <InfoCard title="Catering">
              <Text style={s.infoText}>{sd.catering}</Text>
            </InfoCard>
          )}

          {sd?.futureShowDates && (
            <InfoCard title="Future Show Dates">
              <Text style={s.infoText}>{sd.futureShowDates}</Text>
            </InfoCard>
          )}

          {sd?.additionalNotes && (
            <InfoCard title="Notes">
              <Text style={s.infoText}>{sd.additionalNotes}</Text>
            </InfoCard>
          )}

  
          <Text style={s.footer} render={footerRender} fixed />
        </Page>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          ENTRY FORM (postal entries only)
          ════════════════════════════════════════════════════════════════════ */}
      {show.acceptsPostalEntries && (
        <Page size="A5" style={s.page}>
          <SectionBand title="Entry Form" />
          <View style={{ backgroundColor: C.cardBg, borderRadius: 10, padding: 10, marginBottom: 8, borderLeftWidth: 4, borderLeftColor: C.accent }} wrap={false}>
            <Text style={{ fontFamily: 'HankenGrotesk', fontSize: 10, fontWeight: 'bold', color: C.primary, textAlign: 'center', marginBottom: 4 }}>
              ENTRY FORM FOR {show.name.toUpperCase()}
            </Text>
            <Text style={{ fontFamily: 'Inter', fontSize: 6.5, color: C.textMedium, textAlign: 'center', marginBottom: 3 }}>
              {rkcProfile.title} · Held under Royal Kennel Club Limited Rules &amp; Regulations
            </Text>
            <Text style={{ fontFamily: 'Inter', fontSize: 7, color: C.textDark }}>
              Entries close: {show.postalCloseDate ? formatShortDate(show.postalCloseDate) : show.entryCloseDate ? formatShortDate(show.entryCloseDate) : 'date to be confirmed'} · Entry fees: {show.firstEntryFee != null ? formatCurrency(show.firstEntryFee) + ' first entry' : 'see schedule'}{show.subsequentEntryFee != null ? ', ' + formatCurrency(show.subsequentEntryFee) + ' subsequent entries with the same dog' : ''}.
            </Text>
            <RkcPostalEntryInstructions show={show} />
          </View>

          <Text style={{ fontFamily: 'Inter', fontSize: 7, color: C.textLight, marginBottom: 8, textAlign: 'center' }}>
            Enter online at{' '}
            <Link src={showPageUrl} style={{ color: C.primary, textDecoration: 'none' }}>
              {showPageUrl}
            </Link>
            {' '}— or complete this form and post to the show secretary
          </Text>

          <Text style={{ fontFamily: 'Inter', fontSize: 8.5, fontWeight: 'bold', marginBottom: 8, color: C.primary }}>
            {show.organisation?.name} — {show.name} — {formatShortDate(show.date)}
          </Text>

          {/* Owner details */}
          <View style={s.formField}>
            <Text style={s.formLabel}>Owner(s) Name</Text>
            <View style={s.formLine} />
          </View>
          <Text style={{ fontFamily: 'Times', fontStyle: 'italic', fontSize: 6.5, color: C.textLight, marginTop: -2, marginBottom: 4 }}>
            In the case of joint registered ownership the name of every owner must be given here.
          </Text>
          <View style={s.formField}>
            <Text style={s.formLabel}>Address</Text>
            <View style={s.formLine} />
          </View>
          <View style={s.formField}>
            <Text style={s.formLabel} />
            <View style={s.formLine} />
          </View>
          <View style={s.formField}>
            <Text style={s.formLabel}>Postcode</Text>
            <View style={{ ...s.formLine, maxWidth: 90 }} />
            <Text style={{ ...s.formLabel, marginLeft: 12 }}>Tel</Text>
            <View style={s.formLine} />
          </View>
          <View style={s.formField}>
            <Text style={s.formLabel}>Email</Text>
            <View style={s.formLine} />
          </View>

          <View style={{ borderBottomWidth: 0.5, borderBottomColor: C.ruleLight, marginVertical: 6 }} />

          {/* Dog details */}
          <View style={s.formField}>
            <Text style={s.formLabel}>Registered Name</Text>
            <View style={s.formLine} />
          </View>
          <View style={s.formField}>
            <Text style={s.formLabel}>Breed</Text>
            <View style={s.formLine} />
          </View>
          <View style={s.formField}>
            <Text style={s.formLabel}>RKC Reg. No.</Text>
            <View style={{ ...s.formLine, maxWidth: 110 }} />
            <Text style={{ ...s.formLabel, marginLeft: 12 }}>Sex</Text>
            <View style={{ ...s.formLine, maxWidth: 60 }} />
          </View>
          <View style={s.formField}>
            <Text style={s.formLabel}>Date of Birth</Text>
            <View style={{ ...s.formLine, maxWidth: 90 }} />
            <Text style={{ ...s.formLabel, marginLeft: 12 }}>Colour</Text>
            <View style={s.formLine} />
          </View>
          <View style={s.formField}>
            <Text style={s.formLabel}>Sire</Text>
            <View style={s.formLine} />
          </View>
          <View style={s.formField}>
            <Text style={s.formLabel}>Dam</Text>
            <View style={s.formLine} />
          </View>
          <View style={s.formField}>
            <Text style={s.formLabel}>Breeder</Text>
            <View style={s.formLine} />
          </View>

          <View style={{ borderBottomWidth: 0.5, borderBottomColor: C.ruleLight, marginVertical: 6 }} />

          {/* Classes */}
          <Text style={{ ...s.formLabel, marginBottom: 4 }}>
            Classes Entered (write class numbers)
          </Text>
          <View style={s.formClassGrid}>
            {Array.from({ length: 10 }, (_, i) => (
              <View key={i} style={s.formClassBox}>
                <Text style={s.formClassBoxLabel}>{i + 1}</Text>
              </View>
            ))}
          </View>

          <View style={s.formField}>
            <Text style={s.formLabel}>Handler (if not owner)</Text>
            <View style={s.formLine} />
          </View>

          <View style={{ borderBottomWidth: 0.5, borderBottomColor: C.ruleLight, marginVertical: 6 }} />
          <View style={s.formField}>
            <Text style={s.formLabel}>Total Fee Enclosed</Text>
            <Text style={{ fontFamily: 'Inter', fontSize: 8.5, fontWeight: 'bold' }}>£</Text>
            <View style={{ ...s.formLine, maxWidth: 60 }} />
          </View>

          {/* Privacy / address-publication objection — RKC F(1).11.b */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, marginBottom: 6 }}>
            <View style={{ width: 10, height: 10, borderWidth: 1, borderColor: C.textDark, marginRight: 6 }} />
            <Text style={{ fontFamily: 'Times', fontSize: 6.5, color: C.textMedium, flex: 1 }}>
              Tick to object to publication of your address in the catalogue. Your dog&apos;s registered name and pedigree details will still appear.
            </Text>
          </View>

          {/* Docking statement repeat above declaration — RKC Annex A */}
          <View style={{ borderWidth: 0.5, borderColor: C.ruleLight, padding: 4, marginBottom: 6 }}>
            <Text style={{ fontFamily: 'Times', fontStyle: 'italic', fontSize: 6.5, color: C.textDark, textAlign: 'center' }}>
              {dockingStatement}
            </Text>
          </View>

          {/* Hot Days notice — RKC requires on entry form */}
          <View style={{ marginBottom: 6 }}>
            <Text style={{ fontFamily: 'Inter', fontSize: 6.5, fontWeight: 'bold', color: C.textDark, marginBottom: 1 }}>
              Your dog is vulnerable and AT RISK in hot weather
            </Text>
            <Text style={{ fontFamily: 'Times', fontSize: 6.5, lineHeight: 1.4, color: C.textMedium }}>
              Your dog is at risk if left in a vehicle in high temperatures and even on days considered slightly warm. If your dog is found to be at risk forcible entry to your vehicle may be necessary without liability for any damage caused.
            </Text>
          </View>

          {/* RKC Declaration — full specimen wording, matches online checkout */}
          <View style={s.formDeclaration}>
            <Text style={{ fontFamily: 'Inter', fontSize: 7, fontWeight: 'bold', marginBottom: 3, color: C.textDark, textAlign: 'center' }}>
              DECLARATION
            </Text>
            <Text style={{ fontFamily: 'Times', fontSize: 6.5, lineHeight: 1.5, color: C.textMedium }}>
              I/We agree to submit to and be bound by Royal Kennel Club Limited Rules &amp; Regulations in their present form or as they may be amended from time to time in relation to all canine matters with which the Royal Kennel Club is concerned and that this entry is made upon the basis that all current single or joint registered owners of this dog(s) have authorised/consented to this entry. I/We also undertake to abide by the Regulations of this Show and not to bring to the Show any dog which has contracted or been knowingly exposed to any infectious or contagious disease during the 21 days prior to the Show, or which is suffering from a visible condition which adversely affects its health or welfare or to bring any dog which has been prepared for exhibition contrary to Royal Kennel Club Regulations for the Preparation of Dogs for Exhibition F (Annex B). I/We agree without reservation that any Veterinary Surgeon operating on any of my/our dogs in such a way that the operation alters the natural conformation of the dog or part thereof may report such operations to the Royal Kennel Club. I/We declare that where any alteration has been made to the natural conformation of the dog(s) the relevant permission to show has been granted by the Royal Kennel Club. I/We further declare that I believe to the best of my knowledge that the dogs are not liable to disqualification under Royal Kennel Club Show Regulations. I/We also confirm that I/we understand the eligibility of the classes entered.
            </Text>
          </View>

          {/* Signature */}
          <View style={{ flexDirection: 'row', marginTop: 6, justifyContent: 'space-between' }}>
            <View style={{ width: '55%' }}>
              <Text style={{ fontFamily: 'Inter', fontSize: 7, fontWeight: 'bold', marginBottom: 2, color: C.textDark }}>
                Signature of Owner(s)
              </Text>
              <View style={{ borderBottomWidth: 1, borderBottomColor: C.textDark, height: 18 }} />
            </View>
            <View style={{ width: '30%' }}>
              <Text style={{ fontFamily: 'Inter', fontSize: 7, fontWeight: 'bold', marginBottom: 2, color: C.textDark }}>Date</Text>
              <View style={{ borderBottomWidth: 1, borderBottomColor: C.textDark, height: 18 }} />
            </View>
          </View>

          {/* Mandatory NOTE blocks — RKC entry form requires these */}
          <Text style={{ fontFamily: 'Times', fontStyle: 'italic', fontSize: 6.5, color: C.textMedium, marginTop: 6 }}>
            NOTE: Dogs entered in breach of Royal Kennel Club Show Regulations are liable to disqualification whether or not the owner was aware of the breach.
          </Text>
          <Text style={{ fontFamily: 'Times', fontStyle: 'italic', fontSize: 6.5, color: C.textMedium, marginTop: 2 }}>
            NOTE: Children under the age of 11 are the responsibility of, and must be accompanied at all times, by a Parent or Guardian.
          </Text>


          <Text style={s.footer} render={footerRender} fixed />
        </Page>
      )}

      {/* Inside-back-cover adverts — just before any last-page adverts. */}
      {selectAdverts(adverts, 'schedule', 'inside_back').map((ad) => (
        <AdvertPage key={`ad-ib-${ad.id}`} advert={ad} />
      ))}

      {/* Last-page adverts — final pages of the PDF. */}
      {selectAdverts(adverts, 'schedule', 'last_page').map((ad) => (
        <AdvertPage key={`ad-lp-${ad.id}`} advert={ad} />
      ))}
    </Document>
  );
}
