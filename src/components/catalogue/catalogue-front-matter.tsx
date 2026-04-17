import type { ReactNode } from 'react';
import { Page, View, Text, Image } from '@react-pdf/renderer';
import { styles, C } from './catalogue-styles';
import type { CatalogueEntry, CatalogueShowInfo, ClassSponsorshipInfo } from './catalogue-types';

const SHOW_TYPE_LABELS: Record<string, string> = {
  championship: 'Championship Show',
  premier_open: 'Premier Open Show',
  open: 'Open Show',
  limited: 'Limited Show',
  primary: 'Primary Show',
  companion: 'Companion Show',
};

function formatCoverDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatTime(timeStr: string): string {
  if (timeStr.includes(':') && !timeStr.includes(' ')) {
    const [h, m] = timeStr.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
  }
  return timeStr;
}

interface FrontMatterProps {
  show: CatalogueShowInfo;
}

// ── Reusable components (matching schedule) ─────────────────────

function GoldRule() {
  return <View style={styles.coverGoldRule} />;
}

function SectionBand({ title }: { title: string }) {
  return (
    <View style={styles.sectionBand}>
      <Text style={styles.sectionBandText}>{title}</Text>
    </View>
  );
}

function InfoCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={styles.infoCard} wrap={false}>
      {title && <Text style={styles.infoCardTitle}>{title}</Text>}
      {children}
    </View>
  );
}

export function JurisdictionBlock() {
  // NOT wrap={false}: on shows with a long Best Awards list, forcing
  // this block atomic orphaned the whole thing onto its own near-empty
  // page. Letting it wrap means the band + paragraph flow below the
  // Best Awards content and split at the natural page boundary rather
  // than wholesale. The band uses minPresenceAhead via its own View
  // so it doesn't end up alone at the bottom.
  return (
    <View style={{ width: '100%', marginTop: 14 }}>
      <View minPresenceAhead={60}>
        <SectionBand title="Jurisdiction and Responsibilities" />
      </View>
      <Text style={{ fontFamily: 'Times', fontStyle: 'italic', fontSize: 8, lineHeight: 1.35, color: C.textMedium, paddingHorizontal: 8 }}>
        The Officers and Committee members of the society holding the licence are deemed responsible for organising and conducting the show safely and in accordance with the Rules and Regulations of the Royal Kennel Club and agree to abide by and adopt any decision of the Board or any authority to whom the Board may delegate its powers, subject to the conditions of Regulation F16. In so doing those appointed as Officers and Committee members accept that they are jointly and severally responsible for the organisation of the show and that this is a binding undertaking (vide Royal Kennel Club General Show Regulations F4 and F5).
      </Text>
    </View>
  );
}

// ── Show Information Page ──────────────────────────────────────
//
// Page 2 of every full-front-matter catalogue. Renders all the schedule
// settings that secretaries fill in but that previously had nowhere to go
// in the published catalogue (backlog #85). Also hosts the welcome note,
// putting it on page 2/3 of the catalogue per backlog #91.
//
// The page only renders the sections that have data — if a society hasn't
// filled in officers, the officers section just doesn't appear. The whole
// page returns null when nothing is set, so we don't ship a blank page
// when the secretary hasn't filled anything in.

const showInfoStyles = {
  // Subsection header — green-banded box with white writing, matching the
  // page-title SectionBand style. Amanda's feedback: the page was too
  // bland with plain green text.
  sectionTitle: {
    fontFamily: 'Inter',
    fontSize: 9,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#fff',
    backgroundColor: C.primary,
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 8,
    paddingRight: 8,
    marginTop: 10,
    marginBottom: 6,
  } as const,
  bodyText: {
    fontFamily: 'Times',
    fontSize: 9,
    color: C.textDark,
    lineHeight: 1.4,
  } as const,
  officerRow: {
    flexDirection: 'row' as const,
    marginBottom: 2,
  },
  officerName: {
    fontFamily: 'Inter',
    fontSize: 9,
    color: C.textDark,
    width: '50%',
  } as const,
  officerPosition: {
    fontFamily: 'Inter',
    fontSize: 9,
    fontStyle: 'italic',
    color: C.textMedium,
    width: '50%',
  } as const,
};

/**
 * The dedicated `wetWeatherAccommodation` and `outsideAttraction` fields
 * each render their own prominent notice on the cover page. Many secretaries
 * (Amanda included) ALSO add the same text as a free-form `customStatement`,
 * which used to be the only way to express it. Result: the same notice
 * appears twice in the catalogue once we wired customStatements through.
 *
 * This filter drops any custom statement that's clearly a duplicate of one
 * of the dedicated notices, so the cover stays the single source of truth
 * for "no wet weather" and "outside attraction".
 */
function filterDuplicateRegulations(
  customStatements: string[] | undefined,
  show: { wetWeatherAccommodation?: boolean; outsideAttraction?: boolean },
): string[] {
  if (!customStatements || customStatements.length === 0) return [];
  return customStatements.filter((statement) => {
    const lower = statement.toLowerCase();
    if (show.wetWeatherAccommodation === false && lower.includes('wet weather')) {
      return false;
    }
    if (show.outsideAttraction === true && lower.includes('outside attraction')) {
      return false;
    }
    return true;
  });
}

/** Heuristic: is there anything worth rendering in Show Information? */
function showHasShowInformation(show: CatalogueShowInfo): boolean {
  if (show.welcomeNote || show.awardsDescription) return true;
  if (show.additionalNotes || show.futureShowDates) return true;
  if (show.latestArrivalTime || show.catering) return true;
  if (show.acceptsNfc || show.prizeMoney) return true;
  if (show.judgedOnGroupSystem) return true;
  if (filterDuplicateRegulations(show.customStatements, show).length > 0) return true;
  return false;
}

