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

export const styles = StyleSheet.create({
  // ── Page layout ──────────────────────────────
  page: {
    fontFamily: 'Times',
    fontSize: 9,
    padding: '36 40 52 40',
    lineHeight: 1.35,
  },

  // ── Header ───────────────────────────────────
  header: {
    textAlign: 'center',
    marginBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: '#000',
    paddingBottom: 10,
  },
  headerOrganisation: {
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 3,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  headerShowType: {
    fontSize: 9,
    fontStyle: 'italic',
    marginBottom: 4,
    color: '#333',
  },
  headerDetail: {
    fontSize: 8,
    color: '#444',
    marginTop: 1.5,
  },

  // ── Group/Breed/Sex hierarchy ────────────────
  groupHeading: {
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    backgroundColor: '#1a1a1a',
    color: '#fff',
    padding: '5 8',
    marginTop: 14,
    marginBottom: 6,
    letterSpacing: 1,
  },
  breedHeading: {
    fontSize: 11,
    fontWeight: 'bold',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingBottom: 2,
    marginTop: 10,
    marginBottom: 5,
  },
  sexHeading: {
    fontSize: 9,
    fontWeight: 'bold',
    fontStyle: 'italic',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 6,
    marginBottom: 3,
    paddingLeft: 4,
    color: '#333',
  },

  // ── Entry rows ───────────────────────────────
  entryRow: {
    marginBottom: 6,
    paddingLeft: 6,
  },
  // Prevent entries from splitting across pages
  entryRowWrap: {
    marginBottom: 6,
    paddingLeft: 6,
  },
  catalogueNumber: {
    fontSize: 10,
    fontWeight: 'bold',
    width: 28,
  },
  dogName: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  entryDetail: {
    fontSize: 8,
    color: '#333',
    marginBottom: 0.5,
    paddingLeft: 28,
  },
  entryDetailLabel: {
    fontWeight: 'bold',
    color: '#000',
  },
  entryClasses: {
    fontSize: 8,
    fontStyle: 'italic',
    color: '#444',
    marginTop: 1.5,
    paddingLeft: 28,
  },

  // ── By-class format ──────────────────────────
  classHeading: {
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginTop: 10,
    marginBottom: 4,
    paddingLeft: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#333',
  },
  classEntryCount: {
    fontSize: 7,
    color: '#666',
    marginBottom: 5,
    paddingLeft: 8,
  },

  // ── Absentee table ───────────────────────────
  absenteeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: '#ccc',
  },
  absenteeHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1.5,
    borderBottomColor: '#000',
    marginBottom: 2,
  },

  // ── Footer ───────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 7,
    color: '#999',
    borderTopWidth: 0.5,
    borderTopColor: '#ddd',
    paddingTop: 5,
  },
  pageNumber: {
    fontSize: 8,
    color: '#666',
  },

  // ── KC standard: class heading within breed/sex ──
  classHeadingInBreed: {
    fontSize: 9,
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 3,
    paddingLeft: 4,
  },

  // ── Judge label under breed heading ─────────
  judgeLabel: {
    fontSize: 9,
    fontStyle: 'italic',
    marginBottom: 4,
    paddingLeft: 2,
  },

  // ── See class reference (abbreviated entry) ─
  seeClassRef: {
    fontSize: 8,
    fontStyle: 'italic',
    color: '#333',
  },

  // ── By-breed format: compact class summary ──
  classListSummary: {
    fontSize: 8,
    fontStyle: 'italic',
    color: '#333',
    marginBottom: 1.5,
    paddingLeft: 4,
  },

  // ── Cover page styles ──────────────────────
  coverPage: {
    fontFamily: 'Times',
    padding: '80 50 50 50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverOrganisation: {
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 16,
    textAlign: 'center',
  },
  coverShowName: {
    fontSize: 22,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 3,
    marginBottom: 10,
    textAlign: 'center',
  },
  coverSubtitle: {
    fontSize: 11,
    fontStyle: 'italic',
    marginBottom: 6,
    textAlign: 'center',
    color: '#333',
  },
  coverDetail: {
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
    color: '#333',
  },
  coverRegulatory: {
    fontSize: 8,
    marginTop: 20,
    textAlign: 'center',
    color: '#555',
    fontStyle: 'italic',
  },

  // ── Front matter pages ─────────────────────
  frontMatterPage: {
    fontFamily: 'Times',
    fontSize: 9,
    padding: '36 40 52 40',
    lineHeight: 1.35,
  },
  frontMatterTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: '#000',
    paddingBottom: 6,
  },

  // ── Judges list table ──────────────────────
  judgesListRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: '#ddd',
  },
  judgesListBreed: {
    fontSize: 9,
    width: '50%',
    fontWeight: 'bold',
  },
  judgesListJudge: {
    fontSize: 9,
    width: '50%',
  },

  // ── Class definitions ──────────────────────
  classDefName: {
    fontSize: 9,
    fontWeight: 'bold',
    marginTop: 6,
    marginBottom: 1,
  },
  classDefDescription: {
    fontSize: 8,
    color: '#333',
    marginBottom: 4,
    lineHeight: 1.4,
  },

  // ── Ring plan styles ─────────────────────────
  ringCard: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 8,
  },
  ringTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  ringJudge: {
    fontSize: 9,
    fontStyle: 'italic',
    marginBottom: 6,
  },
  ringClassRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },
});
