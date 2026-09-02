import type { ReactNode } from 'react';
import { Page, View, Text, Image } from '@react-pdf/renderer';
import { styles, C } from './catalogue-styles';
import type { CatalogueEntry, CatalogueShowInfo, ClassSponsorshipInfo } from './catalogue-types';
import { ownerHeading, uppercaseName, formatOwnerKC } from './catalogue-utils';
import { buildBestAwards } from '@/lib/best-awards';
import { MastheadBand, TonalWash, ClubCrestSlot } from '@/components/sv-pdf/cover-atoms';
import { ss, SV, SV_FONTS } from '@/components/schedule/shared/sv-styles';
import { Numero } from '@/components/schedule/shared/numero';
import { getRkcScheduleProfile } from '@/lib/rkc-schedule-profile';
import { RKC_JUDGES_WELFARE_STATEMENT, isRkcJudgesWelfareStatement } from '@/lib/rkc-statements';

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
 *
 * Also drops a custom statement that restates the RKC Judges' Welfare
 * Commitment — that wording now always renders as its own mandatory block
 * (see `JudgesWelfareCommitmentBlock`), so a secretary who typed it in as
 * free text must not get it printed a second time (Mandy 2026-08-17,
 * carried over from the same rule on the schedule).
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
    if (isRkcJudgesWelfareStatement(statement)) {
      return false;
    }
    return true;
  });
}

/**
 * Mandatory RKC judges' undertaking — carried over from the schedule
 * (Mandy 2026-08-17: the catalogue must show it too, exactly once).
 * Wording comes from the single shared `RKC_JUDGES_WELFARE_STATEMENT`
 * constant so the two documents can never state it differently; the
 * bordered-box layout is the catalogue's own idiom (the schedule's
 * `RkcJudgesWelfareCommitment` colour styling belongs to the schedule and
 * isn't reused here). Rendered unconditionally from `ShowParticularsContent`
 * — deliberately NOT gated behind `showHasShowInformation` — so it always
 * appears once per catalogue, even for a show with no other show-information
 * fields filled in.
 */
