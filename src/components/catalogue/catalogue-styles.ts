import path from 'path';
import { StyleSheet, Font } from '@react-pdf/renderer';
// Side-effect: registers the HankenGrotesk family used below for display/
// heading elements. Imported from a single shared module (not registered
// inline here) — see src/lib/pdf-fonts.ts for why duplicate registration
// of the same family from multiple modules is unsafe.
import '@/lib/pdf-fonts';

// ── Font Registration ───────────────────────────────────────────
// Register the same fonts as the schedule for visual consistency
const fontsDir = path.join(process.cwd(), 'public', 'fonts');

// Register EVERY weight/style combination each family is used in (including
// bold+italic, e.g. the sex headings) — when a combo has no registered face,
// react-pdf silently falls back to the base-14 Helvetica, which is NOT embedded
// and gets rejected by print preflight (Tradeprint, BAGSD 2026-06-19). Faces we
// don't have a dedicated file for are mapped to the closest available TTF so the
// glyphs are always embedded.
Font.register({
  family: 'Times',
  fonts: [
    { src: path.join(fontsDir, 'times-new-roman.ttf') },
    { src: path.join(fontsDir, 'times-new-roman-bold.ttf'), fontWeight: 'bold' },
    { src: path.join(fontsDir, 'times-new-roman-italic.ttf'), fontStyle: 'italic' },
    { src: path.join(fontsDir, 'times-new-roman-italic.ttf'), fontWeight: 'bold', fontStyle: 'italic' },
  ],
});

Font.register({
  family: 'LibreBaskerville',
  fonts: [
    { src: path.join(fontsDir, 'libre-baskerville-regular.ttf') },
    { src: path.join(fontsDir, 'libre-baskerville-bold.ttf'), fontWeight: 'bold' },
    { src: path.join(fontsDir, 'libre-baskerville-regular.ttf'), fontStyle: 'italic' },
    { src: path.join(fontsDir, 'libre-baskerville-bold.ttf'), fontWeight: 'bold', fontStyle: 'italic' },
  ],
});

Font.register({
  family: 'Inter',
  fonts: [
    { src: path.join(fontsDir, 'inter-regular.ttf') },
    { src: path.join(fontsDir, 'inter-regular.ttf'), fontStyle: 'italic' },
    { src: path.join(fontsDir, 'inter-semibold.ttf'), fontWeight: 'bold' },
    { src: path.join(fontsDir, 'inter-semibold.ttf'), fontWeight: 'bold', fontStyle: 'italic' },
  ],
});

// Disable word hyphenation for dog names and pedigree text
Font.registerHyphenationCallback((word) => [word]);

