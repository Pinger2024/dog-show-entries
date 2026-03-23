import { Document, Page, Text, View, StyleSheet, Font, Image } from '@react-pdf/renderer';
import path from 'path';
import type { ScheduleData } from '@/server/db/schema/shows';
import { formatCurrency } from '@/lib/date-utils';
import React from 'react';

// ── Font Registration ──────────────────────────────────────────────────────────
const fontsDir = path.join(process.cwd(), 'public', 'fonts');

Font.register({
  family: 'Times',
  fonts: [
    { src: path.join(fontsDir, 'times-new-roman.ttf') },
    { src: path.join(fontsDir, 'times-new-roman-bold.ttf'), fontWeight: 'bold' },
    { src: path.join(fontsDir, 'times-new-roman-italic.ttf'), fontStyle: 'italic' },
  ],
});

Font.register({
  family: 'LibreBaskerville',
  fonts: [
    { src: path.join(fontsDir, 'libre-baskerville-regular.ttf') },
    { src: path.join(fontsDir, 'libre-baskerville-bold.ttf'), fontWeight: 'bold' },
  ],
});

Font.register({
  family: 'Inter',
  fonts: [
    { src: path.join(fontsDir, 'inter-regular.ttf') },
    { src: path.join(fontsDir, 'inter-semibold.ttf'), fontWeight: 'bold' },
  ],
});

Font.registerHyphenationCallback((word) => [word]);

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ScheduleShowInfo {
  name: string;
  showType: string;
  showScope: string;
  date: string;
  endDate: string;
  startTime: string | null;
  entriesOpenDate: string | null;
  entryCloseDate: string | null;
  postalCloseDate: string | null;
  kcLicenceNo: string | null;
  secretaryEmail: string | null;
  secretaryName: string | null;
  secretaryAddress: string | null;
  secretaryPhone: string | null;
  showOpenTime: string | null;
  onCallVet: string | null;
  description: string | null;
  firstEntryFee: number | null;
  subsequentEntryFee: number | null;
  nfcEntryFee: number | null;
  acceptsPostalEntries: boolean;
  scheduleData: ScheduleData | null;
  organisation: {
    name: string;
    contactEmail: string | null;
    contactPhone: string | null;
    website: string | null;
    logoUrl: string | null;
  } | null;
  venue: {
    name: string;
    address: string | null;
    postcode: string | null;
  } | null;
}

export interface ScheduleClass {
  classNumber: number | null;
  className: string;
  classDescription: string | null;
  sex: string | null;
  breedName: string | null;
  classType?: string | null;
}

export interface ScheduleJudge {
  name: string;
  breeds: string[];
  sex?: string | null; // 'dog' | 'bitch' | null (both)
  /** Pre-formatted label for display, e.g. "Dogs — Mr A Winfrow" */
  displayLabel?: string;
}

export interface ScheduleSponsor {
  name: string;
  tier: string;
  customTitle: string | null;
  logoUrl: string | null;
  website: string | null;
  specialPrizes: string | null;
  classSponsorships: Array<{
    className: string;
    trophyName: string | null;
    trophyDonor: string | null;
    prizeDescription: string | null;
  }>;
}

// ── Colour Palette ─────────────────────────────────────────────────────────────

const C = {
  primary: '#2D5F3F',
  accent: '#B8963E',

  cardBg: '#F5F3EE',
  cardBorder: '#E5E0D5',

  textDark: '#1A1A1A',
  textMedium: '#4A4A4A',
  textLight: '#7A7A7A',
  textOnPrimary: '#FFFFFF',

  tableRowAlt: '#F5F3EE',

  warningBg: '#FFF8E1',
  warningBorder: '#D4A017',

  ruleLight: '#D4CFC5',
};

// ── Constants ──────────────────────────────────────────────────────────────────

