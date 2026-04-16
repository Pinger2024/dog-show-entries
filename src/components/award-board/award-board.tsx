import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import path from 'path';
// Side-effect import: registers Inter font + hyphenation callback.
import { C } from '@/components/catalogue/catalogue-styles';
import { KC_PLACEMENTS } from '@/lib/placements';

/**
 * Award Board PDF — a wipe-clean, laminatable show-day grid where
 * the secretary fills in class placements and best-of awards with a
 * dry-wipe marker. Two output variants:
 *
 *   - A4 personalised (default) — single-sheet A4 landscape, club /
 *     show-type / date pre-filled. Downloaded per-show from the
 *     secretary dashboard.
 *   - A3 generic — blank write-in header fields, bigger writing area
 *     in every cell. Designed as the master artwork for a bulk
 *     print run posted alongside prize card orders.
 *
 * Class-number headers are WHITE with a green underline (not solid
 * green) so a handwritten number from a dry-wipe marker remains
 * visible when clubs relabel boards for different shows.
 */

const PLACEMENTS = KC_PLACEMENTS.map((p) => p.shortLabel);
const CELLS = Array.from({ length: 22 }, (_, i) => i + 1);
const BEST_DOG = ['Best Dog', 'Reserve Best Dog', 'Best Puppy Dog'];
const BEST_BITCH = ['Best Bitch', 'Reserve Best Bitch', 'Best Puppy Bitch'];
const BEST_BREED = ['Best of Breed', 'Reserve Best of Breed'];
const OTHER_AWARDS_ROW_COUNT = 4;

const REMI_LOGO = path.join(process.cwd(), 'public', 'branding', 'remi-horizontal.png');

export type AwardBoardSize = 'a4' | 'a3';

// A3 is sqrt(2)× the linear dimensions of A4, so scaling every
// numeric style by this factor keeps the layout identical at native
// print size while giving every write-line proportionally more room.
function scaleFor(size: AwardBoardSize) {
  return size === 'a3' ? Math.SQRT2 : 1;
}

function createStyles(size: AwardBoardSize) {
  const k = scaleFor(size);
  const s = (n: number) => n * k;
  return StyleSheet.create({
    page: {
      fontFamily: 'Inter',
      padding: `${s(16)} ${s(16)} ${s(14)} ${s(16)}`,
      color: '#0d1f14',
    },
    headerRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      borderBottomWidth: 1,
      borderBottomColor: C.primary,
      paddingBottom: s(6),
      marginBottom: s(6),
    },
    headerField: {
      flexDirection: 'row',
      alignItems: 'baseline',
      marginRight: s(18),
      marginBottom: s(3),
    },
    headerLabel: {
      fontSize: s(8),
      fontWeight: 'bold',
      color: C.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginRight: s(4),
    },
    headerValue: {
      fontSize: s(8),
      color: '#0d1f14',
      marginRight: s(4),
    },
    headerLine: {
      borderBottomWidth: 0.5,
      borderBottomColor: '#99a59f',
      height: s(12),
    },
    body: { flexDirection: 'row', flex: 1, alignItems: 'stretch' },
    gridArea: { flex: 1, marginRight: s(8), flexDirection: 'column' },
    colLabels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: s(4),
    },
    colLabel: {
      fontSize: s(9),
      fontWeight: 'bold',
      color: C.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    grid: { flexDirection: 'column', flex: 1 },
    gridRow: { flexDirection: 'row', flex: 1 },
    cell: {
      flex: 1,
      padding: s(1.5),
    },
    cellInner: {
      flex: 1,
      flexDirection: 'column',
      borderWidth: 1,
      borderColor: C.primary,
      borderRadius: 2,
    },
    cellHeader: {
      backgroundColor: '#fff',
      borderBottomWidth: 1,
      borderBottomColor: C.primary,
      paddingVertical: s(3),
      paddingHorizontal: s(4),
      flexDirection: 'row',
      alignItems: 'center',
    },
    cellNumber: {
      fontSize: s(8),
      fontWeight: 'bold',
      color: C.primary,
      marginRight: s(4),
    },
    cellNumberSep: {
      fontSize: s(8),
      color: C.primary,
      marginRight: s(4),
    },
    cellClassLine: {
      flex: 1,
      borderBottomWidth: 0.5,
      borderBottomColor: '#99a59f',
      height: s(10),
      alignSelf: 'flex-end',
    },
    placementRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      borderTopWidth: 0.3,
      borderTopColor: '#cfd8d2',
      paddingHorizontal: s(3),
    },
    placementLabel: {
      width: s(18),
      fontSize: s(7),
      fontWeight: 'bold',
      color: C.primary,
    },
    writeLine: {
      flex: 1,
      borderBottomWidth: 0.3,
      borderBottomColor: '#99a59f',
      height: s(9),
    },
    absRow: {
      flex: 2,
      flexDirection: 'row',
      alignItems: 'flex-start',
      borderTopWidth: 0.7,
      borderTopColor: C.primary,
      paddingVertical: s(3),
      paddingHorizontal: s(3),
      backgroundColor: '#f2f0ea',
    },
    absLabel: {
      width: s(18),
      fontSize: s(7),
      fontWeight: 'bold',
      color: '#8b2c2c',
      textTransform: 'uppercase',
    },
    absWriteArea: {
      flex: 1,
      height: '100%',
    },
    bestSidebar: {
      width: s(170),
      borderWidth: 1.5,
      borderColor: C.accent,
      borderRadius: 2,
    },
    bestHeader: {
      backgroundColor: C.accent,
      color: '#fff',
      paddingVertical: s(3),
      paddingHorizontal: s(6),
      fontSize: s(10),
      fontWeight: 'bold',
      textAlign: 'center',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    bestGroupLabel: {
      fontSize: s(8),
      fontWeight: 'bold',
      color: C.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      paddingHorizontal: s(8),
      paddingVertical: s(4),
      backgroundColor: '#f2f0ea',
      borderTopWidth: 0.5,
      borderTopColor: '#d6c08a',
    },
    bestRow: {
      paddingHorizontal: s(8),
      paddingVertical: s(6),
      borderTopWidth: 0.3,
      borderTopColor: '#d6c08a',
    },
    bestRowLabel: {
      fontSize: s(7.5),
      fontWeight: 'bold',
      color: C.primary,
      marginBottom: s(3),
    },
    bestSpacer: {
      height: s(6),
    },
    brandingLogo: {
      position: 'absolute',
      bottom: s(8),
      right: s(16),
      width: s(72),
      height: 'auto',
      objectFit: 'contain',
    },
  });
}

