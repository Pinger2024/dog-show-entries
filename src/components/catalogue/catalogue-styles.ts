import path from 'path';
import { StyleSheet, Font } from '@react-pdf/renderer';

// Register Times New Roman from bundled local files (no CDN dependency)
const fontsDir = path.join(process.cwd(), 'public', 'fonts');

Font.register({
  family: 'Times',
  fonts: [
    { src: path.join(fontsDir, 'times-new-roman.ttf') },
    { src: path.join(fontsDir, 'times-new-roman-bold.ttf'), fontWeight: 'bold' },
    { src: path.join(fontsDir, 'times-new-roman-italic.ttf'), fontStyle: 'italic' },
  ],
});

// Disable word hyphenation for dog names and pedigree text
Font.registerHyphenationCallback((word) => [word]);

// All catalogue pages are A5 (148mm × 210mm) per Amanda's specification
export const styles = StyleSheet.create({
  // ── Page layout ──────────────────────────────
  page: {
    fontFamily: 'Times',
    fontSize: 7.5,
    padding: '24 28 36 28',
    lineHeight: 1.3,
  },

  // ── Header ───────────────────────────────────
  header: {
    textAlign: 'center',
    marginBottom: 10,
    borderBottomWidth: 1.5,
    borderBottomColor: '#000',
    paddingBottom: 6,
  },
  headerOrganisation: {
    fontSize: 8,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 1,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 9,
    fontWeight: 'bold',
    marginBottom: 1,
  },
  headerShowType: {
    fontSize: 7,
    fontStyle: 'italic',
    marginBottom: 3,
    color: '#333',
  },
  headerDetail: {
    fontSize: 6.5,
    color: '#444',
    marginTop: 1,
  },

  // ── Group/Breed/Sex hierarchy ────────────────
  groupHeading: {
    fontSize: 9,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    backgroundColor: '#1a1a1a',
    color: '#fff',
    padding: '3 6',
    marginTop: 10,
    marginBottom: 4,
    letterSpacing: 0.8,
  },
  breedHeading: {
    fontSize: 9,
    fontWeight: 'bold',
    borderBottomWidth: 0.75,
    borderBottomColor: '#000',
    paddingBottom: 1.5,
    marginTop: 7,
    marginBottom: 3,
  },
  sexHeading: {
    fontSize: 7,
    fontWeight: 'bold',
    fontStyle: 'italic',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 4,
    marginBottom: 2,
    paddingLeft: 3,
    color: '#333',
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
    fontSize: 8,
    fontWeight: 'bold',
    width: 22,
  },
  dogName: {
    fontSize: 8,
    fontWeight: 'bold',
  },
  entryDetail: {
    fontSize: 6.5,
    color: '#333',
    marginBottom: 0.3,
    paddingLeft: 22,
  },
  entryDetailLabel: {
    fontWeight: 'bold',
    color: '#000',
  },
  entryClasses: {
    fontSize: 6.5,
    fontStyle: 'italic',
    color: '#444',
    marginTop: 1,
    paddingLeft: 22,
  },

  // ── By-class format ──────────────────────────
  classHeading: {
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginTop: 7,
    marginBottom: 3,
    paddingLeft: 3,
    borderLeftWidth: 2.5,
    borderLeftColor: '#333',
  },
  classEntryCount: {
    fontSize: 6,
    color: '#666',
    marginBottom: 3,
    paddingLeft: 6,
  },

  // ── Absentee table ───────────────────────────
  absenteeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: '#ccc',
  },
  absenteeHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderBottomWidth: 1.5,
    borderBottomColor: '#000',
    marginBottom: 2,
  },

  // ── Footer ───────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: 14,
    left: 28,
    right: 28,
    textAlign: 'center',
    fontSize: 6,
    color: '#999',
    borderTopWidth: 0.5,
    borderTopColor: '#ddd',
    paddingTop: 3,
  },
  pageNumber: {
    fontSize: 6.5,
    color: '#666',
  },

  // ── KC standard: class heading within breed/sex ──
  classHeadingInBreed: {
    fontSize: 7.5,
    fontWeight: 'bold',
    marginTop: 5,
    marginBottom: 2,
    paddingLeft: 3,
  },

  // ── Judge label under breed heading ─────────
  judgeLabel: {
    fontSize: 7,
    fontStyle: 'italic',
    marginBottom: 3,
    paddingLeft: 2,
  },

  // ── See class reference (abbreviated entry) ─
  seeClassRef: {
    fontSize: 6.5,
    fontStyle: 'italic',
    color: '#333',
  },

  // ── By-breed format: compact class summary ──
  classListSummary: {
    fontSize: 6.5,
    fontStyle: 'italic',
    color: '#333',
    marginBottom: 1,
    paddingLeft: 3,
  },

  // ── Cover page styles ──────────────────────
  coverPage: {
    fontFamily: 'Times',
    padding: '50 36 36 36',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverOrganisation: {
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
    textAlign: 'center',
  },
  coverShowName: {
    fontSize: 17,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 7,
    textAlign: 'center',
  },
  coverSubtitle: {
    fontSize: 9,
    fontStyle: 'italic',
    marginBottom: 4,
    textAlign: 'center',
    color: '#333',
  },
  coverDetail: {
    fontSize: 8,
    marginTop: 3,
    textAlign: 'center',
    color: '#333',
  },
  coverRegulatory: {
    fontSize: 7,
    marginTop: 14,
    textAlign: 'center',
    color: '#555',
    fontStyle: 'italic',
  },

  // ── Front matter pages ─────────────────────
  frontMatterPage: {
    fontFamily: 'Times',
    fontSize: 7.5,
    padding: '24 28 36 28',
    lineHeight: 1.3,
  },
  frontMatterTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    textAlign: 'center',
    letterSpacing: 0.8,
    marginBottom: 12,
    borderBottomWidth: 1.5,
    borderBottomColor: '#000',
    paddingBottom: 4,
  },

  // ── Judges list table ──────────────────────
  judgesListRow: {
    flexDirection: 'row',
    paddingVertical: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: '#ddd',
  },
  judgesListBreed: {
    fontSize: 7.5,
    width: '50%',
    fontWeight: 'bold',
  },
  judgesListJudge: {
    fontSize: 7.5,
    width: '50%',
  },

  // ── Class definitions ──────────────────────
  classDefName: {
    fontSize: 7.5,
    fontWeight: 'bold',
    marginTop: 4,
    marginBottom: 1,
  },
  classDefDescription: {
    fontSize: 6.5,
    color: '#333',
    marginBottom: 3,
    lineHeight: 1.4,
  },

  // ── Ring plan styles ─────────────────────────
  ringCard: {
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 6,
  },
  ringTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    marginBottom: 3,
  },
  ringJudge: {
    fontSize: 7,
    fontStyle: 'italic',
    marginBottom: 4,
  },
  ringClassRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 1.5,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },
});