function JudgesWelfareCommitmentBlock() {
  return (
    <View style={styles.welfareBlock} wrap={false}>
      <Text style={styles.welfareBlockEyebrow}>Royal Kennel Club Welfare Undertaking</Text>
      <Text style={styles.welfareBlockTitle}>Judges&apos; Welfare Commitment</Text>
      <Text style={styles.welfareBlockText}>{RKC_JUDGES_WELFARE_STATEMENT}</Text>
    </View>
  );
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
export function FrontMatterContent({ show, compact }: FrontMatterProps & { compact?: boolean }) {
  const hasJudges = Object.keys(show.judgesByBreedName ?? {}).length > 0
    || (show.judgeDisplayList?.length ?? 0) > 0;
  // Section-between gap. The sectionBand style uses marginTop: -20 to
  // bleed into the page's top padding when it's first on a page; that
  // negative margin also eats ~20pt when the band appears mid-flow, so
  // the gap here has to include 20pt of compensation PLUS the visible
  // separation we actually want. In compact mode we tighten the visible
  // gap to ~4pt (24 - 20 compensation) to pack more sections per page.
  const SECTION_GAP = compact ? 24 : 34;
  // Keep the standalone List of Judges section in both modes — Amanda's
  // brief: it carries judge bios and photos that don't fit on the cover
  // or inside Show Particulars, and dropping it loses RKC-significant
  // information. Compact mode just tightens its surrounding spacing.
  const showJudgesSection = hasJudges;
  return (
    <>
      <ShowParticularsContent show={show} />

      {showHasShowInformation(show) && (
        <View style={{ marginTop: SECTION_GAP }} minPresenceAhead={compact ? 60 : 100}>
          <ShowInformationContent show={show} />
        </View>
      )}

      {showJudgesSection && (
        <View style={{ marginTop: SECTION_GAP }} minPresenceAhead={140}>
          <JudgesListContent show={show} />
        </View>
      )}

      {/* Class definitions stay atomic — they're short enough (typically
          8-12 defs on one page) that fitting them on a single page is
          always preferable to a two-page split. */}
      {(show.classDefinitions?.length ?? 0) > 0 && (
        <View style={{ marginTop: SECTION_GAP }} wrap={false} minPresenceAhead={compact ? 120 : 240}>
          <ClassDefinitionsContent show={show} />
        </View>
      )}

      {/* Sponsors get a page of their own (Mandy 2026-06-19) — `break` starts
          the section on a fresh page so it never splits with a single award
          (e.g. Best in Show) stranded at the foot of the preceding section. */}
      {hasBestAwards(show) && (
        <View break>
          <BestAwardsContent show={show} compact={compact} />
        </View>
      )}
    </>
  );
}

/** Standalone front-matter page wrapper. Use this when the catalogue
 *  wants front matter on its own Page; for maximum density, inline
 *  FrontMatterContent at the top of the body <Page wrap> instead. */
export function FrontMatterPage({ show, compact }: FrontMatterProps & { compact?: boolean }) {
  return (
    <Page size="A5" style={styles.frontMatterPage} wrap>
      <FrontMatterContent show={show} compact={compact} />
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

export function BestAwardsContent({ show, compact }: FrontMatterProps & { compact?: boolean }) {
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
  // The secretary's own order, verbatim — awards as configured on the sponsors
  // page, with any sponsor-only extras after. Mandy 2026-07-27: "the order in
  // which we have the best awards in this table should be mirrored in the
  // catalogue but currently they are not". This used to re-sort into a
  // hardcoded canonical order, so anything that list didn't recognise (Reserve
  // Best in Show, the Challenge Certificates, Long Coats, Baby Puppy) was
  // silently dumped at the end.
  const allAwards = Array.from(new Set([...bestAwards, ...extraSponsorAwards]));

  // Trophy/Sponsor columns are pure clutter when no sponsor has been
  // assigned to any award — the rows just fill with em-dashes. Amanda's
  // feedback: only render those columns when at least one award has a
  // sponsor configured. Empty state becomes a clean single-column
  // "award + winner line" list.
  const hasAnySponsor = awardSponsors.length > 0;

  const headerRow = hasAnySponsor ? (
    <View style={bestAwardsStyles.tableHeaderRow}>
      <Text style={{ ...bestAwardsStyles.headerLabel, ...bestAwardsStyles.awardCol }}>
        Award
      </Text>
      <Text style={{ ...bestAwardsStyles.headerLabel, ...bestAwardsStyles.trophyCol }}>
        Prize
      </Text>
      <Text style={{ ...bestAwardsStyles.headerLabel, ...bestAwardsStyles.sponsorCol }}>
        Sponsor
      </Text>
    </View>
  ) : null;

  const compactRowStyle = {
    flexDirection: 'row' as const,
    borderBottomWidth: 0.4,
    borderBottomColor: C.ruleLight,
    paddingTop: 1.5,
    paddingBottom: 1.5,
    alignItems: 'baseline' as const,
  };
  const renderRow = (award: string, i: number) => {
    const sponsors = sponsorsByAward.get(normaliseAward(award)) ?? [];
    if (compact) {
      // Single-line per award. Trophy + sponsor compressed onto one row,
      // winner-line dropped (winners tend to get filled into the schedule
      // or marked catalogue, not the published one). Saves ~30pt per row.
      const sponsorText = sponsors.length === 0
        ? null
        : sponsors
            .map((s) => [s.trophyName, s.sponsorName].filter(Boolean).join(' — '))
            .join(' / ');
      return (
        <View key={`${award}-${i}`} style={compactRowStyle} wrap={false}>
          <Text style={{ fontFamily: 'Inter', fontSize: 7.5, fontWeight: 'bold', color: C.textDark, width: '40%', paddingRight: 4 }}>
            {award}
          </Text>
          <Text style={{ fontFamily: 'Inter', fontSize: 7, color: C.textMedium, flex: 1 }}>
            {sponsorText ?? '—'}
          </Text>
        </View>
      );
    }
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
        {/* Prize + sponsor render as PAIRED lines — one row per
            sponsorship — so each prize sits beside the sponsor giving it.
            The old independent-column layout let the pairs drift: with two
            sponsors on one award, a sponsor affix line pushed the second
            sponsor below its prize (Mandy 2026-07-22 — "Prize Money £25"
            floated away from Pat Wills, who gives it). */}
        <View style={{ width: '62%' }}>
          {sponsors.length === 0 ? (
            <View style={{ flexDirection: 'row' }}>
              <Text style={{ ...bestAwardsStyles.trophyName, color: C.textLight, width: '39%', paddingRight: 6 }}>—</Text>
              <Text style={{ ...bestAwardsStyles.sponsorName, color: C.textLight, flex: 1 }}>—</Text>
            </View>
          ) : (
            sponsors.map((s, idx) => (
              <View key={idx} style={{ flexDirection: 'row', marginBottom: idx < sponsors.length - 1 ? 4 : 0 }}>
                <Text style={{ ...bestAwardsStyles.trophyName, width: '39%', paddingRight: 6 }}>
                  {s.trophyName ?? '—'}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={bestAwardsStyles.sponsorName}>{s.sponsorName}</Text>
                  {s.sponsorAffix && (
                    <Text style={bestAwardsStyles.sponsorAffix}>{s.sponsorAffix}</Text>
                  )}
                </View>
              </View>
            ))
          )}
        </View>
      </View>
    );
  };

  return (
    <>
      {/* Keep banner + italic intro + header + first award row atomic so
          the banner never sits alone at the foot of a page. Remaining
          rows flow normally after that block. */}
      <View wrap={false}>
        <SectionBand title="Sponsors" />
        {headerRow}
        {allAwards.length > 0 && renderRow(allAwards[0], 0)}
      </View>
      {allAwards.slice(1).map((award, i) => renderRow(award, i + 1))}
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

/**
 * SV/WUSV cover treatment — matches the SV schedule's Sieger Editorial
 * design: full-page tonal wash + WUSV/GSDL/BRG masthead + hero lockup
 * with the club crest beside it + 2×2 detail grid + bottom strip with
 * entries-close + event secretary (Amanda 2026-05-23).
 *
 * Branched off from the standard `CoverPage` rather than threaded
 * through it because the layouts are structurally different.
 */
function SvCoverPage({ show, classCount }: { show: CatalogueShowInfo; classCount: number }) {
  const affiliation = 'Under the banner of GSDL — British Regional Group';
  const dateDisplay = show.endDate
    ? `${formatCoverDate(show.date)} — ${formatCoverDate(show.endDate)}`
    : formatCoverDate(show.date);
  const judges = show.judgesByBreedName ?? {};
  const uniqueJudges = [...new Set(Object.values(judges))];
  const coverJudges =
    show.judgeDisplayList && show.judgeDisplayList.length > 0
      ? show.judgeDisplayList
      : uniqueJudges;
  const breedJudge = coverJudges[0] ?? 'Judge TBC';

  return (
    <Page size="A5" style={{ backgroundColor: SV.paper, padding: 0, color: SV.ink, fontFamily: SV_FONTS.sans }}>
      <TonalWash variant="cover" buffer={show.svWashes?.cover} />
      <MastheadBand />

      <View
        style={{
          position: 'absolute',
          top: '55mm',
          left: '14mm',
          right: '14mm',
          bottom: '10mm',
        }}
      >
        {/* Tiny meta — show name + licence */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text style={[ss.eyebrow, { maxWidth: '60%' }]}>{show.name}</Text>
          {show.kcLicenceNo ? (
            <Text style={[ss.eyebrow, { color: SV.ink3 }]}>
              <Numero /> {show.kcLicenceNo}
            </Text>
          ) : null}
        </View>

        {/* Hero — "Catalogue" word, sized to match the schedule's
            "Regional / Schedule" lockup; club crest to the right. */}
        <View style={{ marginTop: '8mm', flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, paddingRight: '10mm' }}>
            <Text style={{ fontFamily: SV_FONTS.serif, fontStyle: 'italic', fontSize: 13, color: SV.ink3, marginBottom: 2 }}>
              {classCount} {classCount === 1 ? 'class' : 'classes'}
            </Text>
            <Text style={{ fontFamily: SV_FONTS.serif, fontSize: 48, lineHeight: 0.92, letterSpacing: -0.5, color: SV.ink }}>
              Official
            </Text>
            <Text style={{ fontFamily: SV_FONTS.serif, fontStyle: 'italic', fontSize: 28, lineHeight: 1, color: SV.accent, marginTop: 2 }}>
              Catalogue
            </Text>
          </View>
          <ClubCrestSlot logoUrl={show.logoUrl ?? null} />
        </View>

        <View style={{ height: 1, backgroundColor: SV.ink, marginTop: '10mm' }} />

        {/* 2×2 info grid — Host Club / Date / Venue / Breed Judge */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: '5mm' }}>
          <View style={{ width: '50%', paddingRight: 8, marginBottom: '5mm' }}>
            <Text style={[ss.eyebrow, { marginBottom: 3 }]}>Host Club</Text>
            <Text style={{ fontFamily: SV_FONTS.serif, fontSize: 13, lineHeight: 1.15, color: SV.ink }}>
              {show.organisation ?? ''}
            </Text>
            <Text style={[ss.bodySmall, { marginTop: 2 }]}>{affiliation}</Text>
          </View>
          <View style={{ width: '50%', paddingLeft: 8, marginBottom: '5mm' }}>
            <Text style={[ss.eyebrow, { marginBottom: 3 }]}>Date</Text>
            <Text style={{ fontFamily: SV_FONTS.serif, fontSize: 13, lineHeight: 1.15, color: SV.ink }}>
              {dateDisplay}
            </Text>
            {(show.showOpenTime || show.startTime) ? (
              <Text style={[ss.bodySmall, { marginTop: 2 }]}>
                {show.showOpenTime ? `Grounds open ${show.showOpenTime}` : ''}
                {show.showOpenTime && show.startTime ? ' · ' : ''}
                {show.startTime ? `Judging from ${show.startTime}` : ''}
              </Text>
            ) : null}
          </View>
          <View style={{ width: '50%', paddingRight: 8 }}>
            <Text style={[ss.eyebrow, { marginBottom: 3 }]}>Venue</Text>
            <Text style={{ fontFamily: SV_FONTS.serif, fontSize: 13, lineHeight: 1.15, color: SV.ink }}>
              {show.venue ?? ''}
            </Text>
            {show.venueAddress ? (
              <Text style={[ss.bodySmall, { marginTop: 2 }]}>{show.venueAddress}</Text>
            ) : null}
            {show.venueWhat3words ? (
              <Text style={[ss.bodySmall, { marginTop: 2 }]}>what3words: {show.venueWhat3words}</Text>
            ) : null}
          </View>
          <View style={{ width: '50%', paddingLeft: 8 }}>
            <Text style={[ss.eyebrow, { marginBottom: 3 }]}>Breed Judge</Text>
            <Text style={{ fontFamily: SV_FONTS.serif, fontSize: 13, lineHeight: 1.15, color: SV.ink }}>
              {breedJudge}
            </Text>
          </View>
        </View>

        <View style={{ flex: 1 }} />

        {/* Bottom strip — Event Secretary contact */}
        <View style={{ height: 1, backgroundColor: SV.ink }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '4mm' }}>
          <View style={{ maxWidth: '50%' }}>
            <Text style={[ss.eyebrow, { marginBottom: 3 }]}>Show Date</Text>
            <Text style={{ fontFamily: SV_FONTS.serif, fontSize: 13, color: SV.ink }}>{formatCoverDate(show.date)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', maxWidth: '50%' }}>
            <Text style={[ss.eyebrow, { marginBottom: 3 }]}>Event Secretary</Text>
            <Text style={{ fontFamily: SV_FONTS.serif, fontSize: 13, lineHeight: 1.15, color: SV.ink }}>
              {show.secretaryName ?? '—'}
            </Text>
            <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 7, color: SV.ink3, marginTop: 2 }}>
              {[show.secretaryEmail, show.secretaryPhone].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>
      </View>
    </Page>
  );
}

/** Cover page for the RKC standard catalogue — matching schedule design */
export function CoverPage({ show }: FrontMatterProps) {
  // SV/WUSV regionals get their own cover treatment matching the schedule.
  if (show.showRuleset === 'wusv') {
    // Count the SV breed-coat classes actually present (each coat counts as a
    // class on the cover, mirroring the schedule's coat-row count) — derive
    // from the rows rather than the stored totalClasses so the two covers
    // can't drift apart (Amanda 2026-05-28).
    const svClassCount = (show.allShowClasses ?? []).filter(
      (c) => c.svCoatType != null,
    ).length;
    return <SvCoverPage show={show} classCount={svClassCount || (show.totalClasses ?? 0)} />;
  }

  const showTypeLabel = show.showType ? SHOW_TYPE_LABELS[show.showType] : undefined;

  // Formal RKC designation — reuses the schedule's own profile helper so the
  // two documents can never state the show's designation differently (Mandy
  // 2026-08-17). Guarded on showType being present: getRkcScheduleProfile
  // requires it and some legacy/incomplete shows have none.
  const rkcProfile = show.showType
    ? getRkcScheduleProfile({
        showType: show.showType,
        showScope: show.showScope ?? '',
        judgedOnGroupSystem: show.judgedOnGroupSystem,
      })
    : null;

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

        {/* Formal RKC designation — "CATALOGUE OF <same designation as the
            schedule cover>", in the catalogue's own print-first Times idiom
            (not the schedule's coloured pill). RKC shows only; WUSV/SV
            covers return via SvCoverPage above and never reach this code
            (Mandy 2026-08-17). */}
        {rkcProfile && (
          <Text style={styles.coverDesignation}>
            CATALOGUE OF {rkcProfile.designation}
          </Text>
        )}

        {/* RKC jurisdiction — same exact wording as the schedule cover
            (Mandy 2026-08-17), replacing the catalogue's previous,
            differently-worded citation so a secretary never sees two
            different "held under" lines on the same document. */}
        <Text style={styles.coverRegulatory}>
          Held under Royal Kennel Club Limited Rules &amp; Regulations
        </Text>

        {/* Docking statement — mandatory RKC F(1).7.c(2) notice, now
            prominent on the cover directly beneath the designation,
            mirroring the schedule's cover (Mandy 2026-08-17). No longer
            duplicated on the particulars page — see ShowParticularsContent. */}
        {show.dockingStatement && (
          <Text style={styles.coverDocking}>{show.dockingStatement}</Text>
        )}

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
                {show.venueWhat3words ? `\nwhat3words: ${show.venueWhat3words}` : ''}
              </Text>
            </View>
          )}
          {coverJudges.length > 0 && coverJudges.map((j, i) => (
            <View key={i} style={styles.coverDetailRow}>
              <Text style={styles.coverDetailLabel}>{i === 0 ? (coverJudges.length === 1 ? 'Judge' : 'Judges') : ''}</Text>
              <Text style={styles.coverDetailValue}>{j}</Text>
            </View>
          ))}
          {/* Show Opens + Judging Starts as their own rows (label width 58 like
              Date/Venue/Judges) so the times line up under the values above,
              with the time in bold to stand out (Mandy 2026-07-20). */}
          {show.showOpenTime && (
            <View style={styles.coverDetailRow}>
              <Text style={styles.coverDetailLabel}>Show Opens</Text>
              <Text style={[styles.coverDetailValue, { fontWeight: 'bold' }]}>{formatTime(show.showOpenTime)}</Text>
            </View>
          )}
          {show.startTime && (
            <View style={styles.coverDetailRow}>
              <Text style={styles.coverDetailLabel}>Judging Starts</Text>
              <Text style={[styles.coverDetailValue, { fontWeight: 'bold' }]}>{formatTime(show.startTime)}</Text>
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
            moved to ShowParticularsContent (composed into every other
            front-matter page) so the cover stays consistent across shows
            regardless of which optional fields are set. */}
        {show.onCallVet && (
          <View style={{ width: '100%', marginTop: 2, marginBottom: 2 }} wrap={false}>
            <Text style={styles.coverSectionLabel}>On-Call Veterinary Surgeon</Text>
            <Text style={styles.coverSectionText}>{show.onCallVet}</Text>
          </View>
        )}

        {show.firstAiders && show.firstAiders.length > 0 && (
          <View style={{ width: '100%', marginTop: 2, marginBottom: 2 }} wrap={false}>
            <Text style={styles.coverSectionLabel}>
              {show.firstAiders.length === 1 ? 'First Aider' : 'First Aiders'}
            </Text>
            <Text style={styles.coverSectionText}>{show.firstAiders.join(', ')}</Text>
          </View>
        )}

        {show.showManager && (
          <View style={{ width: '100%', marginTop: 2, marginBottom: 2 }} wrap={false}>
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
      {/* Mandatory RKC judges' welfare undertaking — the first thing on the
          front-matter content, ahead of sponsors/fees/notes, mirroring the
          schedule's "first information page" placement (Mandy 2026-08-17). */}
      <JudgesWelfareCommitmentBlock />

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

      {/* Docking statement now renders prominently on the CoverPage instead
          (Mandy 2026-08-17) — every real catalogue format renders CoverPage
          in the same document as this component, so nothing loses the
          statement by removing the second copy here. See CoverPage. */}

      <JurisdictionBlock />
    </>
  );
}

// ── Judges List ─────────────────────────────────────────────────

/**
 * Normalise a judge's display name to a de-dupe key: strips a trailing
 * parenthetical suffix (e.g. "(subject to RKC approval)"), trims whitespace,
 * and lowercases. The breed table shows the plain name ("Hugh De Zutter")
 * while the judge display list can carry an approval suffix ("Hugh De
 * Zutter (subject to RKC approval)") — an exact-string match missed that and
 * listed the main breed judge a second time under "Other Judges" (Mandy
 * 2026-07-20). Exported for unit testing.
 */
export const normaliseJudgeName = (n: string) =>
  n.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();

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
  // double-rendering when we list "other" judges below. Compared via
  // normaliseJudgeName (module-level, above) so an approval-suffix or
  // case/whitespace difference still collapses to the same judge.
  const breedKeyedJudgeNames = new Set(
    Object.values(judges).map(normaliseJudgeName),
  );

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
      // Skip judges already in the breed table (the main breed judge must
      // not reappear under "Other Judges").
      if (breedKeyedJudgeNames.has(normaliseJudgeName(name))) continue;
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
      {otherJudges.length > 0 && (() => {
        const renderOtherJudge = ({ name, roles }: { name: string; roles: string[] }, i: number) => {
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
        };
        const OtherJudgesHeading = (
          <Text style={{ fontFamily: 'Inter', fontSize: 8, fontWeight: 'bold', color: C.primary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
            Other Judges
          </Text>
        );
        return (
          <View style={{ marginTop: 10 }} wrap={false}>
            {/* Heading + ALL cards kept together (wrap=false) so the "Other
                Judges" list never splits across a page break — the heading +
                first name on one page and the rest on the next looked wrong
                (Mandy 2026-07-20). Other-judge lists are short (typically a
                JH and a special-awards judge), so keeping them atomic is safe. */}
            {OtherJudgesHeading}
            {otherJudges.map((j, i) => renderOtherJudge(j, i))}
          </View>
        );
      })()}

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
/**
 * Group index entries by exhibitor heading, alphabetical by surname.
 * A withheld exhibitor stays IN the index — name and catalogue numbers,
 * no address. Withholding protects the home address, not the fact of
 * entry (Mandy 2026-08-12: "it should show name and catalogue numbers
 * but no address" — previously these entries were skipped entirely and
 * Sarah Hill vanished from South Western's RKC-bound catalogue). Same
 * rule as the ringside index and redactWithheldOwnerAddresses.
 */
export function buildExhibitorIndexRows(entries: ExhibitorIndexEntry[]) {
  const byExhibitor = new Map<string, { name: string; sortKey: string; address?: string; catNos: string[]; classes: string[] }>();
  for (const entry of entries) {
    const { heading, sortKey } = ownerHeading(entry.owners, entry.exhibitor);
    const key = heading;
    if (!byExhibitor.has(key)) {
      byExhibitor.set(key, {
        name: heading,
        sortKey,
        address: entry.withholdFromPublication ? undefined : (entry.owners[0]?.address ?? undefined),
        catNos: [],
        classes: [],
      });
    }
    const ex = byExhibitor.get(key)!;
    // One withheld entry hides the address even if another of the same
    // exhibitor's entries isn't flagged — withhold wins.
    if (entry.withholdFromPublication) ex.address = undefined;
    if (entry.catalogueNumber && !ex.catNos.includes(entry.catalogueNumber)) {
      ex.catNos.push(entry.catalogueNumber);
    }
    for (const cls of entry.classes) {
      const label = cls.classLabel ?? (cls.classNumber != null ? String(cls.classNumber) : cls.name ?? '');
      if (label && !ex.classes.includes(label)) ex.classes.push(label);
    }
  }

  return Array.from(byExhibitor.values()).sort((a, b) => {
    const surnameCmp = a.sortKey.localeCompare(b.sortKey);
    return surnameCmp !== 0 ? surnameCmp : a.name.localeCompare(b.name);
  });
}

export function ExhibitorIndexPage({ show, entries, breedName, compact }: ExhibitorIndexPageProps & { compact?: boolean }) {
  const sorted = buildExhibitorIndexRows(entries);
  if (sorted.length === 0) return null;

  const title = breedName ? `Exhibitor Index — ${breedName}` : 'Exhibitor Index';

  // Compact single-line layout: full dog particulars are already on each
  // class page, so the back-of-book index is a pure cross-reference. We
  // drop addresses entirely and pack ~70 exhibitors per A5 page (vs ~30
  // for the table layout).
  if (compact) {
    return (
      <Page size="A5" style={styles.frontMatterPage} wrap>
        <SectionBand title={title} />
        <Text style={{ fontFamily: 'Times', fontStyle: 'italic', fontSize: 7, color: C.textMedium, marginBottom: 6 }}>
          Cross-reference: full particulars for each dog appear on the class page indicated.
        </Text>
        {sorted.map((ex, idx) => {
          const cats = ex.catNos.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(', ');
          const cls = ex.classes.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(', ');
          return (
            <View
              key={idx}
              wrap={false}
              style={{ flexDirection: 'row', paddingVertical: 1.4, borderBottomWidth: 0.4, borderBottomColor: C.ruleLight, alignItems: 'baseline' }}
            >
              <Text style={{ fontFamily: 'Inter', fontSize: 6.7, fontWeight: 'bold', color: C.textDark, width: '38%', paddingRight: 4 }}>
                {ex.name}
              </Text>
              <Text style={{ fontFamily: 'Inter', fontSize: 6.7, color: C.textDark, width: '24%', paddingRight: 4 }}>
                {cats || '—'}
              </Text>
              <Text style={{ fontFamily: 'Inter', fontSize: 6.5, color: C.textMedium, flex: 1 }}>
                {cls ? `cl ${cls}` : ''}
              </Text>
            </View>
          );
        })}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}  ·  Generated by Remi`}
          fixed
        />
      </Page>
    );
  }

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

/** Trophies & Sponsorships front-matter page — compact table layout, plus a
 *  "With thanks for their kind donations" list for plain donors (Mandy
 *  2026-06-17). Renders if there are sponsorships OR donations. */
export function TrophiesPage({ show, sponsorships }: TrophiesPageProps) {
  const donations = show.donations ?? [];
  // The sponsorship TABLE is suppressed when sponsorships are shown inline with
  // the classes (skipTrophiesPage). Donations are independent of that — they
  // still get their "With Thanks" list whether or not the table renders.
  const showTrophyTable = sponsorships.length > 0 && !show.skipTrophiesPage;
  if (!showTrophyTable && donations.length === 0) return null;

  // Sort: numbered classes by classNumber, JH/unnumbered by classLabel, else name.
  const sorted = [...sponsorships].sort((a, b) => {
    if (a.classNumber != null && b.classNumber != null) return a.classNumber - b.classNumber;
    if (a.classNumber != null) return -1;
    if (b.classNumber != null) return 1;
    if (a.classLabel && b.classLabel) return a.classLabel.localeCompare(b.classLabel);
    return a.className.localeCompare(b.className);
  });

  return (
    <Page size="A5" style={styles.frontMatterPage} wrap>
      {showTrophyTable && (
        <>
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
            const label = sp.classLabel ?? (sp.classNumber != null ? String(sp.classNumber) : '');
            const classHeading = label
              ? `${label}. ${sp.className}`
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
                key={`${label}-${sp.className}-${idx}`}
                wrap={false}
                style={{
                  flexDirection: 'row',
                  paddingVertical: 2.5,
                  borderBottomWidth: 0.5,
                  borderBottomColor: C.ruleLight,
                }}
              >
                <Text style={{ fontFamily: 'Inter', fontSize: 7, fontWeight: 'bold', width: '30%', color: C.textDark }}>
                  {classHeading}
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
        </>
      )}

      {/* With Thanks — plain donors (name + optional affix, no amount). */}
      {donations.length > 0 && (
        <View style={{ marginTop: sponsorships.length > 0 ? 14 : 0 }}>
          {/* NOT wrap={false} on the whole block: the donor list is elastic
              and must flow across a page break (same reasoning as
              JurisdictionBlock). The band + intro use minPresenceAhead so
              they never strand alone at a page foot. */}
          <View minPresenceAhead={60}>
            <SectionBand title="With Thanks" />
            <Text style={{ fontFamily: 'Inter', fontSize: 8, color: C.textMedium, marginBottom: 5 }}>
              With thanks to the following for their kind donations:
            </Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {donations.map((d, i) => (
              <Text
                key={`donation-${i}`}
                style={{ width: '50%', fontFamily: 'Inter', fontSize: 8, color: C.textDark, marginBottom: 2.5, paddingRight: 6 }}
              >
                {d.name}{d.affix ? ` (${d.affix})` : ''}
              </Text>
            ))}
          </View>
        </View>
      )}

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

// ── Not For Competition Page (Mandy 2026-06-17) ─────────────────
//
// NFC entries are exhibited but don't compete for placings, so they carry
// no classes — which means the by-class grouping drops them entirely and
// they vanish from the catalogue despite holding a catalogue number. Mandy:
// "not for competition is not showing in the catalogue." This page lists
// every NFC dog (cat number, breed, owner) in its own back-of-book section,
// mirroring the per-entry layout used on the class pages. Returns null when
// the show has no NFC entries, so ordinary catalogues gain nothing.

export function NotForCompetitionPage({
  entries,
}: {
  entries: CatalogueEntry[];
}) {
  const nfc = entries
    .filter((e) => e.isNfc)
    .sort((a, b) =>
      (a.catalogueNumber ?? '').localeCompare(b.catalogueNumber ?? '', undefined, { numeric: true }),
    );
  if (nfc.length === 0) return null;

  return (
    <Page size="A5" style={styles.frontMatterPage} wrap>
      <SectionBand title="Not For Competition" />
      <Text style={{ fontFamily: 'Times', fontStyle: 'italic', fontSize: 8, color: C.textMedium, marginBottom: 8 }}>
        The following dogs are exhibited Not For Competition.
      </Text>
      {nfc.map((entry, idx) => {
        const meta = [
          entry.breed,
          entry.sex === 'dog' ? 'Dog' : entry.sex === 'bitch' ? 'Bitch' : null,
        ].filter(Boolean);
        return (
          <View
            key={idx}
            wrap={false}
            style={{ marginBottom: 4, paddingBottom: 3, borderBottomWidth: 0.5, borderBottomColor: C.ruleLight }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={styles.catalogueNumber}>{entry.catalogueNumber ?? '—'}</Text>
              <Text style={styles.dogName}>{uppercaseName(entry.dogName) || 'Unnamed'}</Text>
            </View>
            {meta.length > 0 && (
              <Text style={styles.entryDetail}>{meta.join('  ·  ')}</Text>
            )}
            {entry.owners.length > 0 && (
              <Text style={styles.entryDetail}>
                <Text style={styles.entryDetailLabel}>
                  Owner{entry.owners.length > 1 ? 's' : ''}:{' '}
                </Text>
                {formatOwnerKC(entry.owners, entry.withholdFromPublication)}
              </Text>
            )}
          </View>
        );
      })}
      <Text
        style={styles.footer}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}  ·  Generated by Remi`}
        fixed
      />
    </Page>
  );
}

// ── Principal Awards write-in page (Mandy 2026-06-17) ───────────
//
// Back-of-book results page. Once every class is judged the principal
// awards (Best of Breed, Challenge Certificates, Best Puppy in Show, …) are
// decided; this gives the secretary/steward a clean write-in line per award
// right after the classes. The list is show-type aware (championship shows
// list CCs + Reserve CCs) and is drawn from lib/best-awards — the same
// source the judges' book uses, so the two never drift. Any custom awards
// the secretary added are appended.

const bestsWriteInStyles = {
  row: {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    marginBottom: 13,
  },
  award: {
    fontFamily: 'Inter',
    fontSize: 9.5,
    fontWeight: 'bold' as const,
    color: C.textDark,
    width: '45%',
    paddingRight: 8,
  } as const,
  line: {
    flex: 1,
    borderBottomWidth: 0.75,
    borderBottomColor: C.textLight,
    borderBottomStyle: 'dotted' as const,
    height: 12,
  } as const,
};

export function BestsWriteInPage({ show }: FrontMatterProps) {
  const awards = buildBestAwards(show.showType, show.bestAwards ?? []);
  if (awards.length === 0) return null;

  return (
    <Page size="A5" style={styles.frontMatterPage} wrap>
      <SectionBand title="Best Awards" />
      <Text style={{ fontFamily: 'Times', fontStyle: 'italic', fontSize: 8, color: C.textMedium, marginBottom: 12 }}>
        To be completed as the principal awards are decided.
      </Text>
      {awards.map((award, i) => (
        <View key={i} style={bestsWriteInStyles.row} wrap={false}>
          <Text style={bestsWriteInStyles.award}>{award}</Text>
          <View style={bestsWriteInStyles.line} />
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
