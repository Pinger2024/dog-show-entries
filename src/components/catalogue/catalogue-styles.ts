import path from 'path';
import { StyleSheet, Font } from '@react-pdf/renderer';

// ── Font Registration ───────────────────────────────────────────
// Register the same fonts as the schedule for visual consistency
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
    { src: path.join(fontsDir, 'inter-regular.ttf'), fontStyle: 'italic' },
    { src: path.join(fontsDir, 'inter-semibold.ttf'), fontWeight: 'bold' },
  ],
});

// Disable word hyphenation for dog names and pedigree text
Font.registerHyphenationCallback((word) => [word]);

// ── Colour Palette (matches schedule) ───────────────────────────
export const C = {
  primary: '#2D5F3F',
  accent: '#B8963E',

  cardBg: '#F5F3EE',
  cardBorder: '#E5E0D5',

  textDark: '#1A1A1A',
  textMedium: '#4A4A4A',
  textLight: '#7A7A7A',
  textOnPrimary: '#FFFFFF',

  ruleLight: '#D4CFC5',
};

// All catalogue pages are A5 (148mm x 210mm) per Amanda's specification
export const styles = StyleSheet.create({
  // ── Page layout ──────────────────────────────
  page: {
    fontFamily: 'Inter',
    fontSize: 7.5,
    padding: '25 25 36 25',
    lineHeight: 1.3,
    color: C.textDark,
  },

  // ── Header ───────────────────────────────────
  header: {
    textAlign: 'center',
    marginBottom: 10,
    borderBottomWidth: 1.5,
    borderBottomColor: C.primary,
    paddingBottom: 6,
  },
  headerOrganisation: {
    fontFamily: 'Inter',
    fontSize: 8,
    fontWeight: 'bold',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 1,
    color: C.primary,
  },
  headerTitle: {
    fontFamily: 'LibreBaskerville',
    fontSize: 13,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 2,
    color: C.textDark,
  },
  headerSubtitle: {
    fontFamily: 'Inter',
    fontSize: 9,
    fontWeight: 'bold',
    marginBottom: 1,
    color: C.primary,
  },
  headerShowType: {
    fontFamily: 'Inter',
    fontSize: 7,
    fontStyle: 'italic',
    marginBottom: 3,
    color: C.textMedium,
  },
  headerDetail: {
    fontFamily: 'Inter',
    fontSize: 6.5,
    color: C.textLight,
    marginTop: 1,
  },

  // ── Section band (full-width green band like schedule) ────
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

  // ── Group/Breed/Sex hierarchy ────────────────
  groupHeading: {
    fontFamily: 'Inter',
    fontSize: 9,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    backgroundColor: C.primary,
    color: C.textOnPrimary,
    padding: '3 6',
    marginTop: 10,
    marginBottom: 4,
    letterSpacing: 0.8,
  },
  breedHeading: {
    fontFamily: 'LibreBaskerville',
    fontSize: 9,
    fontWeight: 'bold',
    color: C.primary,
    borderBottomWidth: 0.75,
    borderBottomColor: C.primary,
    paddingBottom: 1.5,
    marginTop: 7,
    marginBottom: 3,
  },
  sexHeading: {
    fontFamily: 'Inter',
    fontSize: 7,
    fontWeight: 'bold',
    fontStyle: 'italic',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 4,
    marginBottom: 2,
    paddingLeft: 3,
    color: C.accent,
  },

  // ── Entry rows ───────────────────────────────
  entryRow: {
    marginBottom: 4,
    paddingLeft: 4,
  },
  // Prevent entries from splitting across pages
  entryRowWrap: {
    marginBottom: 4,
    paddingLeft: 4,
  },
  catalogueNumber: {
    fontFamily: 'Inter',
    fontSize: 8,
    fontWeight: 'bold',
    width: 22,
    color: C.primary,
  },
  dogName: {
    fontFamily: 'Inter',
    fontSize: 8,
    fontWeight: 'bold',
    color: C.textDark,
  },
  entryDetail: {
    fontFamily: 'Inter',
    fontSize: 6.5,
    color: C.textMedium,
    marginBottom: 0.3,
    paddingLeft: 22,
  },
  entryDetailLabel: {
    fontWeight: 'bold',
    color: C.textDark,
  },
  entryClasses: {
    fontFamily: 'Inter',
    fontSize: 6.5,
    fontStyle: 'italic',
    color: C.textLight,
    marginTop: 1,
    paddingLeft: 22,
  },

  // ── By-class format ──────────────────────────
  classHeading: {
    fontFamily: 'Inter',
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginTop: 7,
    marginBottom: 3,
    paddingLeft: 3,
    borderLeftWidth: 2.5,
    borderLeftColor: C.accent,
    color: C.textDark,
  },
  classEntryCount: {
    fontFamily: 'Inter',
    fontSize: 6,
    color: C.textLight,
    marginBottom: 3,
    paddingLeft: 6,
  },

  // ── Absentee table ───────────────────────────
  absenteeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: C.ruleLight,
  },
  absenteeHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderBottomWidth: 1.5,
    borderBottomColor: C.primary,
    marginBottom: 2,
  },

  // ── Footer ───────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: 12,
    left: 25,
    right: 25,
    textAlign: 'center',
    fontFamily: 'Inter',
    fontSize: 6,
    color: C.textLight,
    borderTopWidth: 0.75,
    borderTopColor: C.primary,
    paddingTop: 4,
  },
  pageNumber: {
    fontFamily: 'Inter',
    fontSize: 6.5,
    color: C.textLight,
  },

  // ── RKC standard: class heading within breed/sex ──
  classHeadingInBreed: {
    fontFamily: 'Inter',
    fontSize: 9,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginTop: 5,
    marginBottom: 2,
    paddingLeft: 3,
    color: C.textDark,
  },

  // ── Judge label under breed heading ─────────
  judgeLabel: {
    fontFamily: 'Inter',
    fontSize: 7,
    fontStyle: 'italic',
    marginBottom: 3,
    paddingLeft: 2,
    color: C.textMedium,
  },

  // ── See class reference (abbreviated entry) ─
  seeClassRef: {
    fontFamily: 'Inter',
    fontSize: 6.5,
    fontStyle: 'italic',
    color: C.textLight,
  },

  // ── By-breed format: compact class summary ──
  classListSummary: {
    fontFamily: 'Inter',
    fontSize: 6.5,
    fontStyle: 'italic',
    color: C.textLight,
    marginBottom: 1,
    paddingLeft: 3,
  },

  // ── Cover page styles ──────────────────────
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
  coverGoldRule: {
    width: '45%',
    height: 1.5,
    backgroundColor: C.accent,
    marginVertical: 8,
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
  coverRegulatory: {
    fontFamily: 'Times',
    fontSize: 7.5,
    fontStyle: 'italic',
    color: C.textMedium,
    textAlign: 'center',
    marginBottom: 2,
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

  // ── Cover page (old flat styles kept as aliases) ──
  coverOrganisation: {
    fontFamily: 'Inter',
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
    textAlign: 'center',
    color: C.primary,
  },
  coverSubtitle: {
    fontFamily: 'Inter',
    fontSize: 9,
    fontStyle: 'italic',
    marginBottom: 4,
    textAlign: 'center',
    color: C.textMedium,
  },
  coverDetail: {
    fontFamily: 'Inter',
    fontSize: 8,
    marginTop: 3,
    textAlign: 'center',
    color: C.textMedium,
  },

  // ── Front matter pages ─────────────────────
  frontMatterPage: {
    fontFamily: 'Inter',
    fontSize: 7.5,
    padding: '25 25 36 25',
    lineHeight: 1.3,
    color: C.textDark,
  },
  frontMatterTitle: {
    fontFamily: 'LibreBaskerville',
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    textAlign: 'center',
    letterSpacing: 0.8,
    marginBottom: 12,
    borderBottomWidth: 1.5,
    borderBottomColor: C.primary,
    paddingBottom: 4,
    color: C.primary,
  },

  // ── Judges list table ──────────────────────
  judgesListRow: {
    flexDirection: 'row',
    paddingVertical: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: C.ruleLight,
  },
  judgesListBreed: {
    fontFamily: 'Inter',
    fontSize: 7.5,
    width: '50%',
    fontWeight: 'bold',
    color: C.textDark,
  },
  judgesListJudge: {
    fontFamily: 'Inter',
    fontSize: 7.5,
    width: '50%',
    color: C.textMedium,
  },

  // ── Class definitions ──────────────────────
  classDefName: {
    fontFamily: 'Inter',
    fontSize: 7.5,
    fontWeight: 'bold',
    marginTop: 4,
    marginBottom: 1,
    color: C.primary,
  },
  classDefDescription: {
    fontFamily: 'Inter',
    fontSize: 6.5,
    color: C.textMedium,
    marginBottom: 3,
    lineHeight: 1.4,
  },

  // ── Ring plan styles ─────────────────────────
  ringCard: {
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 6,
    borderRadius: 4,
  },
  ringTitle: {
    fontFamily: 'Inter',
    fontSize: 9,
    fontWeight: 'bold',
    marginBottom: 3,
    color: C.primary,
  },
  ringJudge: {
    fontFamily: 'Inter',
    fontSize: 7,
    fontStyle: 'italic',
    marginBottom: 4,
    color: C.textMedium,
  },
  ringClassRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 1.5,
    borderBottomWidth: 0.5,
    borderBottomColor: C.ruleLight,
  },

  // ── Sponsor / trophy line under class headings ──
  sponsorLine: {
    fontFamily: 'Inter',
    fontSize: 9,
    fontWeight: 'bold',
    color: C.primary,
    paddingLeft: 3,
    paddingVertical: 2,
    marginBottom: 2,
  },

  // ── Info card (matches schedule) ──────────────
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
  infoLabel: {
    fontFamily: 'Inter',
    fontSize: 8,
    color: C.textMedium,
  },
  infoValue: {
    fontFamily: 'Inter',
    fontSize: 8,
    fontWeight: 'bold',
    color: C.textDark,
  },

  // ── Judge bio styles ──────────────────────────
  judgeBio: {
    fontFamily: 'Times',
    fontSize: 6.5,
    fontStyle: 'italic',
    color: C.textMedium,
    lineHeight: 1.4,
    paddingLeft: 4,
    marginTop: 1,
    marginBottom: 2,
  },
});