const SHOW_TYPE_LABELS: Record<string, string> = {
  companion: 'Companion Show',
  primary: 'Primary Show',
  limited: 'Limited Show',
  open: 'Open Show',
  premier_open: 'Premier Open Show',
  championship: 'Championship Show',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', {
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

function getEstimationDate(closeDate: string | null): string | null {
  if (!closeDate) return null;
  const d = new Date(closeDate);
  d.setDate(d.getDate() - 7);
  return formatShortDate(d.toISOString());
}

function getDockingStatement(sd: ScheduleData | null): string {
  const country = sd?.country ?? 'england';
  const publicFee = sd?.publicAdmission !== false;

  if (publicFee && country === 'england') {
    return 'A dog docked on or after 6 April 2007 may not be entered for exhibition at this show.';
  }
  if (publicFee && country === 'wales') {
    return 'A dog docked on or after 28th March 2007 may not be entered for exhibition at this show.';
  }
  return 'Only undocked dogs and legally docked dogs may be entered for exhibition at this show.';
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // ── Cover page ──
  coverPage: {
    fontFamily: 'Inter',
    padding: 0,
    color: C.textDark,
  },
  coverTopBand: {
    backgroundColor: C.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  coverOrgName: {
    fontFamily: 'Inter',
    fontSize: 9,
    fontWeight: 'bold',
    color: C.textOnPrimary,
    textTransform: 'uppercase',
    letterSpacing: 3,
    textAlign: 'center',
  },
  coverContent: {
    paddingHorizontal: 30,
    paddingTop: 14,
    flex: 1,
    alignItems: 'center',
  },
  coverLogo: {
    width: 80,
    height: 80,
    marginBottom: 10,
  },
  coverShowName: {
    fontFamily: 'LibreBaskerville',
    fontSize: 17,
    fontWeight: 'bold',
    textAlign: 'center',
    color: C.textDark,
    marginBottom: 8,
  },
  coverBadge: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingVertical: 3,
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  coverBadgeText: {
    fontFamily: 'Inter',
    fontSize: 7.5,
    fontWeight: 'bold',
    color: C.textOnPrimary,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  coverClassCount: {
    fontFamily: 'Inter',
    fontSize: 8,
    color: C.textLight,
    marginBottom: 4,
  },
  coverRegulatory: {
    fontFamily: 'Times',
    fontSize: 7.5,
    fontStyle: 'italic',
    color: C.textMedium,
    textAlign: 'center',
    marginBottom: 2,
  },
  coverGoldRule: {
    width: '45%',
    height: 1.5,
    backgroundColor: C.accent,
    marginVertical: 8,
  },
  coverDetailCard: {
    width: '100%',
    backgroundColor: C.cardBg,
    borderRadius: 6,
    padding: '8 14',
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: C.accent,
  },
  coverDetailRow: {
    flexDirection: 'row',
    marginVertical: 1.5,
  },
  coverDetailLabel: {
    fontFamily: 'Inter',
    fontSize: 6.5,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: C.textLight,
    width: 58,
  },
  coverDetailValue: {
    fontFamily: 'Inter',
    fontSize: 8.5,
    color: C.textDark,
    flex: 1,
  },
  coverSectionLabel: {
    fontFamily: 'Inter',
    fontSize: 6.5,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: C.primary,
    marginBottom: 2,
  },
  coverSectionText: {
    fontFamily: 'Inter',
    fontSize: 8,
    color: C.textDark,
    lineHeight: 1.4,
  },
  coverDocking: {
    fontFamily: 'Times',
    fontSize: 7,
    fontStyle: 'italic',
    color: C.textMedium,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 10,
  },
  coverBottomBand: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: C.primary,
  },
  coverFooterText: {
    position: 'absolute',
    bottom: 10,
    left: 25,
    right: 25,
    fontFamily: 'Inter',
    fontSize: 7,
    color: C.primary,
    textAlign: 'center',
  },

  // ── Content pages ──
  page: {
    fontFamily: 'Inter',
    fontSize: 8.5,
    padding: '25 25 36 25',
    lineHeight: 1.4,
    color: C.textDark,
  },
  sectionBand: {
    backgroundColor: C.primary,
    marginTop: -25,
    marginHorizontal: -25,
    paddingVertical: 9,
    paddingHorizontal: 25,
    marginBottom: 14,
  },
  sectionBandText: {
    fontFamily: 'LibreBaskerville',
    fontSize: 11,
    fontWeight: 'bold',
    color: C.textOnPrimary,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  footer: {
    position: 'absolute',
    bottom: 12,
    left: 25,
    right: 25,
    borderTopWidth: 0.75,
    borderTopColor: C.primary,
    paddingTop: 4,
    textAlign: 'center',
    fontFamily: 'Inter',
    fontSize: 6,
    color: C.textLight,
  },

  // ── Info cards ──
  infoCard: {
    backgroundColor: C.cardBg,
    borderRadius: 6,
    padding: '8 12',
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: C.accent,
  },
  infoCardTitle: {
    fontFamily: 'Inter',
    fontSize: 7.5,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: C.primary,
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2.5,
    borderBottomWidth: 0.5,
    borderBottomColor: C.ruleLight,
  },
  infoRowNoBorder: {
    borderBottomWidth: 0,
  },
  infoLabel: {
    fontFamily: 'Inter',
    fontSize: 8.5,
    color: C.textMedium,
  },
  infoValue: {
    fontFamily: 'Inter',
    fontSize: 8.5,
    fontWeight: 'bold',
    color: C.textDark,
  },
  infoText: {
    fontFamily: 'Inter',
    fontSize: 8.5,
    color: C.textDark,
    lineHeight: 1.4,
  },

  // ── Judge table ──
  judgeRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: C.ruleLight,
  },
  judgeName: {
    fontFamily: 'Inter',
    fontSize: 8.5,
    fontWeight: 'bold',
    width: '35%',
    color: C.textDark,
  },
  judgeBreeds: {
    fontFamily: 'Inter',
    fontSize: 8.5,
    width: '65%',
    color: C.textMedium,
  },

  // ── Officials ──
  officialRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: C.ruleLight,
  },
  officialPosition: {
    fontFamily: 'Inter',
    fontSize: 8.5,
    fontWeight: 'bold',
    width: '35%',
    color: C.textDark,
  },
  officialName: {
    fontFamily: 'Inter',
    fontSize: 8.5,
    width: '65%',
    color: C.textMedium,
  },

  // ── Class table (all-breed) ──
  classTableHeader: {
    flexDirection: 'row',
    backgroundColor: C.primary,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  classTableHeaderText: {
    fontFamily: 'Inter',
    fontSize: 7,
    fontWeight: 'bold',
    color: C.textOnPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  classRow: {
    flexDirection: 'row',
    paddingVertical: 3.5,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: C.cardBorder,
  },
  classRowAlt: {
    backgroundColor: C.tableRowAlt,
  },
  colNo: { width: '10%' },
  colClass: { width: '40%' },
  colSex: { width: '18%' },
  colBreed: { width: '32%' },
  cellBold: {
    fontFamily: 'Inter',
    fontSize: 8,
    fontWeight: 'bold',
    color: C.textDark,
  },
  cell: {
    fontFamily: 'Inter',
    fontSize: 8,
    color: C.textDark,
  },
  cellMuted: {
    fontFamily: 'Inter',
    fontSize: 7.5,
    color: C.textLight,
  },

  // ── Class table (single breed — Dogs | Bitches two-column) ──
  twoColContainer: {
    flexDirection: 'row',
  },
  twoColHalf: {
    width: '50%',
  },
  twoColHeader: {
    backgroundColor: C.primary,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  twoColHeaderText: {
    fontFamily: 'Inter',
    fontSize: 8,
    fontWeight: 'bold',
    color: C.textOnPrimary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
  },
  twoColRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: C.cardBorder,
  },
  twoColRowAlt: {
    backgroundColor: C.tableRowAlt,
  },
  twoColNum: {
    fontFamily: 'Inter',
    fontSize: 8.5,
    fontWeight: 'bold',
    color: C.primary,
    width: 22,
  },
  twoColName: {
    fontFamily: 'Inter',
    fontSize: 8.5,
    color: C.textDark,
  },
  twoColMixedHeader: {
    backgroundColor: C.primary,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    marginTop: 10,
  },

  // ── Definitions ──
  defBlock: {
    marginBottom: 5,
  },
  defName: {
    fontFamily: 'Inter',
    fontSize: 8.5,
    fontWeight: 'bold',
    color: C.primary,
    marginBottom: 1,
  },
  defDescription: {
    fontFamily: 'Inter',
    fontSize: 7.5,
    color: C.textMedium,
    lineHeight: 1.35,
  },

  // ── Rules ──
  ruleText: {
    fontFamily: 'Times',
    fontSize: 7.5,
    lineHeight: 1.5,
    color: C.textDark,
    marginBottom: 3,
  },
  ruleTextBold: {
    fontFamily: 'Times',
    fontSize: 7.5,
    fontWeight: 'bold',
    lineHeight: 1.5,
  },
  ruleNumber: {
    fontFamily: 'Times',
    fontSize: 7.5,
    fontWeight: 'bold',
    color: C.primary,
  },
  warningBox: {
    backgroundColor: C.warningBg,
    borderRadius: 4,
    padding: '8 10',
    borderLeftWidth: 4,
    borderLeftColor: C.warningBorder,
    marginVertical: 6,
  },
  warningTitle: {
    fontFamily: 'Inter',
    fontSize: 8,
    fontWeight: 'bold',
    color: C.warningBorder,
    marginBottom: 3,
  },
  warningText: {
    fontFamily: 'Times',
    fontSize: 7.5,
    lineHeight: 1.5,
    color: C.textDark,
  },

  // ── Entry form ──
  formField: {
    flexDirection: 'row',
    marginBottom: 6,
    alignItems: 'flex-end',
  },
  formLabel: {
    fontFamily: 'Inter',
    fontSize: 7.5,
    fontWeight: 'bold',
    width: 90,
    color: C.textDark,
  },
  formLine: {
    flex: 1,
    borderBottomWidth: 0.5,
    borderBottomColor: C.textLight,
    height: 14,
  },
  formClassGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  formClassBox: {
    width: '18%',
    marginRight: '2%',
    marginBottom: 5,
    borderWidth: 0.5,
    borderColor: C.ruleLight,
    borderRadius: 3,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.cardBg,
  },
  formClassBoxLabel: {
    fontFamily: 'Inter',
    fontSize: 6,
    color: C.textLight,
  },
  formDeclaration: {
    backgroundColor: C.cardBg,
    borderRadius: 4,
    padding: '8 10',
    borderWidth: 0.5,
    borderColor: C.cardBorder,
    marginTop: 6,
  },
});

// ── Component Helpers ──────────────────────────────────────────────────────────

function SectionBand({ title }: { title: string }) {
  return (
    <View style={s.sectionBand}>
      <Text style={s.sectionBandText}>{title}</Text>
    </View>
  );
}

function InfoCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={s.infoCard} wrap={false}>
      {title && <Text style={s.infoCardTitle}>{title}</Text>}
      {children}
    </View>
  );
}