export function ShowInformationContent({ show }: FrontMatterProps) {
  const hasWelcome = !!show.welcomeNote;
  const hasAwardsDescription = !!show.awardsDescription;
  const hasAdditionalNotes = !!show.additionalNotes;
  const hasFutureShows = !!show.futureShowDates;
  // Regulations: every regulation EXCEPT outside attraction and the
  // no-wet-weather notice lives here (those stay as loud cover notices).
  // Dedupe custom statements that just restate the structured fields
  // — secretaries often fill in both, and duplicate rendering looks bad.
  const filteredStatements = filterDuplicateRegulations(show.customStatements, show);
  const hasCustomStatements = filteredStatements.length > 0;
  const hasGroupSystem = !!show.judgedOnGroupSystem;
  const hasRegulations = hasCustomStatements || hasGroupSystem;
  const practicalInfo: { label: string; value: string }[] = [];
  if (show.latestArrivalTime) practicalInfo.push({ label: 'Latest Arrival', value: show.latestArrivalTime });
  if (show.catering) practicalInfo.push({ label: 'Catering', value: show.catering });
  if (show.acceptsNfc) practicalInfo.push({ label: 'NFC Entries', value: 'Accepted' });
  if (show.prizeMoney) practicalInfo.push({ label: 'Prize Money', value: show.prizeMoney });
  const hasPracticalInfo = practicalInfo.length > 0;

  if (!showHasShowInformation(show)) return null;

  return (
    <>
      <SectionBand title="Show Information" />

      {hasWelcome && (
        <View wrap={false} style={{ marginBottom: 6 }}>
          <Text style={showInfoStyles.sectionTitle}>Welcome</Text>
          <Text style={{ ...showInfoStyles.bodyText, fontStyle: 'italic' }}>
            {show.welcomeNote}
          </Text>
        </View>
      )}

      {/* Officers and Guarantors are deliberately not listed by name
          here — the RKC Jurisdiction & Responsibilities paragraph on
          the particulars page covers them collectively. */}

      {hasAwardsDescription && (
        <View wrap={false} style={{ marginBottom: 6 }}>
          <Text style={showInfoStyles.sectionTitle}>Awards</Text>
          <Text style={showInfoStyles.bodyText}>{show.awardsDescription}</Text>
        </View>
      )}

      {hasPracticalInfo && (
        <View wrap={false} style={{ marginBottom: 6 }}>
          <Text style={showInfoStyles.sectionTitle}>Practical Information</Text>
          {practicalInfo.map((item, i) => (
            <View key={i} style={showInfoStyles.officerRow}>
              <Text style={showInfoStyles.officerName}>{item.label}</Text>
              <Text style={{ ...showInfoStyles.officerPosition, fontStyle: 'normal' }}>
                {item.value}
              </Text>
            </View>
          ))}
        </View>
      )}

      {hasAdditionalNotes && (
        <View wrap={false} style={{ marginBottom: 6 }}>
          <Text style={showInfoStyles.sectionTitle}>Additional Notes</Text>
          <Text style={showInfoStyles.bodyText}>{show.additionalNotes}</Text>
        </View>
      )}

      {hasFutureShows && (
        <View wrap={false} style={{ marginBottom: 6 }}>
          <Text style={showInfoStyles.sectionTitle}>Future Show Dates</Text>
          <Text style={showInfoStyles.bodyText}>{show.futureShowDates}</Text>
        </View>
      )}

      {hasRegulations && (
        <View wrap={false} style={{ marginBottom: 6 }}>
          <Text style={showInfoStyles.sectionTitle}>Regulations</Text>
          {hasGroupSystem && (
            <Text style={{ ...showInfoStyles.bodyText, fontWeight: 'bold', marginBottom: 2 }}>
              Judged on the Group System
            </Text>
          )}
          {filteredStatements.map((statement, i) => (
            <Text
              key={i}
              style={{ ...showInfoStyles.bodyText, marginBottom: 2 }}
            >
              {statement}
            </Text>
          ))}
        </View>
      )}
    </>
  );
}

/** Combined particulars + show information page. Kept separate from
 *  FrontMatterPage so catalogues that just need these two sections
 *  (without Judges / Class defs / Best awards, e.g. marked catalogue)
 *  still have a convenient wrapper. */
export function ShowInformationPage({ show }: FrontMatterProps) {
  return (
    <Page size="A5" style={styles.frontMatterPage} wrap>
      <ShowParticularsContent show={show} />
      {showHasShowInformation(show) && (
        <View style={{ marginTop: 8 }}>
          <ShowInformationContent show={show} />
        </View>
      )}
      <Text
        style={styles.footer}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}  ·  Generated by Remi`}
        fixed
      />
    </Page>
  );
}

/**
 * Consolidated front-matter Page.
 *
 * Renders every front-matter section (particulars, info, judges, class
 * definitions, best awards) inside a single <Page wrap> so they flow
 * continuously instead of each forcing a new page. Sections are
 * separated by a small vertical gap. This is the biggest whitespace
 * reducer in the catalogue: a small show with short sections that
 * previously cost 4-5 near-empty pages now packs them into 2-3 full
 * pages.
 *
 * Use this instead of calling ShowInformationPage / JudgesListPage /
 * ClassDefinitionsPage / BestAwardsPage individually.
 */
export function FrontMatterContent({ show }: FrontMatterProps) {
  const hasJudges = Object.keys(show.judgesByBreedName ?? {}).length > 0
    || (show.judgeDisplayList?.length ?? 0) > 0;
  // Section-between gap. The sectionBand style uses marginTop: -20 to
  // bleed into the page's top padding when it's first on a page; that
  // negative margin also eats ~20pt when the band appears mid-flow, so
  // the gap here has to include 20pt of compensation PLUS the visible
  // separation we actually want (~14pt). Anything below ~30 and the
  // Jurisdiction paragraph visually collides with the next band.
  const SECTION_GAP = 34;
  return (
    <>
      <ShowParticularsContent show={show} />

      {showHasShowInformation(show) && (
        <View style={{ marginTop: SECTION_GAP }} minPresenceAhead={100}>
          <ShowInformationContent show={show} />
        </View>
      )}

      {hasJudges && (
        <View style={{ marginTop: SECTION_GAP }} minPresenceAhead={140}>
          <JudgesListContent show={show} />
        </View>
      )}

      {/* Class definitions stay atomic — they're short enough (typically
          8-12 defs on one page) that fitting them on a single page is
          always preferable to a two-page split. */}
      {(show.classDefinitions?.length ?? 0) > 0 && (
        <View style={{ marginTop: SECTION_GAP }} wrap={false} minPresenceAhead={240}>
          <ClassDefinitionsContent show={show} />
        </View>
      )}

      {hasBestAwards(show) && (
        <View style={{ marginTop: SECTION_GAP }} minPresenceAhead={120}>
          <BestAwardsContent show={show} />
        </View>
      )}
    </>
  );
}

/** Standalone front-matter page wrapper. Use this when the catalogue
 *  wants front matter on its own Page; for maximum density, inline
 *  FrontMatterContent at the top of the body <Page wrap> instead. */
export function FrontMatterPage({ show }: FrontMatterProps) {
  return (
    <Page size="A5" style={styles.frontMatterPage} wrap>
      <FrontMatterContent show={show} />
      <Text
        style={styles.footer}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}  ·  Generated by Remi`}
        fixed
      />
    </Page>
  );
}

