import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import path from 'path';

/**
 * Award Board PDF — a wipe-clean, laminatable show-day grid where
 * the secretary fills in class placements and best-of awards with a
 * dry-wipe marker. Designed for bulk print + lamination via Mixam,
 * or home-print download.
 *
 * Layout (A4 landscape):
 *   - Top strip: show metadata (Club / Show Type / Date / Best of
 *     Breed / Reserve Best of Breed) as fill-in fields.
 *   - Main grid: 22 numbered cells in an 11×2 grid. Each cell has
 *     a class number header, 5 placement rows (1st, 2nd, 3rd, Res,
 *     VHC), and a roomy Absentees area at the bottom (cream tint).
 *   - Right sidebar: Bests panel, split into Dog and Bitch sections
 *     (Best / Reserve Best / Best Puppy each).
 *
 * Class-number headers are WHITE with a green underline (not solid
 * green) so a handwritten number from a dry-wipe marker remains
 * visible when clubs relabel boards for different shows.
 */

const fontsDir = path.join(process.cwd(), 'public', 'fonts');
Font.register({
  family: 'Inter',
  fonts: [
    { src: path.join(fontsDir, 'inter-regular.ttf') },
    { src: path.join(fontsDir, 'inter-semibold.ttf'), fontWeight: 'bold' },
  ],
});

const GREEN = '#2D5F3F';
const GOLD = '#B8963E';
const PLACEMENTS = ['1st', '2nd', '3rd', 'Res', 'VHC'] as const;
const CELLS = Array.from({ length: 22 }, (_, i) => i + 1);
const BEST_DOG = ['Best Dog', 'Reserve Best Dog', 'Best Puppy Dog'];
const BEST_BITCH = ['Best Bitch', 'Reserve Best Bitch', 'Best Puppy Bitch'];

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Inter',
    padding: '16 16 14 16',
    color: '#0d1f14',
  },
  headerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderBottomWidth: 1,
    borderBottomColor: GREEN,
    paddingBottom: 6,
    marginBottom: 6,
  },
  headerField: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginRight: 18,
    marginBottom: 3,
  },
  headerLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    color: GREEN,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginRight: 4,
  },
  headerValue: {
    fontSize: 8,
    color: '#0d1f14',
    marginRight: 4,
  },
  headerLine: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#99a59f',
    height: 12,
  },
  body: { flexDirection: 'row', flex: 1, alignItems: 'stretch' },
  gridArea: { flex: 1, marginRight: 8, flexDirection: 'column' },
  colLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  colLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: GREEN,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', flex: 1 },
  cell: {
    width: `${100 / 11}%`,
    height: '50%',
    padding: 1.5,
  },
  cellInner: {
    flex: 1,
    flexDirection: 'column',
    borderWidth: 1,
    borderColor: GREEN,
    borderRadius: 2,
  },
  cellHeader: {
    backgroundColor: '#fff',
    color: GREEN,
    borderBottomWidth: 1,
    borderBottomColor: GREEN,
    paddingVertical: 2,
    paddingHorizontal: 3,
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  placementRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 0.3,
    borderTopColor: '#cfd8d2',
    paddingHorizontal: 3,
  },
  placementLabel: {
    width: 18,
    fontSize: 7,
    fontWeight: 'bold',
    color: GREEN,
  },
  writeLine: {
    flex: 1,
    borderBottomWidth: 0.3,
    borderBottomColor: '#99a59f',
    height: 9,
  },
  absRow: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderTopWidth: 0.7,
    borderTopColor: GREEN,
    paddingVertical: 3,
    paddingHorizontal: 3,
    backgroundColor: '#f2f0ea',
  },
  absLabel: {
    width: 18,
    fontSize: 7,
    fontWeight: 'bold',
    color: '#8b2c2c',
    textTransform: 'uppercase',
  },
  absWriteArea: {
    flex: 1,
    height: '100%',
  },
  bestSidebar: {
    width: 170,
    borderWidth: 1.5,
    borderColor: GOLD,
    borderRadius: 2,
  },
  bestHeader: {
    backgroundColor: GOLD,
    color: '#fff',
    paddingVertical: 3,
    paddingHorizontal: 6,
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  bestGroupLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    color: GREEN,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#f2f0ea',
    borderTopWidth: 0.5,
    borderTopColor: '#d6c08a',
  },
  bestRow: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderTopWidth: 0.3,
    borderTopColor: '#d6c08a',
  },
  bestRowLabel: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: GREEN,
    marginBottom: 3,
  },
  footer: {
    position: 'absolute',
    bottom: 6,
    left: 16,
    right: 16,
    textAlign: 'center',
    fontSize: 7,
    color: '#99a59f',
  },
});