export interface AwardBoardShowInfo {
  clubName: string;
  showType: string;
  showDate: string | null;
}

const SHOW_TYPE_LABELS: Record<string, string> = {
  companion: 'Companion Show',
  primary: 'Primary Show',
  limited: 'Limited Show',
  open: 'Open Show',
  premier_open: 'Premier Open Show',
  championship: 'Championship Show',
};

function HeaderField({
  label,
  value,
  styles,
}: {
  label: string;
  value?: string | null;
  styles: ReturnType<typeof createStyles>;
}) {
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

export function AwardBoard({
  show,
  size = 'a4',
}: {
  show?: AwardBoardShowInfo;
  size?: AwardBoardSize;
}) {
  const styles = createStyles(size);
  const showTypeLabel = show?.showType
    ? (SHOW_TYPE_LABELS[show.showType] ?? show.showType)
    : null;
  const showDate = show?.showDate
    ? new Date(show.showDate).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  const title = show?.clubName
    ? `Award Board — ${show.clubName}`
    : 'Award Board';

  return (
    <Document title={title} author="Remi Show Manager">
      <Page size={size.toUpperCase() as 'A4' | 'A3'} orientation="landscape" style={styles.page}>
        <View style={styles.headerRow}>
          <HeaderField label="Club" value={show?.clubName ?? null} styles={styles} />
          <HeaderField label="Show Type" value={showTypeLabel} styles={styles} />
          <HeaderField label="Show Date" value={showDate} styles={styles} />
        </View>

        <View style={styles.body}>
          <View style={styles.gridArea}>
            <View style={styles.colLabels}>
              <Text style={styles.colLabel}>Ring Number</Text>
              <Text style={styles.colLabel}>Judge: _____________________________</Text>
            </View>
            <View style={styles.grid}>
              {[CELLS.slice(0, 11), CELLS.slice(11, 22)].map((row, rowIdx) => (
                <View key={rowIdx} style={styles.gridRow}>
                  {row.map((n) => (
                    <View key={n} style={styles.cell}>
                      <View style={styles.cellInner}>
                        <View style={styles.cellHeader}>
                          <Text style={styles.cellNumber}>{n}</Text>
                          <Text style={styles.cellNumberSep}>–</Text>
                          <View style={styles.cellClassLine} />
                        </View>
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
            <View style={styles.bestSpacer} />
            <Text style={styles.bestGroupLabel}>Bitches</Text>
            {BEST_BITCH.map((a) => (
              <View key={a} style={styles.bestRow}>
                <Text style={styles.bestRowLabel}>{a}</Text>
                <View style={styles.writeLine} />
              </View>
            ))}
            <View style={styles.bestSpacer} />
            <Text style={styles.bestGroupLabel}>Breed</Text>
            {BEST_BREED.map((a) => (
              <View key={a} style={styles.bestRow}>
                <Text style={styles.bestRowLabel}>{a}</Text>
                <View style={styles.writeLine} />
              </View>
            ))}
            <View style={styles.bestSpacer} />
            <Text style={styles.bestGroupLabel}>Other Awards</Text>
            {Array.from({ length: OTHER_AWARDS_ROW_COUNT }).map((_, i) => (
              <View key={i} style={styles.bestRow}>
                <View style={styles.writeLine} />
              </View>
            ))}
          </View>
        </View>

        <Image src={REMI_LOGO} style={styles.brandingLogo} />
      </Page>
    </Document>
  );
}