// Secretaries write welcome notes / awards lists WITH emoji (they display
// fine on the public show page, which is HTML) — but none of the embedded
// print fonts carry emoji glyphs, so the catalogue printed tofu boxes where
// Mandy's 🏆 bullets should be (2026-08-17, GSD Scotland). react-pdf
// resolves emoji as inline images from this source at render time instead.
// Server-side fetch, same risk class as the R2 advert images the catalogue
// already depends on. jdecked/twemoji is the maintained twemoji fork.
Font.registerEmojiSource({
  format: 'png',
  url: 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/72x72/',
});

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
    padding: '20 22 30 22',
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
  // Every headerXxx style below sets lineHeight EXPLICITLY (matching
  // styles.page's own 1.3) rather than relying on inheriting it from the
  // page — confirmed root cause of a real overlap bug (coordinator's
  // review, 2026-09-02): react-pdf can compute a Text's own reserved
  // height using a tighter default than the intended inherited
  // lineHeight when nothing is set directly on the Text itself, so the
  // NEXT sibling can start before the previous one's glyphs are fully
  // drawn — confirmed via an isolated repro (a bare sequence of Texts, no
  // catalogue-specific logic involved) and already present, unnoticed, in
  // real committed catalogue-absentees output (e.g. bagsd-champ-2026's
  // baseline literally interleaves "Championship Show" characters into
  // the show-name title's own line). headerTitle is the one most exposed
  // to this (HankenGrotesk ExtraBold, the family/weight the bug was
  // confirmed on) — see catalogue-header.tsx's FitText reserveHeight for
  // the defensive backstop on top of this direct fix.
  headerOrganisation: {
    fontFamily: 'Inter',
    fontSize: 8,
    fontWeight: 'bold',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 1,
    lineHeight: 1.3,
    color: C.primary,
  },
  headerTitle: {
    fontFamily: 'HankenGrotesk',
    fontSize: 13,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 2,
    lineHeight: 1.3,
    color: C.textDark,
  },
  headerSubtitle: {
    fontFamily: 'Inter',
    fontSize: 9,
    fontWeight: 'bold',
    marginBottom: 1,
    lineHeight: 1.3,
    color: C.primary,
  },
  headerShowType: {
    fontFamily: 'Inter',
    fontSize: 7,
    fontStyle: 'italic',
    marginBottom: 3,
    lineHeight: 1.3,
    color: C.textMedium,
  },
  headerDetail: {
    fontFamily: 'Inter',
    fontSize: 6.5,
    color: C.textLight,
    marginTop: 1,
    lineHeight: 1.3,
  },

  // ── Section band (full-width green band like schedule) ────
  sectionBand: {
    backgroundColor: C.primary,
    marginTop: -20,
    marginHorizontal: -22,
    paddingVertical: 9,
    paddingHorizontal: 22,
    marginBottom: 12,
  },
  sectionBandText: {
    fontFamily: 'HankenGrotesk',
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
    padding: '2 6',
    marginTop: 6,
    marginBottom: 2,
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
    marginBottom: 2.5,
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
    marginBottom: 1,
    paddingLeft: 6,
  },

  // Placements row appended after each class block. Mirrors the
  // traditional UK printed catalogue: "1st .....   2nd .....   3rd .....
  // Res .....   VHC .....", one row, evenly spaced, write-in lines for
  // the judge to fill on the day. Amanda's spec 2026-05-14.
  placementsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    // Clear gap between the last dog in the class and the placings line so
    // the judge has room to write, and the line reads as a separate block
    // rather than crowding the final entry (Mandy 2026-06-19).
    marginTop: 14,
    paddingTop: 5,
    paddingBottom: 5,
    paddingLeft: 6,
    paddingRight: 6,
  },
  placementsCell: {
    fontFamily: 'Inter',
    fontSize: 7,
    color: C.textDark,
    flex: 1,
  },
  // Write-in placement slot — a bold label followed by a ruled line (matching
  // the Standard/Ringside catalogue, which Mandy prefers over trailing dots).
  placementSlot: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flex: 1,
    marginRight: 6,
  },
  placementSlotLabel: {
    fontFamily: 'Inter',
    fontSize: 7,
    fontWeight: 'bold',
    color: C.textMedium,
    marginRight: 3,
  },
  placementSlotLine: {
    flex: 1,
    borderBottomWidth: 0.5,
    borderBottomColor: C.textDark,
    height: 10,
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
  // NOTE: no top border here. A border on a `fixed` + position:absolute footer
  // makes react-pdf overflow the stroke's Y coordinate across wrapped pages
  // (it grew to ±10^15), which renders as a stray near-vertical green streak
  // down the page (Mandy/Michael 2026-06-19, BAGSD By-Class). Keep the footer
  // border-free; the page-number text alone is enough.
  footer: {
    position: 'absolute',
    bottom: 12,
    left: 25,
    right: 25,
    textAlign: 'center',
    fontFamily: 'Inter',
    fontSize: 6,
    color: C.textLight,
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
    paddingTop: 4,
    flex: 1,
    alignItems: 'center',
  },
  coverLogo: {
    maxWidth: 132,
    maxHeight: 60,
    objectFit: 'contain',
    alignSelf: 'center',
    marginBottom: 4,
  },
  coverShowName: {
    fontFamily: 'HankenGrotesk',
    fontSize: 17,
    fontWeight: 800,
    textAlign: 'center',
    color: C.textDark,
    marginBottom: 5,
    lineHeight: 1.3,
  },
  coverGoldRule: {
    width: '45%',
    height: 1.5,
    backgroundColor: C.accent,
    marginVertical: 4,
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
    padding: '6 14',
    marginBottom: 4,
    borderLeftWidth: 3,
    borderLeftColor: C.accent,
  },
  coverDetailRow: {
    flexDirection: 'row',
    marginVertical: 1,
  },
  coverDetailLabel: {
    fontFamily: 'Inter',
    fontSize: 6.5,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: C.textLight,
    // Wide enough that "Judging Starts" stays on one line (Mandy 2026-07-20);
    // every value column aligns to this same edge.
    width: 66,
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
  // Formal RKC designation ("CATALOGUE OF UNBENCHED …") — same designation
  // wording as the schedule cover, in the catalogue's own print-first Times
  // idiom rather than the schedule's coloured pill (Mandy 2026-08-17).
  coverDesignation: {
    fontFamily: 'Times',
    fontSize: 8.5,
    fontWeight: 'bold',
    color: C.textDark,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 2,
    marginBottom: 1,
  },
  // Docking statement — mandatory RKC F(1).7.c(2) notice, now prominent on
  // the cover directly beneath the designation (Mandy 2026-08-17), mirroring
  // the schedule cover instead of being buried on the particulars page.
  coverDocking: {
    fontFamily: 'Times',
    fontSize: 7,
    fontStyle: 'italic',
    color: C.textMedium,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 2,
    paddingHorizontal: 8,
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
    padding: '20 22 30 22',
    lineHeight: 1.3,
    color: C.textDark,
  },
  frontMatterTitle: {
    fontFamily: 'HankenGrotesk',
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
    marginTop: 2,
    marginBottom: 1,
    color: C.primary,
  },
  classDefDescription: {
    fontFamily: 'Inter',
    fontSize: 6.5,
    color: C.textMedium,
    marginBottom: 2,
    lineHeight: 1.3,
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

  // ── Judges' Welfare Commitment (carried over from the schedule, catalogue's
  //    own bordered-box idiom — Mandy 2026-08-17) ──────────────
  welfareBlock: {
    backgroundColor: C.cardBg,
    borderWidth: 0.75,
    borderColor: C.cardBorder,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: C.accent,
    padding: '8 12',
    marginBottom: 10,
  },
  welfareBlockEyebrow: {
    fontFamily: 'Inter',
    fontSize: 6,
    fontWeight: 'bold',
    color: C.textLight,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginBottom: 2,
  },
  welfareBlockTitle: {
    fontFamily: 'HankenGrotesk',
    fontSize: 9,
    fontWeight: 'bold',
    color: C.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 5,
  },
  welfareBlockText: {
    fontFamily: 'Times',
    fontSize: 8.5,
    fontStyle: 'italic',
    color: C.textDark,
    lineHeight: 1.5,
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