export interface AwardBoardShowInfo {
  clubName: string;
  showType: string;       // pre-filled into header
  showDate: string | null; // pre-filled; null = leave blank
}

const SHOW_TYPE_LABELS: Record<string, string> = {
  companion: 'Companion Show',
  primary: 'Primary Show',
  limited: 'Limited Show',
  open: 'Open Show',
  premier_open: 'Premier Open Show',
  championship: 'Championship Show',
};

function HeaderField({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={{ ...styles.headerField, flex: 1, minWidth: 150 }}>
      <Text style={styles.headerLabel}>{label}:</Text>
      {value ? (
        <Text style={styles.headerValue}>{value}</Text>
      ) : (
        <View style={{ ...styles.headerLine, flex: 1 }} />
      )}
    </View>
  );
}

export function AwardBoard({ show }: { show: AwardBoardShowInfo }) {
  const showTypeLabel = SHOW_TYPE_LABELS[show.showType] ?? show.showType;
  const showDate = show.showDate
    ? new Date(show.showDate).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <Document title={`Award Board — ${show.clubName}`} author="Remi Show Manager">
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.headerRow}>
          <HeaderField label="Club" value={show.clubName} />
          <HeaderField label="Show Type" value={showTypeLabel} />
          <HeaderField label="Show Date" value={showDate} />
          <HeaderField label="Best of Breed" />
          <HeaderField label="Reserve Best of Breed" />
        </View>

        <View style={styles.body}>
          <View style={styles.gridArea}>
            <View style={styles.colLabels}>
              <Text style={styles.colLabel}>Ring Number</Text>
              <Text style={styles.colLabel}>Judge: _____________________________</Text>
            </View>
            <View style={styles.grid}>
              {CELLS.map((n) => (
                <View key={n} style={styles.cell}>
                  <View style={styles.cellInner}>
                    <Text style={styles.cellHeader}>{n}</Text>
                    {PLACEMENTS.map((p) => (
                      <View key={p} style={styles.placementRow}>
                        <Text style={styles.placementLabel}>{p}</Text>
                        <View style={styles.writeLine} />
                      </View>
                    ))}
                    <View style={styles.absRow}>
                      <Text style={styles.absLabel}>Abs</Text>
                      <View style={styles.absWriteArea} />
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.bestSidebar}>
            <Text style={styles.bestHeader}>Bests</Text>
            <Text style={styles.bestGroupLabel}>Dogs</Text>
            {BEST_DOG.map((a) => (
              <View key={a} style={styles.bestRow}>
                <Text style={styles.bestRowLabel}>{a}</Text>
                <View style={styles.writeLine} />
              </View>
            ))}
            <Text style={styles.bestGroupLabel}>Bitches</Text>
            {BEST_BITCH.map((a) => (
              <View key={a} style={styles.bestRow}>
                <Text style={styles.bestRowLabel}>{a}</Text>
                <View style={styles.writeLine} />
              </View>
            ))}
          </View>
        </View>

        <Text style={styles.footer}>
          Wipe-clean award board · Remi Show Manager
        </Text>
      </Page>
    </Document>
  );
}