// ── Best Awards Page (backlog #94 + #95) ───────────────────────
//
// Dedicated page listing every "Best in X" award the society is giving
// out at this show, alongside who sponsors it (if anyone) and a
// write-in line so the secretary or steward can fill in the winner
// during judging.
//
// Data sources:
//   - `show.bestAwards`     — the list of award names the society
//                              configured (e.g. "Best in Show", "Best
//                              Long Coat Dog"). When absent we fall
//                              back to a sensible RKC default list.
//   - `show.awardSponsors`  — optional per-award sponsorship details
//                              (sponsor name, sponsor affix, trophy
//                              name). Joined to bestAwards by award
//                              name (case-insensitive).
//
// The page returns null when there are no awards configured AND no
// sponsors configured — single-breed shows that haven't filled in the
// awards section don't get a blank page.

const bestAwardsStyles = {
  tableHeaderRow: {
    flexDirection: 'row' as const,
    borderBottomWidth: 1.5,
    borderBottomColor: C.primary,
    paddingBottom: 4,
    marginBottom: 6,
  },
  tableRow: {
    flexDirection: 'row' as const,
    borderBottomWidth: 0.5,
    borderBottomColor: C.ruleLight,
    paddingTop: 4,
    paddingBottom: 5,
  },
  awardCol: { width: '38%', paddingRight: 6 } as const,
  trophyCol: { width: '24%', paddingRight: 6 } as const,
  sponsorCol: { width: '38%' } as const,
  headerLabel: {
    fontFamily: 'Inter',
    fontSize: 7.5,
    fontWeight: 'bold',
    color: C.textDark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  } as const,
  awardName: {
    fontFamily: 'Inter',
    fontSize: 9,
    fontWeight: 'bold',
    color: C.textDark,
    marginBottom: 2,
  } as const,
  trophyName: {
    fontFamily: 'Inter',
    fontSize: 8,
    color: C.textMedium,
  } as const,
  sponsorName: {
    fontFamily: 'Inter',
    fontSize: 8,
    color: C.textDark,
  } as const,
  sponsorAffix: {
    fontFamily: 'Inter',
    fontSize: 7,
    fontStyle: 'italic',
    color: C.textLight,
  } as const,
  winnerLine: {
    borderBottomWidth: 0.75,
    borderBottomColor: C.textLight,
    borderBottomStyle: 'dotted',
    width: '100%',
    marginTop: 2,
  } as const,
  winnerLabel: {
    fontFamily: 'Inter',
    fontSize: 6,
    color: C.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 1,
  } as const,
};

/**
 * True only if the society has opted in — either by configuring the
 * best-awards list explicitly or by adding award sponsorships. We
 * deliberately do NOT fall back to pickDefaultBestAwards here: Amanda
 * flagged that the section was appearing on catalogues for shows where
 * she hadn't added any awards, spilling blank pages for defaults the
 * club hadn't actually pledged to list.
 */
function hasBestAwards(show: CatalogueShowInfo): boolean {
  const hasExplicitAwards = (show.bestAwards?.length ?? 0) > 0;
  const hasSponsors = (show.awardSponsors?.length ?? 0) > 0;
  return hasExplicitAwards || hasSponsors;
}

export function BestAwardsContent({ show }: FrontMatterProps) {
  // Only render configured awards — no default-list fallback. If the
  // secretary didn't add any, the section shouldn't exist (see
  // hasBestAwards above for the rationale).
  const bestAwards = show.bestAwards ?? [];
  const awardSponsors = show.awardSponsors ?? [];
  if (bestAwards.length === 0 && awardSponsors.length === 0) return null;

  const normaliseAward = (s: string) => s.toLowerCase().trim();
  type Sponsor = typeof awardSponsors[number];
  const sponsorsByAward = new Map<string, Sponsor[]>();
  for (const s of awardSponsors) {
    const key = normaliseAward(s.award);
    const list = sponsorsByAward.get(key) ?? [];
    list.push(s);
    sponsorsByAward.set(key, list);
  }
  const bestAwardKeys = new Set(bestAwards.map(normaliseAward));
  const extraSponsorAwards = awardSponsors
    .filter((s) => !bestAwardKeys.has(normaliseAward(s.award)))
    .map((s) => s.award);
  const allAwards = Array.from(new Set([...bestAwards, ...extraSponsorAwards]));

  // Trophy/Sponsor columns are pure clutter when no sponsor has been
  // assigned to any award — the rows just fill with em-dashes. Amanda's
  // feedback: only render those columns when at least one award has a
  // sponsor configured. Empty state becomes a clean single-column
  // "award + winner line" list.
  const hasAnySponsor = awardSponsors.length > 0;

  return (
    <>
      <SectionBand title="Best Awards" />

      <Text
        style={{
          fontFamily: 'Times',
          fontSize: 8,
          fontStyle: 'italic',
          color: C.textMedium,
          marginBottom: 8,
        }}
      >
        Awarded at the discretion of the judges. Winners may be filled in
        ringside.
      </Text>

      {hasAnySponsor && (
        <View style={bestAwardsStyles.tableHeaderRow}>
          <Text style={{ ...bestAwardsStyles.headerLabel, ...bestAwardsStyles.awardCol }}>
            Award
          </Text>
          <Text style={{ ...bestAwardsStyles.headerLabel, ...bestAwardsStyles.trophyCol }}>
            Trophy
          </Text>
          <Text style={{ ...bestAwardsStyles.headerLabel, ...bestAwardsStyles.sponsorCol }}>
            Sponsor
          </Text>
        </View>
      )}

      {allAwards.map((award, i) => {
        const sponsors = sponsorsByAward.get(normaliseAward(award)) ?? [];
        if (!hasAnySponsor) {
          return (
            <View key={`${award}-${i}`} style={bestAwardsStyles.tableRow} wrap={false}>
              <View style={{ width: '100%' }}>
                <Text style={bestAwardsStyles.awardName}>{award}</Text>
                <View style={bestAwardsStyles.winnerLine} />
                <Text style={bestAwardsStyles.winnerLabel}>Winner</Text>
              </View>
            </View>
          );
        }
        return (
          <View key={`${award}-${i}`} style={bestAwardsStyles.tableRow} wrap={false}>
            <View style={bestAwardsStyles.awardCol}>
              <Text style={bestAwardsStyles.awardName}>{award}</Text>
              <View style={bestAwardsStyles.winnerLine} />
              <Text style={bestAwardsStyles.winnerLabel}>Winner</Text>
            </View>
            <View style={bestAwardsStyles.trophyCol}>
              {sponsors.length === 0 ? (
                <Text style={{ ...bestAwardsStyles.trophyName, color: C.textLight }}>—</Text>
              ) : (
                sponsors.map((s, idx) => (
                  <Text key={idx} style={{ ...bestAwardsStyles.trophyName, marginBottom: idx < sponsors.length - 1 ? 2 : 0 }}>
                    {s.trophyName ?? '—'}
                  </Text>
                ))
              )}
            </View>
            <View style={bestAwardsStyles.sponsorCol}>
              {sponsors.length === 0 ? (
                <Text style={{ ...bestAwardsStyles.sponsorName, color: C.textLight }}>—</Text>
              ) : (
                sponsors.map((s, idx) => (
                  <View key={idx} style={{ marginBottom: idx < sponsors.length - 1 ? 4 : 0 }}>
                    <Text style={bestAwardsStyles.sponsorName}>{s.sponsorName}</Text>
                    {s.sponsorAffix && (
                      <Text style={bestAwardsStyles.sponsorAffix}>{s.sponsorAffix}</Text>
                    )}
                  </View>
                ))
              )}
            </View>
          </View>
        );
      })}
    </>
  );
}

