/**
 * Shared schedule rendering primitives — font registration (side-effect),
 * colour palette, helper functions, StyleSheet, and small component
 * helpers (Rule, SectionBand, GoldRule, InfoCard) used by BOTH the
 * single-breed and multi-breed schedule renderers.
 *
 * Importing this module is enough to ensure fonts are registered with
 * @react-pdf/renderer before any <Page> render runs. Font.register is
 * idempotent so it's safe even if the module is re-imported.
 */
import { StyleSheet, Font } from '@react-pdf/renderer';
import path from 'path';
import type { ScheduleData } from '@/server/db/schema/shows';
import { getDockingStatement as getDockingStatementShared } from '@/lib/rkc-compliance';

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

// ── Colour Palette ─────────────────────────────────────────────────────────────

export const C = {
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

export const SHOW_TYPE_LABELS: Record<string, string> = {
  companion: 'Companion Show',
  primary: 'Primary Show',
  limited: 'Limited Show',
  open: 'Open Show',
  premier_open: 'Premier Open Show',
  championship: 'Championship Show',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Join venue parts, cleaning up double commas and extra spaces */
export function formatVenue(name: string, address?: string | null, postcode?: string | null): string {
  const parts = [name, address, postcode].filter(Boolean);
  return parts.join(', ').replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim();
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatTime(timeStr: string): string {
  // Handle both "8:30" and "9.30" formats — normalise to colon then format
  const normalised = timeStr.replace('.', ':');
  if (normalised.includes(':') && !normalised.includes(' ')) {
    const [h, m] = normalised.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
  }
  return timeStr;
}

export function getEstimationDate(closeDate: string | null): string | null {
  if (!closeDate) return null;
  const d = new Date(closeDate);
  d.setDate(d.getDate() - 7);
  return formatShortDate(d.toISOString());
}

export function getDockingStatement(sd: ScheduleData | null): string {
  return getDockingStatementShared(sd?.country ?? 'england', sd?.publicAdmission !== false);
}

// ── Styles ─────────────────────────────────────────────────────────────────────

export const s = StyleSheet.create({
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
    maxWidth: 140,
    maxHeight: 80,
    objectFit: 'contain',
    alignSelf: 'center',
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
    width: 75,
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