function GoldRule() {
  return <View style={s.coverGoldRule} />;
}

function Rule({ num, children }: { num: string; children: React.ReactNode }) {
  return (
    <Text style={s.ruleText}>
      <Text style={s.ruleNumber}>{num}.</Text> {children}
    </Text>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export type ScheduleFormat = 'standard' | 'compact' | 'booklet';

export function ShowSchedule({
  show,
  classes,
  judges,
  sponsors = [],
  format = 'standard',
}: {
  show: ScheduleShowInfo;
  classes: ScheduleClass[];
  judges: ScheduleJudge[];
  sponsors?: ScheduleSponsor[];
  format?: ScheduleFormat;
}) {
  const isCompact = format === 'compact';
  const isBooklet = format === 'booklet';
  const showTypeLabel = SHOW_TYPE_LABELS[show.showType] ?? show.showType;
  const showDate = show.endDate && show.endDate !== show.date
    ? `${formatDate(show.date)} — ${formatDate(show.endDate)}`
    : formatDate(show.date);
  // classCount is computed after deduplication (below) for accurate display
  const sd = show.scheduleData;
  const dockingStatement = getDockingStatement(sd);
  const estimationDate = getEstimationDate(show.entryCloseDate);

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

  // Split classes by sex for single breed two-column layout
  const isSingleBreed = show.showScope === 'single_breed';
  const dogClasses = deduplicatedClasses.filter((c) => c.sex === 'dog');
  const bitchClasses = deduplicatedClasses.filter((c) => c.sex === 'bitch');
  const mixedClasses = deduplicatedClasses.filter((c) => c.sex !== 'dog' && c.sex !== 'bitch');

  const footerRender = ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
    `${show.name}  ·  Schedule  ·  Page ${pageNumber} of ${totalPages}`;

  /* ── Compact format: 4-page condensed schedule for folded leaflets ── */
  if (isCompact) {
    return (
      <Document title={`Schedule — ${show.name}`} author="Remi Show Manager">
        {/* PAGE 1: Cover */}
        <Page size="A5" style={s.coverPage}>
          {show.organisation && (
            <View style={s.coverTopBand}>
              <Text style={s.coverOrgName}>{show.organisation.name}</Text>
            </View>
          )}
          {!show.organisation && <View style={{ height: 12 }} />}
          <View style={s.coverContent}>
            {show.organisation?.logoUrl && (
              <Image src={show.organisation.logoUrl} style={s.coverLogo} />
            )}
            <Text style={s.coverShowName}>{show.name}</Text>
            <View style={s.coverBadge}>
              <Text style={s.coverBadgeText}>{showTypeLabel}</Text>
            </View>
            <Text style={s.coverClassCount}>
              {classCount} Class{classCount !== 1 ? 'es' : ''}
            </Text>
            <Text style={s.coverRegulatory}>
              Held under Royal Kennel Club Rules &amp; Show Regulations F(1)
            </Text>
            <GoldRule />
            <View style={s.coverDetailCard}>
              <View style={s.coverDetailRow}>
                <Text style={s.coverDetailLabel}>Date</Text>
                <Text style={s.coverDetailValue}>{showDate}</Text>
              </View>
              {show.venue && (
                <View style={s.coverDetailRow}>
                  <Text style={s.coverDetailLabel}>Venue</Text>
                  <Text style={s.coverDetailValue}>
                    {show.venue.name}
                    {show.venue.address ? `, ${show.venue.address}` : ''}
                    {show.venue.postcode ? ` ${show.venue.postcode}` : ''}
                  </Text>
                </View>
              )}
              {judges.length > 0 && (
                <View style={s.coverDetailRow}>
                  <Text style={s.coverDetailLabel}>{judges.length === 1 ? 'Judge' : 'Judges'}</Text>
                  <Text style={s.coverDetailValue}>
                    {judges.map((j) => j.displayLabel ?? j.name).join(', ')}
                  </Text>
                </View>
              )}
              {show.startTime && (
                <View style={s.coverDetailRow}>
                  <Text style={s.coverDetailLabel}>Judging</Text>
                  <Text style={s.coverDetailValue}>{formatTime(show.startTime)}</Text>
                </View>
              )}
              {show.showOpenTime && (
                <View style={s.coverDetailRow}>
                  <Text style={s.coverDetailLabel}>Opens</Text>
                  <Text style={s.coverDetailValue}>{formatTime(show.showOpenTime)}</Text>
                </View>
              )}
              {show.kcLicenceNo && (
                <View style={s.coverDetailRow}>
                  <Text style={s.coverDetailLabel}>Licence</Text>
                  <Text style={s.coverDetailValue}>{show.kcLicenceNo}</Text>
                </View>
              )}
            </View>
            {(show.secretaryName || show.secretaryEmail) && (
              <View style={{ ...s.coverDetailCard, borderLeftColor: C.primary }}>
                <Text style={s.coverSectionLabel}>Show Secretary</Text>
                {show.secretaryName && <Text style={s.coverSectionText}>{show.secretaryName}</Text>}
                {show.secretaryPhone && <Text style={s.coverSectionText}>Tel: {show.secretaryPhone}</Text>}
                {show.secretaryEmail && <Text style={s.coverSectionText}>{show.secretaryEmail}</Text>}
              </View>
            )}
            <GoldRule />
            <Text style={s.coverDocking}>{dockingStatement}</Text>
            <Text style={s.coverFooterText}>Enter online at remishowmanager.co.uk</Text>
          </View>
          <View style={s.coverBottomBand} />
        </Page>

        {/* PAGE 2: Entry Fees + Key Info */}
        <Page size="A5" style={s.page}>
          <SectionBand title="Entry Information" />
          {(show.firstEntryFee != null || show.subsequentEntryFee != null) && (
            <InfoCard title="Entry Fees">
              {show.firstEntryFee != null && (
                <View style={s.infoRow}>
                  <Text style={s.infoLabel}>First entry</Text>
                  <Text style={s.infoValue}>{formatCurrency(show.firstEntryFee)}</Text>
                </View>
              )}
              {show.subsequentEntryFee != null && (
                <View style={s.infoRow}>
                  <Text style={s.infoLabel}>Subsequent (same dog)</Text>
                  <Text style={s.infoValue}>{formatCurrency(show.subsequentEntryFee)}</Text>
                </View>
              )}
              {show.nfcEntryFee != null && (
                <View style={s.infoRow}>
                  <Text style={s.infoLabel}>Not for Competition</Text>
                  <Text style={s.infoValue}>{formatCurrency(show.nfcEntryFee)}</Text>
                </View>
              )}
            </InfoCard>
          )}
          <InfoCard title="Key Dates">
            {show.entriesOpenDate && (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Entries open</Text>
                <Text style={s.infoValue}>{formatShortDate(show.entriesOpenDate)}</Text>
              </View>
            )}
            {show.entryCloseDate && (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>Entries close</Text>
                <Text style={s.infoValue}>{formatShortDate(show.entryCloseDate)}</Text>
              </View>
            )}
          </InfoCard>
          {show.onCallVet && (
            <View style={{ marginBottom: 4 }}>
              <Text style={{ fontFamily: 'Inter', fontSize: 7, fontWeight: 'bold', color: C.textDark }}>On-Call Vet</Text>
              <Text style={{ fontFamily: 'Inter', fontSize: 7, color: C.textMedium }}>{show.onCallVet}</Text>
            </View>
          )}
          {sd?.officers && sd.officers.length > 0 && (
            <InfoCard title="Officials">
              {sd.officers.map((o, i) => (
                <View key={i} style={s.officialRow}>
                  <Text style={s.officialPosition}>{o.position}</Text>
                  <Text style={s.officialName}>{o.name}</Text>
                </View>
              ))}
            </InfoCard>
          )}
          <Text style={s.footer} render={footerRender} fixed />
        </Page>

        {/* PAGE 3: Classes */}
        <Page size="A5" style={s.page}>
          <SectionBand title={isSingleBreed ? 'Classification' : 'Schedule of Classes'} />
          {isSingleBreed && judges.length > 0 && (
            <View style={{ marginBottom: 8 }}>
              {judges.map((judge, i) => (
                <Text key={i} style={{ fontFamily: 'Inter', fontSize: 8, fontWeight: 'bold', textAlign: 'center', color: C.textDark }}>
                  JUDGE: {judge.displayLabel ?? judge.name}
                </Text>
              ))}
            </View>
          )}
          {isSingleBreed ? (
            <View style={s.twoColContainer}>
              <View style={[s.twoColHalf, { paddingRight: 4 }]}>
                <View style={s.twoColHeader}><Text style={s.twoColHeaderText}>Dog</Text></View>
                {dogClasses.map((cls, i) => (
                  <View key={i} style={[s.twoColRow, i % 2 !== 0 && s.twoColRowAlt]} wrap={false}>
                    <Text style={s.twoColNum}>{cls.classNumber ?? ''}</Text>
                    <Text style={s.twoColName}>{cls.className}</Text>
                  </View>
                ))}
              </View>
              <View style={[s.twoColHalf, { paddingLeft: 4 }]}>
                <View style={s.twoColHeader}><Text style={s.twoColHeaderText}>Bitch</Text></View>
                {bitchClasses.map((cls, i) => (
                  <View key={i} style={[s.twoColRow, i % 2 !== 0 && s.twoColRowAlt]} wrap={false}>
                    <Text style={s.twoColNum}>{cls.classNumber ?? ''}</Text>
                    <Text style={s.twoColName}>{cls.className}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <View style={s.classTable}>
              <View style={s.classHeaderRow}>
                <Text style={[s.classHeaderCell, { width: 28 }]}>No</Text>
                <Text style={[s.classHeaderCell, { flex: 1 }]}>Class</Text>
                <Text style={[s.classHeaderCell, { width: 40 }]}>Sex</Text>
                <Text style={[s.classHeaderCell, { width: 80 }]}>Breed</Text>
              </View>
              {deduplicatedClasses.map((cls, i) => (
                <View key={i} style={[s.classRow, i % 2 !== 0 && s.classRowAlt]} wrap={false}>
                  <Text style={[s.classCell, { width: 28 }]}>{cls.classNumber ?? ''}</Text>
                  <Text style={[s.classCell, { flex: 1 }]}>{cls.className}</Text>
                  <Text style={[s.classCell, { width: 40 }]}>{cls.sex === 'dog' ? 'Dog' : cls.sex === 'bitch' ? 'Bitch' : ''}</Text>
                  <Text style={[s.classCell, { width: 80 }]}>{cls.breedName ?? ''}</Text>
                </View>
              ))}
            </View>
          )}
          {mixedClasses.length > 0 && isSingleBreed && (
            <View>
              <View style={s.twoColMixedHeader}><Text style={s.twoColHeaderText}>Mixed</Text></View>
              {mixedClasses.map((cls, i) => (
                <View key={i} style={[s.twoColRow, i % 2 !== 0 && s.twoColRowAlt]} wrap={false}>
                  <Text style={s.twoColNum}>{cls.classNumber ?? ''}</Text>
                  <Text style={s.twoColName}>{cls.className}</Text>
                </View>
              ))}
            </View>
          )}
          <Text style={s.footer} render={footerRender} fixed />
        </Page>

        {/* PAGE 4: Condensed Rules + Key Definitions */}
        <Page size="A5" style={s.page}>
          <SectionBand title="Rules &amp; Class Definitions" />
          <Text style={{ fontFamily: 'Inter', fontSize: 6.5, color: C.textMedium, marginBottom: 6, lineHeight: 1.4 }}>
            This show is held under Royal Kennel Club Rules and Show Regulations F(1).
            {show.showOpenTime ? ` Show opens at ${formatTime(show.showOpenTime)}.` : ''}
            {show.startTime ? ` Judging commences at ${formatTime(show.startTime)}.` : ''}
            {' '}Exhibits may be removed after their judging has been completed. The show will close half an hour after all judging has been completed.
            {' '}The Committee reserves the right to refuse any entries. No dog under 6 calendar months of age is eligible. The mating of bitches within the precincts of the show is forbidden.
            {' '}All exhibitors must be familiar with RKC Regulation F (Annex B) Regulations for the Preparation of Dogs for Exhibition.
            {' '}ONLINE ENTRY at remishowmanager.co.uk
          </Text>

          <View style={{ borderBottomWidth: 0.5, borderBottomColor: C.ruleLight, marginBottom: 6 }} />

          <Text style={{ fontFamily: 'Inter', fontSize: 7, fontWeight: 'bold', color: C.primary, marginBottom: 4 }}>
            Class Definitions
          </Text>
          {[
            ['MINOR PUPPY', '6 and not exceeding 9 calendar months of age.'],
            ['PUPPY', '6 and not exceeding 12 calendar months of age.'],
            ['JUNIOR', '6 and not exceeding 18 calendar months of age.'],
            ['NOVICE', 'Not won a CC/CACIB/CAC/Green Star or 3+ first prizes at Open/Championship Shows.'],
            ['YEARLING', '12 and not exceeding 24 calendar months of age.'],
            ['GRADUATE', 'Not won a CC or 4+ firsts at Championship Shows in Graduate and above.'],
            ['POST GRADUATE', 'Not won a CC or 5+ firsts at Championship Shows in Post Graduate and above.'],
            ['LIMIT', 'Not a Show Champion, or won 3+ CCs, or 7+ firsts in Limit/Open at Championship Shows.'],
            ['OPEN', 'For all dogs of the breeds for which the class is provided.'],
            ['VETERAN', 'Not less than 7 years of age.'],
          ].map(([name, desc], i) => (
            <View key={i} style={{ flexDirection: 'row', marginBottom: 1.5 }}>
              <Text style={{ fontFamily: 'Inter', fontSize: 6, fontWeight: 'bold', color: C.textDark, width: 65 }}>{name}:</Text>
              <Text style={{ fontFamily: 'Inter', fontSize: 6, color: C.textMedium, flex: 1 }}>{desc}</Text>
            </View>
          ))}

          <View style={s.warningBox} wrap={false}>
            <Text style={s.warningTitle}>WARNING</Text>
            <Text style={s.warningText}>
              IF YOUR DOG IS FOUND TO BE AT RISK FORCIBLE ENTRY TO YOUR VEHICLE MAY BE NECESSARY WITHOUT LIABILITY FOR ANY DAMAGE CAUSED.
            </Text>
          </View>
          <Text style={s.footer} render={footerRender} fixed />
        </Page>
      </Document>
    );
  }

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

          {/* Show name */}
          <Text style={s.coverShowName}>{show.name}</Text>

          {/* Show type badge */}
          <View style={s.coverBadge}>
            <Text style={s.coverBadgeText}>{showTypeLabel}</Text>
          </View>

          {/* Class count */}
          <Text style={s.coverClassCount}>
            {classCount} Class{classCount !== 1 ? 'es' : ''}
          </Text>

          {/* RKC jurisdiction */}
          <Text style={s.coverRegulatory}>
            Held under Royal Kennel Club Rules &amp; Show Regulations F(1)
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
                  {show.venue.name}
                  {show.venue.address ? `, ${show.venue.address}` : ''}
                  {show.venue.postcode ? ` ${show.venue.postcode}` : ''}
                </Text>
              </View>
            )}
            {judges.length > 0 && (
              <View style={s.coverDetailRow}>
                <Text style={s.coverDetailLabel}>Judge</Text>
                <Text style={s.coverDetailValue}>
                  {judges.map((j) => j.name).join(', ')}
                </Text>
              </View>
            )}
            {show.startTime && (
              <View style={s.coverDetailRow}>
                <Text style={s.coverDetailLabel}>Judging</Text>
                <Text style={s.coverDetailValue}>{formatTime(show.startTime)}</Text>
              </View>
            )}
            {show.showOpenTime && (
              <View style={s.coverDetailRow}>
                <Text style={s.coverDetailLabel}>Opens</Text>
                <Text style={s.coverDetailValue}>{formatTime(show.showOpenTime)}</Text>
              </View>
            )}
            {sd?.latestArrivalTime && (
              <View style={s.coverDetailRow}>
                <Text style={s.coverDetailLabel}>Dogs by</Text>
                <Text style={s.coverDetailValue}>{sd.latestArrivalTime}</Text>
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

          {/* Custom statements — prominently on cover page */}
          {sd?.customStatements && sd.customStatements.length > 0 && (
            <View style={{ width: '100%', marginTop: 6, marginBottom: 2, paddingHorizontal: 8 }}>
              {sd.customStatements.map((statement, i) => (
                <Text key={i} style={{
                  fontFamily: 'Inter',
                  fontSize: 7.5,
                  fontWeight: 'bold',
                  color: C.textDark,
                  textAlign: 'center',
                  textTransform: 'uppercase',
                  marginTop: i > 0 ? 3 : 0,
                }}>
                  {statement}
                </Text>
              ))}
            </View>
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

          {/* Online entries link */}
          <Text style={s.coverFooterText}>
            Enter online at remishowmanager.co.uk
          </Text>
        </View>

        {/* Green bottom band */}
        <View style={s.coverBottomBand} />
      </Page>

      {/* ════════════════════════════════════════════════════════════════════════
          ENTRY INFORMATION
          ════════════════════════════════════════════════════════════════════ */}
      <Page size="A5" style={s.page}>
        <SectionBand title="Entry Information" />

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
                <Text style={s.infoLabel}>Subsequent entry (same owner)</Text>
                <Text style={s.infoValue}>{formatCurrency(show.subsequentEntryFee)}</Text>
              </View>
            )}
            {show.nfcEntryFee != null && (
              <View style={[s.infoRow, s.infoRowNoBorder]}>
                <Text style={s.infoLabel}>Not for Competition</Text>
                <Text style={s.infoValue}>{formatCurrency(show.nfcEntryFee)}</Text>
              </View>
            )}
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
              <Text style={s.infoValue}>{sd.latestArrivalTime}</Text>
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
          </InfoCard>
        )}

        {/* Judges */}
        {judges.length > 0 && (
          <InfoCard title="Judges">
            {judges.map((judge, i) => (
              <View key={i} style={s.judgeRow}>
                <Text style={s.judgeName}>{judge.name}</Text>
                <Text style={s.judgeBreeds}>
                  {judge.breeds.length > 0 ? judge.breeds.join(', ') : 'All breeds'}
                </Text>
              </View>
            ))}
          </InfoCard>
        )}

        {/* Online entries */}
        <InfoCard title="Online Entries">
          <Text style={s.infoText}>Enter online at remishowmanager.co.uk</Text>
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
      {(sd?.officers?.length || sd?.guarantors?.length) && (
        <Page size="A5" style={s.page}>
          <SectionBand title="Officials" />

          {sd?.officers && sd.officers.length > 0 && (
            <InfoCard title="Officers &amp; Committee">
              {sd.officers.map((o, i) => (
                <View key={i} style={s.officialRow}>
                  <Text style={s.officialPosition}>{o.position}</Text>
                  <Text style={s.officialName}>{o.name}</Text>
                </View>
              ))}
            </InfoCard>
          )}

          {sd?.guarantors && sd.guarantors.length > 0 && (
            <InfoCard title="Guarantors to the Royal Kennel Club">
              {sd.guarantors.map((g, i) => (
                <View key={i} style={s.officialRow}>
                  <Text style={s.officialPosition}>{g.name}</Text>
                  {g.address && <Text style={s.officialName}>{g.address}</Text>}
                </View>
              ))}
            </InfoCard>
          )}

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
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          SPONSORS & ACKNOWLEDGEMENTS
          ════════════════════════════════════════════════════════════════════ */}
      {sponsors.length > 0 && (
        <Page size="A5" style={s.page}>
          <SectionBand title="Sponsors &amp; Acknowledgements" />

          <View style={{ marginBottom: 8 }}>
            <Text style={{ fontFamily: 'Times', fontStyle: 'italic', fontSize: 8, color: C.textMedium, textAlign: 'center' }}>
              The committee gratefully acknowledges the support of the following sponsors.
            </Text>
          </View>

          {sponsors.filter((sp) => sp.tier === 'title' || sp.tier === 'show').length > 0 && (
            <InfoCard title="Show Sponsors">
              {sponsors
                .filter((sp) => sp.tier === 'title' || sp.tier === 'show')
                .map((sp, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: 'Inter', fontWeight: 'bold', fontSize: 9, color: C.textDark }}>
                        {sp.name}
                      </Text>
                      {sp.customTitle && (
                        <Text style={{ fontFamily: 'Inter', fontSize: 7, color: C.textMedium }}>
                          {sp.customTitle}
                        </Text>
                      )}
                      {sp.website && (
                        <Text style={{ fontFamily: 'Inter', fontSize: 6.5, color: C.textLight }}>
                          {sp.website}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
            </InfoCard>
          )}

          {sponsors.filter((sp) => sp.classSponsorships.length > 0).length > 0 && (
            <InfoCard title="Class Sponsors &amp; Trophies">
              {sponsors
                .filter((sp) => sp.classSponsorships.length > 0)
                .flatMap((sp) =>
                  sp.classSponsorships.map((cs, j) => (
                    <View key={`${sp.name}-${j}`} style={{ marginBottom: 4 }}>
                      <Text style={{ fontFamily: 'Inter', fontSize: 8, color: C.textDark }}>
                        <Text style={{ fontWeight: 'bold' }}>{cs.className}</Text>
                        {' — sponsored by '}
                        {sp.name}
                      </Text>
                      {cs.trophyName && (
                        <Text style={{ fontFamily: 'Times', fontStyle: 'italic', fontSize: 7.5, color: C.accent, marginLeft: 8 }}>
                          {cs.trophyName}
                          {cs.trophyDonor ? ` (donated by ${cs.trophyDonor})` : ''}
                        </Text>
                      )}
                      {cs.prizeDescription && (
                        <Text style={{ fontFamily: 'Inter', fontSize: 7, color: C.textLight, marginLeft: 8 }}>
                          {cs.prizeDescription}
                        </Text>
                      )}
                    </View>
                  ))
                )}
            </InfoCard>
          )}

          {sponsors.filter((sp) => sp.specialPrizes).length > 0 && (
            <InfoCard title="Special Prizes">
              {sponsors
                .filter((sp) => sp.specialPrizes)
                .map((sp, i) => (
                  <View key={i} style={{ marginBottom: 3 }}>
                    <Text style={{ fontFamily: 'Inter', fontSize: 8, color: C.textDark }}>
                      <Text style={{ fontWeight: 'bold' }}>{sp.name}</Text>
                      {' — '}
                      {sp.specialPrizes}
                    </Text>
                  </View>
                ))}
            </InfoCard>
          )}

          <Text style={s.footer} render={footerRender} fixed />
        </Page>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          SCHEDULE OF CLASSES
          ════════════════════════════════════════════════════════════════════ */}
      <Page size="A5" style={s.page}>
        <SectionBand title={isSingleBreed ? 'Classification' : 'Schedule of Classes'} />

        {/* Judge name(s) above the table for single breed shows */}
        {isSingleBreed && judges.length > 0 && (
          <View style={{ marginBottom: 10 }}>
            {judges.map((judge, i) => (
              <Text key={i} style={{ fontFamily: 'Inter', fontSize: 9, fontWeight: 'bold', textAlign: 'center', color: C.textDark, marginBottom: 2 }}>
                JUDGE: {judge.name}
              </Text>
            ))}
          </View>
        )}

        {isSingleBreed ? (
          /* ── Single breed: Dogs | Bitches two-column layout ── */
          <>
            <View style={s.twoColContainer}>
              {/* Dogs column */}
              <View style={[s.twoColHalf, { paddingRight: 4 }]}>
                <View style={s.twoColHeader}>
                  <Text style={s.twoColHeaderText}>Dog</Text>
                </View>
                {dogClasses.map((cls, i) => (
                  <View key={i} style={[s.twoColRow, i % 2 !== 0 && s.twoColRowAlt]} wrap={false}>
                    <Text style={s.twoColNum}>{cls.classNumber ?? ''}</Text>
                    <Text style={s.twoColName}>{cls.className}</Text>
                  </View>
                ))}
              </View>

              {/* Bitches column */}
              <View style={[s.twoColHalf, { paddingLeft: 4 }]}>
                <View style={s.twoColHeader}>
                  <Text style={s.twoColHeaderText}>Bitch</Text>
                </View>
                {bitchClasses.map((cls, i) => (
                  <View key={i} style={[s.twoColRow, i % 2 !== 0 && s.twoColRowAlt]} wrap={false}>
                    <Text style={s.twoColNum}>{cls.classNumber ?? ''}</Text>
                    <Text style={s.twoColName}>{cls.className}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Mixed classes below (e.g. Junior Handler) */}
            {mixedClasses.length > 0 && (
              <View>
                <View style={s.twoColMixedHeader}>
                  <Text style={s.twoColHeaderText}>Mixed</Text>
                </View>
                {mixedClasses.map((cls, i) => (
                  <View key={i} style={[s.twoColRow, i % 2 !== 0 && s.twoColRowAlt]} wrap={false}>
                    <Text style={s.twoColNum}>{cls.classNumber ?? ''}</Text>
                    <Text style={s.twoColName}>{cls.className}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        ) : (
          /* ── All-breed: table with No, Class, Sex, Breed (no description) ── */
          <>
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

            {deduplicatedClasses.map((cls, i) => {
              const sexLabel = cls.sex === 'dog' ? 'Dogs' : cls.sex === 'bitch' ? 'Bitches' : 'Mixed';
              return (
                <View key={i} style={[s.classRow, i % 2 !== 0 && s.classRowAlt]} wrap={false}>
                  <View style={s.colNo}>
                    <Text style={s.cellBold}>{cls.classNumber ?? ''}</Text>
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
            })}
          </>
        )}

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

        {/* Class definitions */}
        <View style={s.defBlock} wrap={false}>
          <Text style={s.defName}>MINOR PUPPY:</Text>
          <Text style={s.defDescription}>For dogs of 6 and not exceeding 9 calendar months of age on the first day of the show.</Text>
        </View>
        <View style={s.defBlock} wrap={false}>
          <Text style={s.defName}>PUPPY:</Text>
          <Text style={s.defDescription}>For dogs of 6 and not exceeding 12 calendar months of age on the first day of the show.</Text>
        </View>
        <View style={s.defBlock} wrap={false}>
          <Text style={s.defName}>JUNIOR:</Text>
          <Text style={s.defDescription}>For dogs of 6 and not exceeding 18 calendar months of age on the first day of the show.</Text>
        </View>
        <View style={s.defBlock} wrap={false}>
          <Text style={s.defName}>NOVICE:</Text>
          <Text style={s.defDescription}>For dogs which have not won a Challenge Certificate/CACIB/CAC/Green Star or three or more First Prizes at Open and Championship Shows (Minor Puppy, Special Minor Puppy, Puppy and Special Puppy classes excepted, whether restricted or not).</Text>
        </View>
        <View style={s.defBlock} wrap={false}>
          <Text style={s.defName}>YEARLING:</Text>
          <Text style={s.defDescription}>For dogs of twelve and not exceeding twenty four calendar months of age on the first day of the Show.</Text>
        </View>
        <View style={s.defBlock} wrap={false}>
          <Text style={s.defName}>GRADUATE:</Text>
          <Text style={s.defDescription}>For dogs which have not won a Challenge Certificate/CACIB/CAC/Green Star or four or more First Prizes at Championship Shows in Graduate, Post Graduate, Minor Limit, Mid Limit, Limit and Open Classes, whether restricted or not, where Challenge Certificates were offered for the breed.</Text>
        </View>
        <View style={s.defBlock} wrap={false}>
          <Text style={s.defName}>POST GRADUATE:</Text>
          <Text style={s.defDescription}>For dogs which have not won a Challenge Certificate/CACIB/CAC/Green Star or five or more First Prizes at Championship Shows in Post Graduate, Minor Limit, Mid Limit, Limit and Open Classes, whether restricted or not, where Challenge Certificates were offered for the breed.</Text>
        </View>
        <View style={s.defBlock} wrap={false}>
          <Text style={s.defName}>LIMIT:</Text>
          <Text style={s.defDescription}>For dogs which have not become Show Champions under Royal Kennel Club Regulations or under the rules of any governing body recognised by the Royal Kennel Club or won 3 or more CC/CACIB/CAC/Green Stars or won 7 or more First prizes in all at Championship Shows in Limit and Open classes, confined to the breed, whether restricted or not at shows where Challenge Certificates were offered for the breed.</Text>
        </View>
        <View style={s.defBlock} wrap={false}>
          <Text style={s.defName}>OPEN:</Text>
          <Text style={s.defDescription}>For all dogs of the breeds for which the class is provided and eligible for entry at the Show.</Text>
        </View>
        <View style={s.defBlock} wrap={false}>
          <Text style={s.defName}>VETERAN:</Text>
          <Text style={s.defDescription}>For dogs of not less than 7 years of age on the first day of the Show.</Text>
        </View>
        <View style={s.defBlock} wrap={false}>
          <Text style={s.defName}>NOT FOR COMPETITION:</Text>
          <Text style={s.defDescription}>Dogs may be entered for Not for Competition, such entries must be recorded on the entry form enclosed for the purpose.</Text>
        </View>

        <Text style={s.footer} render={footerRender} fixed />
      </Page>

      {/* ════════════════════════════════════════════════════════════════════════
          RULES AND REGULATIONS
          ════════════════════════════════════════════════════════════════════ */}
      <Page size="A5" style={s.page}>
        <SectionBand title="Rules and Regulations" />

        {show.showOpenTime && (
          <Rule num="1">The show will open at {formatTime(show.showOpenTime)}.</Rule>
        )}
        <Rule num="2">
          {sd?.isBenched
            ? `Dogs will be benched${sd.benchingRemovalTime ? `. ${sd.benchingRemovalTime}` : ' and may be removed after Best in Show judging has been completed'}.`
            : 'Dogs will not be benched at any time but it is the exhibitor\u2019s responsibility to ensure that exhibits are available for judging.'}
        </Rule>
        {show.startTime && (
          <Rule num="3">Judging will commence {formatTime(show.startTime)}.</Rule>
        )}
        <Rule num="4">Exhibits may be removed from the Show after their judging has been completed. The Show will close half an hour after all judging has been completed.</Rule>
        {(show.firstEntryFee != null || show.subsequentEntryFee != null || show.nfcEntryFee != null) && (
          <Rule num="5">
            ENTRY FEES: {show.firstEntryFee != null ? `${formatCurrency(show.firstEntryFee)} first entry` : ''}
            {show.subsequentEntryFee != null ? `, subsequent entries same dog ${formatCurrency(show.subsequentEntryFee)}` : ''}
            {show.nfcEntryFee != null ? `. NFC ${formatCurrency(show.nfcEntryFee)}` : ''}.
          </Rule>
        )}
        <Rule num="6">ONLINE ENTRY can be found at remishowmanager.co.uk</Rule>
        <Rule num="7">The Committee reserves to itself the right to refuse any entries.</Rule>
        <Rule num="8">No dog under 6 calendar months of age on the first day of the Show is eligible for exhibition.</Rule>
        <Rule num="9">The mating of bitches within the precincts of the Show is forbidden.</Rule>
        <Text style={s.ruleText}>
          <Text style={s.ruleNumber}>10.</Text> <Text style={s.ruleTextBold}>Best Puppy in Show:</Text> Where a Best Puppy in Show competition is scheduled the Best Puppy in Show is a puppy which has competed and is unbeaten by any other puppy exhibited at the show. A puppy is a dog of six and not exceeding twelve calendar months of age on the first day of the show.
        </Text>
        <Rule num="11">A Baby Puppy is a dog of four and less than six calendar months of age on the first day of the show. Baby Puppy classes may be scheduled at any breed Club show, Best Baby Puppy in Breed may be declared at each breed from the dogs entered in the Baby Puppy class. There must be no progression to further competitions.</Rule>
        <Rule num="12">In Best in Show the exhibits may be selected from the exhibits declared Best of Sex. If a Reserve Best in Show is to be selected, the eligible dogs are those declared Best of Sex, Opposite Best of Sex of the exhibit declared Best in Show.</Rule>
        <Rule num="13">Exhibits will not be admitted to Best in Show competition after a period of ten minutes has elapsed since the announcement that exhibits are required for judging, unless they have been unavoidably delayed by previous judging not being completed on time, and then only with the special permission of the Show Management.</Rule>
        <Rule num="14">Exhibitors must not pick up dogs by their tails and leads. When lifting dogs not handle in a rough manner.</Rule>
        <Rule num="15">All exhibitors must be familiar with Royal Kennel Club Regulation F (Annex B) Regulations for the Preparation of Dogs for Exhibition.</Rule>
        <Rule num="16">All dogs resident outside the UK must be issued with a Royal Kennel Club Authority to Compete number before entry to the show/event can be made. All singles must be resident within the UK. A single entry for an overseas exhibit must be accompanied by a copy of the dog&apos;s official export pedigree.</Rule>

        {/* Dogs in vehicles WARNING */}
        <View style={s.warningBox} wrap={false}>
          <Text style={s.warningTitle}>WARNING</Text>
          <Text style={s.warningText}>
            IF YOUR DOG IS FOUND TO BE AT RISK FORCIBLE ENTRY TO YOUR VEHICLE MAY BE NECESSARY WITHOUT LIABILITY FOR ANY DAMAGE CAUSED.
          </Text>
        </View>

        <Rule num="17">Anyone whose dog is entered at a Royal Kennel Club licensed event should take all reasonable steps to ensure the needs of their dog(s) are met and should not put a dog&apos;s health and welfare at risk by any action, default, omission or otherwise. Breach of Royal Kennel Club Regulations in this respect may be referred to the Board for disciplinary action under the Royal Kennel Club Rules and Regulations. The use of pinch collars, electronic shock collars, or prong collars, is not permitted at any show licensed by the Royal Kennel Club. This shall apply at the venue or within the precincts of the show.</Rule>
        <Text style={s.ruleText}>
          <Text style={s.ruleNumber}>18.</Text> <Text style={s.ruleTextBold}>Not for Competition:</Text> Not for Competition entries are accepted. Details of each dog so entered must be recorded on the entry form and must be Royal Kennel Club registered.
        </Text>
        <Rule num="19">No modifications will be made to the schedule except by permission of the Board of the Royal Kennel Club, which will be followed by advertisement in the Canine press wherever possible.</Rule>
        <Rule num="20">An exhibitor or competitor should ensure that contact details for any handler are available and must be provided upon request in any investigation of a breach of this regulation by such handler.</Rule>

        {/* Custom statements now appear on the cover page for prominence */}

        <Text style={s.footer} render={footerRender} fixed />
      </Page>

      {/* ════════════════════════════════════════════════════════════════════════
          ADDITIONAL RULES AND REGULATIONS (skipped in booklet format)
          ════════════════════════════════════════════════════════════════════ */}
      {!isBooklet && <Page size="A5" style={s.page}>
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
          REGULATIONS FOR PREPARATION F(B) (skipped in booklet format)
          ════════════════════════════════════════════════════════════════════ */}
      {!isBooklet && <Page size="A5" style={s.page}>
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
      {show.acceptsPostalEntries && !isBooklet && (
        <Page size="A5" style={s.page}>
          <SectionBand title="Entry Form" />

          <Text style={{ fontFamily: 'Inter', fontSize: 7, color: C.textLight, marginBottom: 8, textAlign: 'center' }}>
            Enter online at remishowmanager.co.uk — or complete this form and post to the show secretary
          </Text>

          <Text style={{ fontFamily: 'Inter', fontSize: 8.5, fontWeight: 'bold', marginBottom: 8, color: C.primary }}>
            {show.organisation?.name} — {show.name} — {formatShortDate(show.date)}
          </Text>

          {/* Owner details */}
          <View style={s.formField}>
            <Text style={s.formLabel}>Owner(s) Name</Text>
            <View style={s.formLine} />
          </View>
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

          {/* Declaration */}
          <View style={s.formDeclaration}>
            <Text style={{ fontFamily: 'Times', fontSize: 6.5, lineHeight: 1.5, color: C.textMedium }}>
              I/We agree to submit to and be bound by Royal Kennel Club Rules and Show Regulations F(1)
              in their present form or as they may be amended from time to time. I/We also agree to
              submit to the regulations of this show and not to bring to the show any dog which has
              contracted or been knowingly exposed to any infectious or contagious disease during the
              21 days prior to the show. I/We further agree that if I/we default in any payment to the
              show society concerned, whether in connection with entry fees or otherwise, my/our dog(s)
              may be excluded from any or all societies affiliated to the Royal Kennel Club, and I/we
              shall not be entitled to register, transfer, or exhibit any dogs until the debt(s) is/are
              settled. I/We further declare that I/we believe to the best of my/our knowledge that the
              dog(s) entered is/are not a danger to the public.
            </Text>
          </View>

          {/* Signature */}
          <View style={{ flexDirection: 'row', marginTop: 10, justifyContent: 'space-between' }}>
            <View style={{ width: '55%' }}>
              <Text style={{ fontFamily: 'Inter', fontSize: 7, fontWeight: 'bold', marginBottom: 2, color: C.textDark }}>
                Signature of Owner
              </Text>
              <View style={{ borderBottomWidth: 1, borderBottomColor: C.textDark, height: 18 }} />
            </View>
            <View style={{ width: '30%' }}>
              <Text style={{ fontFamily: 'Inter', fontSize: 7, fontWeight: 'bold', marginBottom: 2, color: C.textDark }}>Date</Text>
              <View style={{ borderBottomWidth: 1, borderBottomColor: C.textDark, height: 18 }} />
            </View>
          </View>

          <Text style={s.footer} render={footerRender} fixed />
        </Page>
      )}
    </Document>
  );
}