/** Standalone Best Awards page — delegates to BestAwardsContent. */
export function BestAwardsPage({ show }: FrontMatterProps) {
  if (!hasBestAwards(show)) return null;
  return (
    <Page size="A5" style={styles.frontMatterPage} wrap>
      <BestAwardsContent show={show} />
      <Text
        style={styles.footer}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}  ·  Generated by Remi`}
        fixed
      />
    </Page>
  );
}

// ── Cover Page ──────────────────────────────────────────────────

/** Cover page for the RKC standard catalogue — matching schedule design */
export function CoverPage({ show }: FrontMatterProps) {
  const showTypeLabel = show.showType ? SHOW_TYPE_LABELS[show.showType] : undefined;

  // Show judges on cover for single-breed OR when there's only one unique judge
  // Prefer sex-annotated display list (e.g. "Dogs — Mr A Winfrow") when available
  const judges = show.judgesByBreedName ?? {};
  const uniqueJudgeNames = [...new Set(Object.values(judges))];
  const isSingleBreed = show.showScope === 'single_breed';
  const coverJudges = (show.judgeDisplayList && show.judgeDisplayList.length > 0)
    ? show.judgeDisplayList
    : (isSingleBreed || uniqueJudgeNames.length === 1) ? uniqueJudgeNames : [];

  // Multi-day date display
  const dateDisplay = show.endDate
    ? `${formatCoverDate(show.date)} — ${formatCoverDate(show.endDate)}`
    : formatCoverDate(show.date);

  return (
    <Page size="A5" style={styles.coverPage}>
      {/* Green top band with organisation name */}
      {show.organisation && (
        <View style={styles.coverTopBand}>
          <Text style={styles.coverOrgName}>{show.organisation}</Text>
        </View>
      )}
      {!show.organisation && <View style={{ height: 12 }} />}

      {/* Main cover content */}
      <View style={styles.coverContent}>
        {/* Organisation logo */}
        {show.logoUrl && (
          <Image src={show.logoUrl} style={styles.coverLogo} />
        )}

        {/* Title sponsor logo — prominent, above the show name (matching schedule) */}
        {(() => {
          const titleSponsor = (show.showSponsors ?? []).find((sp) => sp.tier === 'title' && sp.logoUrl);
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

        {/* Show name — LibreBaskerville */}
        <Text style={styles.coverShowName}>{show.name}</Text>

        {/* Show type badge */}
        {showTypeLabel && (
          <View style={styles.coverBadge}>
            <Text style={styles.coverBadgeText}>{showTypeLabel}</Text>
          </View>
        )}

        {/* Show-level sponsor logos below badge (matching schedule) */}
        {(() => {
          const showLevelSponsors = (show.showSponsors ?? []).filter((sp) => sp.tier === 'show' && sp.logoUrl);
          if (showLevelSponsors.length === 0) return null;
          return (
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
              {showLevelSponsors.map((sp, i) => (
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
        {show.totalClasses != null && show.totalClasses > 0 && (
          <Text style={{ fontFamily: 'Inter', fontSize: 8, color: C.textMedium, marginTop: 2, marginBottom: 2 }}>
            {show.totalClasses} Class{show.totalClasses !== 1 ? 'es' : ''}
          </Text>
        )}

        {/* RKC jurisdiction */}
        <Text style={styles.coverRegulatory}>
          Held under Royal Kennel Club Rules &amp; Show Regulations F(1)
        </Text>

        {/* Product label — so exhibitors buying a printed copy on the
            day can see at a glance what the booklet is. Deliberately
            understated; Amanda wanted it present but not shouty. */}
        <Text style={{
          fontFamily: 'Inter',
          fontSize: 7.5,
          letterSpacing: 1.8,
          textTransform: 'uppercase',
          color: C.textLight,
          textAlign: 'center',
          marginTop: 2,
        }}>
          Show Catalogue
        </Text>

        <GoldRule />

        {/* Key details card with gold left border — matching schedule layout */}
        <View style={styles.coverDetailCard}>
          <View style={styles.coverDetailRow}>
            <Text style={styles.coverDetailLabel}>Date</Text>
            <Text style={styles.coverDetailValue}>{dateDisplay}</Text>
          </View>
          {show.venue && (
            <View style={styles.coverDetailRow}>
              <Text style={styles.coverDetailLabel}>Venue</Text>
              <Text style={styles.coverDetailValue}>
                {[show.venue, show.venueAddress].filter(Boolean).join(', ').replace(/,\s*,/g, ',').trim()}
              </Text>
            </View>
          )}
          {coverJudges.length > 0 && coverJudges.map((j, i) => (
            <View key={i} style={styles.coverDetailRow}>
              <Text style={styles.coverDetailLabel}>{i === 0 ? (coverJudges.length === 1 ? 'Judge' : 'Judges') : ''}</Text>
              <Text style={styles.coverDetailValue}>{j}</Text>
            </View>
          ))}
          {show.showOpenTime && (
            <View style={styles.coverDetailRow}>
              <Text style={styles.coverDetailLabel}>Show Opens</Text>
              <Text style={styles.coverDetailValue}>{formatTime(show.showOpenTime)}</Text>
            </View>
          )}
          {show.startTime && (
            <View style={styles.coverDetailRow}>
              <Text style={styles.coverDetailLabel}>Judging Starts</Text>
              <Text style={styles.coverDetailValue}>{formatTime(show.startTime)}</Text>
            </View>
          )}
          {show.kcLicenceNo && (
            <View style={styles.coverDetailRow}>
              <Text style={styles.coverDetailLabel}>Licence</Text>
              <Text style={styles.coverDetailValue}>{show.kcLicenceNo}</Text>
            </View>
          )}
        </View>

        {/* Outside attraction — mandatory RKC notice, displayed prominently */}
        {show.outsideAttraction && (
          <View style={{
            backgroundColor: '#fef2f2',
            borderWidth: 1,
            borderColor: '#dc2626',
            borderRadius: 4,
            padding: '6 10',
            marginTop: 4,
            marginBottom: 2,
          }}>
            <Text style={{
              fontFamily: 'Inter',
              fontSize: 8,
              fontWeight: 'bold',
              color: '#dc2626',
              textAlign: 'center',
              textTransform: 'uppercase',
            }}>
              Please Note: Outside Attraction — RKC Regulation F(1) 16H will be strictly enforced
            </Text>
          </View>
        )}

        {/* Cover keeps only the RKC-mandatory "loud" notices: outside
            attraction (above) and no-wet-weather (below). All other
            regulations (group system, custom statements, etc.) live on
            the Show Information page now — backlog #90. */}

        {show.wetWeatherAccommodation === false && (
          <Text style={{
            fontFamily: 'Inter',
            fontSize: 6.5,
            color: C.textMedium,
            textAlign: 'center',
            marginTop: 1,
          }}>
            No wet weather accommodation is provided
          </Text>
        )}

        {/* Secretary details — green left border (matching schedule) */}
        {(show.secretaryName || show.secretaryEmail || show.secretaryPhone) && (
          <View style={{ ...styles.coverDetailCard, borderLeftColor: C.primary, marginTop: 4 }}>
            <Text style={styles.coverSectionLabel}>Show Secretary</Text>
            {show.secretaryName && (
              <Text style={styles.coverSectionText}>{show.secretaryName}</Text>
            )}
            {show.secretaryAddress && (
              <Text style={styles.coverSectionText}>{show.secretaryAddress}</Text>
            )}
            {show.secretaryPhone && (
              <Text style={styles.coverSectionText}>Tel: {show.secretaryPhone}</Text>
            )}
            {show.secretaryEmail && (
              <Text style={styles.coverSectionText}>{show.secretaryEmail}</Text>
            )}
          </View>
        )}

        {/* On-call vet and Show Manager are the last items on the cover.
            Sponsors, docking statement and Jurisdiction & Responsibilities
            moved to ShowParticularsPage so the cover stays consistent
            across shows regardless of which optional fields are set. */}
        {show.onCallVet && (
          <View style={{ width: '100%', marginTop: 2, marginBottom: 2 }}>
            <Text style={styles.coverSectionLabel}>On-Call Veterinary Surgeon</Text>
            <Text style={styles.coverSectionText}>{show.onCallVet}</Text>
          </View>
        )}

        {show.showManager && (
          <View style={{ width: '100%', marginTop: 2, marginBottom: 2 }}>
            <Text style={styles.coverSectionLabel}>Show Manager</Text>
            <Text style={styles.coverSectionText}>{show.showManager}</Text>
          </View>
        )}

        <Text style={styles.coverFooterText}>
          Generated by Remi  ·  remishowmanager.co.uk
        </Text>
      </View>

      {/* Green bottom band */}
      <View style={styles.coverBottomBand} />
    </Page>
  );
}

// ── Show Particulars Block ──────────────────────────────────────
//
// Everything that used to trail the cover: show manager, supporter /
// show-tier sponsors, docking statement, and the RKC-mandatory
// Jurisdiction text. Rendered as a View so it can be composed inside
// the consolidated front-matter Page together with other front-matter
// sections, keeping the layout densely packed.

export function ShowParticularsContent({ show }: FrontMatterProps) {
  const sponsors = show.showSponsors ?? [];
  const tierSponsors = sponsors.filter((sp) => sp.tier === 'show');
  const supporterSponsors = sponsors.filter(
    (sp) => sp.tier !== 'title' && sp.tier !== 'show',
  );
  const hasSponsors = tierSponsors.length > 0 || supporterSponsors.length > 0;

  return (
    <>
      {/* Show Manager rendered on the CoverPage (after On-Call Vet)
          per Amanda's feedback that the cover should end with the
          show manager. Deliberately not re-rendered here. */}

      {hasSponsors && (
        <View style={{ marginBottom: 10 }}>
          {tierSponsors.length > 0 && (
            <View style={{ alignItems: 'center', marginBottom: 6 }} wrap={false}>
              <Text style={{ fontFamily: 'Inter', fontSize: 7, color: C.textLight, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>
                {tierSponsors.length === 1 ? 'Sponsored by' : 'Sponsors'}
              </Text>
              {tierSponsors.map((sp, i) => (
                <View key={i} style={{ alignItems: 'center', marginBottom: 4 }}>
                  {sp.logoUrl && (
                    <Image src={sp.logoUrl} style={{ width: 100, height: 50, objectFit: 'contain', marginBottom: 3 }} />
                  )}
                  <Text style={{ fontFamily: 'Inter', fontSize: 9, fontWeight: 'bold', color: C.textDark }}>
                    {sp.customTitle ? `${sp.customTitle}: ` : ''}{sp.name}
                  </Text>
                </View>
              ))}
            </View>
          )}
          {supporterSponsors.length > 0 && (
            <View style={{ ...styles.coverDetailCard, borderLeftColor: C.accent }}>
              <Text style={styles.coverSectionLabel}>With grateful thanks to</Text>
              {supporterSponsors.map((sp, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                  {sp.logoUrl && (
                    <Image src={sp.logoUrl} style={{ width: 30, height: 15, objectFit: 'contain', marginRight: 6 }} />
                  )}
                  <Text style={{ fontFamily: 'Inter', fontSize: 7.5, color: C.textMedium }}>
                    {sp.name}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {show.dockingStatement && (
        <Text style={{
          fontFamily: 'Times',
          fontSize: 7,
          fontStyle: 'italic',
          color: C.textMedium,
          textAlign: 'center',
          marginBottom: 8,
          paddingHorizontal: 8,
        }}>
          {show.dockingStatement}
        </Text>
      )}

      <JurisdictionBlock />
    </>
  );
}

// Legacy standalone page wrapper — kept for callers that haven't
// migrated to the consolidated FrontMatterPage yet.
export function ShowParticularsPage(props: FrontMatterProps) {
  return (
    <Page size="A5" style={styles.frontMatterPage} wrap>
      <ShowParticularsContent {...props} />

      <Text
        style={styles.footer}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}  ·  Generated by Remi`}
        fixed
      />
    </Page>
  );
}

// ── Judges List ─────────────────────────────────────────────────

/** Judges list content block — breed → judge table or single-breed
 *  card layout, depending on the show's judge data shape. Returned as
 *  a fragment so it can be composed inside a larger front-matter page
 *  or rendered standalone via JudgesListPage. */
export function JudgesListContent({ show }: FrontMatterProps) {
  const judges = show.judgesByBreedName ?? {};
  const judgeBios = show.judgeBios ?? {};
  const ringNumbers = show.judgeRingNumbers ?? {};
  const hasRings = Object.keys(ringNumbers).length > 0;
  const sortedBreeds = Object.keys(judges).sort();

  // Single-breed branch: no breed_id on the assignment, so we render
  // from judgeDisplayList with bios + photos. Earlier versions only
  // rendered the labels, so single-breed catalogues were missing all
  // the judge bios.
  if (sortedBreeds.length === 0 && show.judgeDisplayList && show.judgeDisplayList.length > 0) {
    // FORMAT CONTRACT: judgeDisplayList strings are produced by route.ts
    // and pdf-generation.ts as either `"<Role> — <Name>"` (U+2014 em-dash
    // separator) or `"<Name>"`. Parser below assumes em-dashes don't
    // appear inside RKC judge names (held in practice). If the format
    // ever changes, switch judgeDisplayList to a structured array.
    const LABEL_SEPARATOR = ' \u2014 ';
    const labelsByJudge = new Map<string, string[]>();
    for (const label of show.judgeDisplayList) {
      const sepIdx = label.indexOf(LABEL_SEPARATOR);
      const role = sepIdx >= 0 ? label.slice(0, sepIdx) : null;
      const name = sepIdx >= 0 ? label.slice(sepIdx + LABEL_SEPARATOR.length) : label;
      const list = labelsByJudge.get(name) ?? [];
      list.push(role ?? name);
      labelsByJudge.set(name, list);
    }

    const judgeEntries = Array.from(labelsByJudge.entries());

    // Render a single judge's row. Extracted so the first judge can be
    // rendered inside the wrap=false banner block (keeping banner and
    // first judge atomic, so the banner never orphans at the bottom of
    // a page) while subsequent judges render as normal flowing cards.
    const renderJudgeCard = (name: string, roles: string[], key: string | number) => {
      const bio = judgeBios[name];
      const photoUrl = show.judgePhotos?.[name];
      const roleLabel = roles.includes(name)
        ? null
        : roles.join(' & ');
      return (
        <View key={key} wrap={false} style={{ marginBottom: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {photoUrl && (
              <Image src={photoUrl} style={{ width: 44, height: 44, borderRadius: 22 }} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 'bold', color: C.textDark }}>
                {name}
              </Text>
              {roleLabel && (
                <Text style={{ fontFamily: 'Inter', fontSize: 9, fontStyle: 'italic', color: C.textMedium }}>
                  {roleLabel}
                </Text>
              )}
            </View>
          </View>
          {bio && (
            <Text style={{ ...styles.judgeBio, marginTop: 4, marginBottom: 0 }}>
              {bio}
            </Text>
          )}
        </View>
      );
    };

    return (
      <>
        {/* Band + first judge atomic. A long bio on the first judge
            still forces a page break, but the banner will never sit
            alone at the bottom of a page again. */}
        <View wrap={false}>
          <SectionBand title="List of Judges" />
          {judgeEntries.length > 0 &&
            renderJudgeCard(judgeEntries[0][0], judgeEntries[0][1], 0)}
        </View>
        {judgeEntries.slice(1).map(([name, roles], i) =>
          renderJudgeCard(name, roles, i + 1)
        )}
      </>
    );
  }

  if (sortedBreeds.length === 0) return null;

  // Names already rendered in the breed table. Used to avoid
  // double-rendering when we list "other" judges below.
  const breedKeyedJudgeNames = new Set(Object.values(judges));

  // Judges with a bio/photo/display-list entry who are NOT assigned to
  // a specific breed — e.g. JH judges, or dog/bitch-only judges on a
  // single-breed show. Amanda flagged in testing (msg 863) that these
  // weren't appearing at all because the breed table skipped them.
  const otherJudges: Array<{ name: string; roles: string[] }> = [];
  if (show.judgeDisplayList && show.judgeDisplayList.length > 0) {
    const LABEL_SEPARATOR = ' \u2014 '; // " — " with explicit em-dash
    const rolesByJudge = new Map<string, string[]>();
    for (const label of show.judgeDisplayList) {
      const sepIdx = label.indexOf(LABEL_SEPARATOR);
      const role = sepIdx >= 0 ? label.slice(0, sepIdx) : null;
      const name = sepIdx >= 0 ? label.slice(sepIdx + LABEL_SEPARATOR.length) : label;
      // Skip judges already in the breed table
      if (breedKeyedJudgeNames.has(name)) continue;
      const list = rolesByJudge.get(name) ?? [];
      if (role) list.push(role);
      rolesByJudge.set(name, list);
    }
    for (const [name, roles] of rolesByJudge) {
      otherJudges.push({ name, roles });
    }
  }

  return (
    <>
      {/* Keep banner + table header atomic so the banner never sits
          alone at the bottom of a page with the table flowing to the
          next. */}
      <View wrap={false}>
        <SectionBand title="List of Judges" />
        <View style={{ ...styles.judgesListRow, borderBottomWidth: 1.5, borderBottomColor: C.primary, marginBottom: 4 }}>
          <Text style={{ ...styles.judgesListBreed, fontWeight: 'bold' }}>Breed</Text>
          <Text style={{ ...styles.judgesListJudge, fontWeight: 'bold' }}>Judge</Text>
          {hasRings && (
            <Text style={{ fontFamily: 'Inter', fontSize: 7.5, fontWeight: 'bold', width: 30, textAlign: 'right' }}>Ring</Text>
          )}
        </View>
      </View>

      {sortedBreeds.map((breed) => {
        const judgeName = judges[breed];
        const ringNo = ringNumbers[breed];
        const bio = judgeBios[judgeName ?? ''];
        const photoUrl = show.judgePhotos?.[judgeName ?? ''];
        return (
          <View key={breed} wrap={false}>
            <View style={styles.judgesListRow}>
              <Text style={styles.judgesListBreed}>{breed}</Text>
              <Text style={styles.judgesListJudge}>{judgeName}</Text>
              {hasRings && (
                <Text style={{ fontFamily: 'Inter', fontSize: 7.5, width: 30, textAlign: 'right', color: ringNo ? C.textDark : C.textLight }}>
                  {ringNo ?? '—'}
                </Text>
              )}
            </View>
            {(bio || photoUrl) && (
              <View style={{ flexDirection: 'row', paddingLeft: 6, paddingTop: 2, paddingBottom: 4, gap: 6 }}>
                {photoUrl && (
                  <Image src={photoUrl} style={{ width: 36, height: 36, borderRadius: 18 }} />
                )}
                {bio && (
                  <Text style={{ ...styles.judgeBio, flex: 1, marginBottom: 0 }}>{bio}</Text>
                )}
              </View>
            )}
          </View>
        );
      })}

      {/* Other judges (JH, dogs/bitches-only, etc.) not in the breed
          table. Each gets a card-style row with photo + name + role +
          bio — matching the single-breed branch layout above. */}
      {otherJudges.length > 0 && (
        <View style={{ marginTop: 10 }}>
          <Text style={{ fontFamily: 'Inter', fontSize: 8, fontWeight: 'bold', color: C.primary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
            Other Judges
          </Text>
          {otherJudges.map(({ name, roles }, i) => {
            const bio = judgeBios[name];
            const photoUrl = show.judgePhotos?.[name];
            const roleLabel = roles.length > 0 ? roles.join(' & ') : null;
            return (
              <View key={i} wrap={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {photoUrl && (
                    <Image src={photoUrl} style={{ width: 36, height: 36, borderRadius: 18 }} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 'bold', color: C.textDark }}>
                      {name}
                    </Text>
                    {roleLabel && (
                      <Text style={{ fontFamily: 'Inter', fontSize: 8, fontStyle: 'italic', color: C.textMedium }}>
                        {roleLabel}
                      </Text>
                    )}
                  </View>
                </View>
                {bio && (
                  <Text style={{ ...styles.judgeBio, marginTop: 3, marginBottom: 0 }}>
                    {bio}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      )}

    </>
  );
}

/** Standalone Judges page — delegates to JudgesListContent.
 *  Kept so callers that haven't switched to the consolidated
 *  front-matter page still get a correctly wrapped Page. */
export function JudgesListPage({ show }: FrontMatterProps) {
  const hasJudges = Object.keys(show.judgesByBreedName ?? {}).length > 0
    || (show.judgeDisplayList?.length ?? 0) > 0;
  if (!hasJudges) return null;
  return (
    <Page size="A5" style={styles.frontMatterPage} wrap>
      <JudgesListContent show={show} />
      <Text
        style={styles.footer}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}  ·  Generated by Remi`}
        fixed
      />
    </Page>
  );
}

// ── Class Definitions ──────────────────────────────────────────

export function ClassDefinitionsContent({ show }: FrontMatterProps) {
  const defs = show.classDefinitions ?? [];
  if (defs.length === 0) return null;
  return (
    <>
      <SectionBand title="Definitions of Classes" />
      {defs.map((def) => (
        <View key={def.name} wrap={false}>
          <Text style={styles.classDefName}>{def.name}</Text>
          {def.description && (
            <Text style={styles.classDefDescription}>{def.description}</Text>
          )}
        </View>
      ))}
    </>
  );
}

/** Standalone Class Definitions page — delegates to ClassDefinitionsContent. */
export function ClassDefinitionsPage({ show }: FrontMatterProps) {
  if ((show.classDefinitions?.length ?? 0) === 0) return null;
  return (
    <Page size="A5" style={styles.frontMatterPage} wrap>
      <ClassDefinitionsContent show={show} />
      <Text
        style={styles.footer}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}  ·  Generated by Remi`}
        fixed
      />
    </Page>
  );
}

// ── Exhibitor Index (Championship shows — RKC F(1).11.b(6)) ───

type ExhibitorIndexEntry = Pick<
  CatalogueEntry,
  'exhibitor' | 'exhibitorId' | 'catalogueNumber' | 'owners' | 'classes' | 'withholdFromPublication' | 'breed'
>;

interface ExhibitorIndexPageProps {
  show: CatalogueShowInfo;
  entries: ExhibitorIndexEntry[];
  /**
   * When set, renders a per-breed exhibitor index with the breed name in the
   * heading. Used for multi-breed championship shows where RKC F(1).11.b(6)
   * requires each breed section to start with its own alphabetical index.
   * Callers are responsible for filtering `entries` to just that breed.
   */
  breedName?: string;
}

/**
 * Alphabetical exhibitor index — required by RKC F(1).11.b(6) for
 * championship shows. Lists each exhibitor with their catalogue numbers
 * and classes entered, sorted alphabetically by exhibitor name.
 *
 * Called by ExhibitorIndexPage (front-matter, single-breed champ shows) and
 * by createBreedIndexRenderer (per-breed, multi-breed champ shows). Callers
 * are responsible for the `showType === 'championship'` check; this component
 * focuses on rendering.
 *
 * Entries where the exhibitor has requested withholding from publication
 * per F(1).11.b.(6)/(8) are excluded from the index entirely.
 */
export function ExhibitorIndexPage({ show, entries, breedName }: ExhibitorIndexPageProps) {
  const byExhibitor = new Map<string, { name: string; address?: string; catNos: string[]; classes: string[] }>();
  for (const entry of entries) {
    if (entry.withholdFromPublication) continue;
    const name = entry.exhibitor ?? entry.owners[0]?.name ?? 'Unknown';
    const key = name.toUpperCase();
    if (!byExhibitor.has(key)) {
      byExhibitor.set(key, {
        name: name.toUpperCase(),
        address: entry.owners[0]?.address ?? undefined,
        catNos: [],
        classes: [],
      });
    }
    const ex = byExhibitor.get(key)!;
    if (entry.catalogueNumber && !ex.catNos.includes(entry.catalogueNumber)) {
      ex.catNos.push(entry.catalogueNumber);
    }
    for (const cls of entry.classes) {
      const label = cls.classNumber != null ? `${cls.classNumber}` : cls.name ?? '';
      if (label && !ex.classes.includes(label)) ex.classes.push(label);
    }
  }

  const sorted = Array.from(byExhibitor.values()).sort((a, b) => a.name.localeCompare(b.name));
  if (sorted.length === 0) return null;

  const title = breedName ? `Exhibitor Index — ${breedName}` : 'Exhibitor Index';

  return (
    <Page size="A5" style={styles.frontMatterPage} wrap>
      <SectionBand title={title} />
      <View style={{ flexDirection: 'row', borderBottomWidth: 1.5, borderBottomColor: C.primary, paddingBottom: 3, marginBottom: 4 }}>
        <Text style={{ fontFamily: 'Inter', fontSize: 6.5, fontWeight: 'bold', width: '40%', color: C.textDark }}>Exhibitor</Text>
        <Text style={{ fontFamily: 'Inter', fontSize: 6.5, fontWeight: 'bold', width: '20%', color: C.textDark }}>Cat No(s)</Text>
        <Text style={{ fontFamily: 'Inter', fontSize: 6.5, fontWeight: 'bold', width: '40%', color: C.textDark }}>Classes</Text>
      </View>
      {sorted.map((ex, idx) => (
        <View key={idx} wrap={false} style={{ flexDirection: 'row', paddingVertical: 1.5, borderBottomWidth: 0.5, borderBottomColor: C.ruleLight }}>
          <View style={{ width: '40%', paddingRight: 4 }}>
            <Text style={{ fontFamily: 'Inter', fontSize: 7, fontWeight: 'bold', color: C.textDark }}>{ex.name}</Text>
            {ex.address && <Text style={{ fontFamily: 'Inter', fontSize: 6, color: C.textLight }}>{ex.address}</Text>}
          </View>
          <Text style={{ fontFamily: 'Inter', fontSize: 7, width: '20%', color: C.textDark }}>
            {ex.catNos.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(', ')}
          </Text>
          <Text style={{ fontFamily: 'Inter', fontSize: 6.5, width: '40%', color: C.textMedium }}>
            {ex.classes.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(', ')}
          </Text>
        </View>
      ))}

      <Text
        style={styles.footer}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}  ·  Generated by Remi`}
        fixed
      />
    </Page>
  );
}

/** True when the show requires per-breed exhibitor indexes instead of a single
 *  front-matter index — RKC F(1).11.b(6) applies to multi-breed champ shows. */
export function isMultiBreedChampionship(
  show: Pick<CatalogueShowInfo, 'showType' | 'showScope'>,
): boolean {
  return show.showType === 'championship' && show.showScope !== 'single_breed';
}

/**
 * Builds a per-breed exhibitor-index renderer for multi-breed champ shows.
 *
 * Entries are bucketed by breed name in a single O(n) pass up front, so each
 * `render(breedName)` call is O(1) — no filter-inside-map-loop scaling.
 *
 * The returned function is a closure with private first-occurrence state: it
 * renders an index the first time a breed is seen and `null` on subsequent
 * calls, so callers can invoke it once per breed page without worrying about
 * deduping. When `enabled` is false (non-champ shows, single-breed champ shows),
 * it always returns `null` and skips the bucketing work entirely.
 */
export function createBreedIndexRenderer(
  show: CatalogueShowInfo,
  entries: ExhibitorIndexEntry[],
  enabled: boolean,
): (breedName: string) => ReactNode {
  if (!enabled) return () => null;

  const entriesByBreed = new Map<string, ExhibitorIndexEntry[]>();
  for (const entry of entries) {
    if (!entry.breed) continue;
    const bucket = entriesByBreed.get(entry.breed);
    if (bucket) bucket.push(entry);
    else entriesByBreed.set(entry.breed, [entry]);
  }

  const rendered = new Set<string>();
  return (breedName: string) => {
    if (rendered.has(breedName)) return null;
    const breedEntries = entriesByBreed.get(breedName);
    if (!breedEntries || breedEntries.length === 0) return null;
    rendered.add(breedName);
    return (
      <ExhibitorIndexPage
        show={show}
        entries={breedEntries}
        breedName={breedName}
      />
    );
  };
}

// ── Trophies & Sponsorships Page ────────────────────────────────

interface TrophiesPageProps {
  show: CatalogueShowInfo;
  sponsorships: ClassSponsorshipInfo[];
}

/** Trophies & Sponsorships front-matter page — compact table layout */
export function TrophiesPage({ show, sponsorships }: TrophiesPageProps) {
  if (sponsorships.length === 0) return null;

  // Sort by class number, then class name
  const sorted = [...sponsorships].sort((a, b) => {
    if (a.classNumber != null && b.classNumber != null) return a.classNumber - b.classNumber;
    if (a.classNumber != null) return -1;
    if (b.classNumber != null) return 1;
    return a.className.localeCompare(b.className);
  });

  return (
    <Page size="A5" style={styles.frontMatterPage} wrap>
      <SectionBand title="Trophies & Sponsorships" />

      {/* Table header */}
      <View style={{
        flexDirection: 'row',
        borderBottomWidth: 1.5,
        borderBottomColor: C.primary,
        paddingBottom: 3,
        marginBottom: 4,
      }}>
        <Text style={{ fontFamily: 'Inter', fontSize: 6.5, fontWeight: 'bold', width: '30%', color: C.textDark }}>Class</Text>
        <Text style={{ fontFamily: 'Inter', fontSize: 6.5, fontWeight: 'bold', width: '35%', color: C.textDark }}>Trophy / Sponsor</Text>
        <Text style={{ fontFamily: 'Inter', fontSize: 6.5, fontWeight: 'bold', width: '35%', color: C.textDark }}>Prize</Text>
      </View>

      {sorted.map((sp, idx) => {
        const classLabel = sp.classNumber != null
          ? `${sp.classNumber}. ${sp.className}`
          : sp.className;

        // Build trophy + sponsor combined text
        const trophySponsorParts: string[] = [];
        if (sp.trophyName) {
          let part = sp.trophyName;
          if (sp.trophyDonor) part += ` (${sp.trophyDonor})`;
          trophySponsorParts.push(part);
        }
        if (sp.sponsorName) {
          let part = `Sponsored by ${sp.sponsorName}`;
          if (sp.sponsorAffix) part += ` (${sp.sponsorAffix})`;
          trophySponsorParts.push(part);
        }

        return (
          <View
            key={`${sp.classNumber}-${sp.className}-${idx}`}
            wrap={false}
            style={{
              flexDirection: 'row',
              paddingVertical: 2.5,
              borderBottomWidth: 0.5,
              borderBottomColor: C.ruleLight,
            }}
          >
            <Text style={{ fontFamily: 'Inter', fontSize: 7, fontWeight: 'bold', width: '30%', color: C.textDark }}>
              {classLabel}
            </Text>
            <Text style={{ fontFamily: 'Times', fontSize: 6.5, fontStyle: 'italic', width: '35%', color: C.textMedium }}>
              {trophySponsorParts.join('\n') || '—'}
            </Text>
            <Text style={{ fontFamily: 'Inter', fontSize: 6.5, width: '35%', color: C.textMedium }}>
              {sp.prizeDescription || '—'}
            </Text>
          </View>
        );
      })}

      <Text
        style={styles.footer}
        render={({ pageNumber, totalPages }) =>
          `Page ${pageNumber} of ${totalPages}  ·  Generated by Remi`
        }
        fixed
      />
    </Page>
  );
}
