import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
// Side-effects: the shared HankenGrotesk family (never Font.register again —
// see src/lib/pdf-fonts.ts) and "never split a word" hyphenation.
import '@/lib/pdf-fonts';
import '@/lib/pdf-hyphenation';

/**
 * Regional (WUSV) Results Sheet — A4 landscape. Copies the sheet the GSDL BRG
 * secretary already uses: the LEFT half is the master sheet the steward fills
 * in and the judge signs; the RIGHT half is cut off and pinned up so folk can
 * write up their catalogues.
 *
 * Every row is ONE row View holding both halves, so the halves can never drift
 * out of line across pages. All rows and bands are direct children of the Page
 * (minPresenceAhead is dead inside a wrapper View).
 */

export interface ResultsSheetRow {
  ringNumber: string;
  /** The dog's registered name, or the HANDLER's name in a Junior Handling class. */
  name: string;
  /** Marked absent — still listed: the steward writes "Abs". */
  absent: boolean;
}

export interface ResultsSheetBlock {
  showClassId: string;
  /** Class number as printed: "1a", "JHA". */
  label: string;
  /** The catalogue's class heading (svClassHeading). */
  heading: string;
  /** Height and Depth are taken — Junior and over. */
  measured: boolean;
  /** Not graded and not measured. */
  isJuniorHandling: boolean;
  rows: ResultsSheetRow[];
}

export interface ResultsSheetAward {
  label: string;
}

export interface ResultsSheetData {
  showName: string;
  showDate: string;
  judges: string[];
  jhJudges: string[];
  blocks: ResultsSheetBlock[];
  awards: ResultsSheetAward[];
}

// A4 landscape; content width 793.89 = left 438 + gutter 16 + right 340 (+ rounding).
const GUTTER = 16;
const LEFT_COLS = { cls: 34, ring: 38, name: 140, grading: 66, placing: 52, height: 54, depth: 54 };
const RIGHT_COLS = { cls: 34, ring: 38, name: 136, grading: 70, placing: 62 };
const LEFT_W = Object.values(LEFT_COLS).reduce((a, b) => a + b, 0);
const RIGHT_W = Object.values(RIGHT_COLS).reduce((a, b) => a + b, 0);

const INK = '#1a1a1a';
const RULE = '#555555';
const BAND = '#e4e4e4';
const ROW_SHADE = '#f4f4f4';
const NOT_NEEDED = '#bdbdbd';

const s = StyleSheet.create({
  page: { fontFamily: 'HankenGrotesk', fontSize: 8.5, color: INK, paddingTop: 108, paddingBottom: 46, paddingHorizontal: 24 },
  headerWrap: { position: 'absolute', top: 20, left: 24, right: 24 },
  title: { fontSize: 13, fontWeight: 'bold' },
  judgeLine: { fontSize: 9, marginTop: 2 },
  halfHeads: { flexDirection: 'row', marginTop: 5 },
  halfHead: { fontSize: 9, fontWeight: 'bold' },
  colHeadRow: { flexDirection: 'row', marginTop: 3 },
  half: { flexDirection: 'row' },
  gutter: { width: GUTTER, alignItems: 'center' },
  cut: { flexGrow: 1, borderLeftWidth: 0.7, borderLeftColor: RULE, borderLeftStyle: 'dashed' },
  colHead: { fontSize: 7.5, fontWeight: 'bold', paddingVertical: 2, paddingHorizontal: 2, borderWidth: 0.6, borderColor: RULE, backgroundColor: BAND },
  row: { flexDirection: 'row', minHeight: 21 },
  cell: { paddingVertical: 3, paddingHorizontal: 3, borderBottomWidth: 0.6, borderRightWidth: 0.6, borderColor: RULE, justifyContent: 'center' },
  bandText: { fontSize: 9, fontWeight: 'bold', paddingVertical: 3, paddingHorizontal: 4, borderBottomWidth: 0.6, borderTopWidth: 0.6, borderColor: RULE, flexGrow: 1 },
  footerWrap: { position: 'absolute', bottom: 18, left: 24, right: 24, flexDirection: 'row' },
  sig: { fontSize: 9 },
  pageNo: { fontSize: 8, textAlign: 'right' },
});

type Shade = 'none' | 'row' | 'na';
const bg = (shade: Shade) => (shade === 'na' ? NOT_NEEDED : shade === 'row' ? ROW_SHADE : undefined);

function Cell({ w, shade, children, bold }: { w: number; shade: Shade; children?: string; bold?: boolean }) {
  return (
    <View style={[s.cell, { width: w, backgroundColor: bg(shade) }]}>
      {children ? <Text style={bold ? { fontWeight: 'bold' } : undefined}>{children}</Text> : null}
    </View>
  );
}

const Gutter = () => (
  <View style={s.gutter}>
    <View style={s.cut} />
  </View>
);

function ColHeads() {
  const h = (w: number, t: string) => (
    <View key={t + w} style={[s.colHead, { width: w }]}>
      <Text>{t}</Text>
    </View>
  );
  return (
    <View style={s.colHeadRow}>
      <View style={s.half}>
        {h(LEFT_COLS.cls, 'Class')}
        {h(LEFT_COLS.ring, 'Ring No')}
        {h(LEFT_COLS.name, 'Name')}
        {h(LEFT_COLS.grading, 'Grading')}
        {h(LEFT_COLS.placing, 'Placing')}
        {h(LEFT_COLS.height, 'Height')}
        {h(LEFT_COLS.depth, 'Depth')}
      </View>
      <Gutter />
      <View style={s.half}>
        {h(RIGHT_COLS.cls, 'Class')}
        {h(RIGHT_COLS.ring, 'Ring No')}
        {h(RIGHT_COLS.name, 'Name')}
        {h(RIGHT_COLS.grading, 'Grading')}
        {h(RIGHT_COLS.placing, 'Placing')}
      </View>
    </View>
  );
}

/** A class band spanning both halves; the text repeats in each half. */
function Band({ text, dark }: { text: string; dark: boolean }) {
  const shade = dark ? BAND : ROW_SHADE;
  return (
    <View style={s.row} minPresenceAhead={52}>
      <View style={[s.half, { width: LEFT_W, backgroundColor: shade }]}>
        <Text style={s.bandText}>{text}</Text>
      </View>
      <Gutter />
      <View style={[s.half, { width: RIGHT_W, backgroundColor: shade }]}>
        <Text style={s.bandText}>{text}</Text>
      </View>
    </View>
  );
}

function DataRow({ label, ring, name, shaded, grading, hd }: {
  label: string; ring: string; name: string; shaded: boolean; grading: Shade; hd: Shade;
}) {
  const base: Shade = shaded ? 'row' : 'none';
  return (
    <View style={s.row} wrap={false}>
      <View style={s.half}>
        <Cell w={LEFT_COLS.cls} shade={base}>{label}</Cell>
        <Cell w={LEFT_COLS.ring} shade={base} bold>{ring}</Cell>
        <Cell w={LEFT_COLS.name} shade={base}>{name}</Cell>
        <Cell w={LEFT_COLS.grading} shade={grading === 'na' ? 'na' : base} />
        <Cell w={LEFT_COLS.placing} shade={base} />
        <Cell w={LEFT_COLS.height} shade={hd === 'na' ? 'na' : base} />
        <Cell w={LEFT_COLS.depth} shade={hd === 'na' ? 'na' : base} />
      </View>
      <Gutter />
      <View style={s.half}>
        <Cell w={RIGHT_COLS.cls} shade={base}>{label}</Cell>
        <Cell w={RIGHT_COLS.ring} shade={base} bold>{ring}</Cell>
        <Cell w={RIGHT_COLS.name} shade={base}>{name}</Cell>
        <Cell w={RIGHT_COLS.grading} shade={grading === 'na' ? 'na' : base} />
        <Cell w={RIGHT_COLS.placing} shade={base} />
      </View>
    </View>
  );
}

/** A best-award row: the label spans Class + Ring; Ring No and Name are for writing in. */
function AwardRow({ label, shaded }: { label: string; shaded: boolean }) {
  const base: Shade = shaded ? 'row' : 'none';
  return (
    <View style={[s.row, { minHeight: 30 }]} wrap={false}>
      <View style={s.half}>
        <View style={[s.cell, { width: LEFT_COLS.cls + LEFT_COLS.ring, backgroundColor: bg(base) }]}>
          <Text style={{ fontWeight: 'bold', fontSize: 8 }}>{label}</Text>
        </View>
        <Cell w={LEFT_COLS.name} shade={base} />
        <Cell w={LEFT_COLS.grading} shade="na" />
        <Cell w={LEFT_COLS.placing} shade={base} />
        <Cell w={LEFT_COLS.height} shade="na" />
        <Cell w={LEFT_COLS.depth} shade="na" />
      </View>
      <Gutter />
      <View style={s.half}>
        <View style={[s.cell, { width: RIGHT_COLS.cls + RIGHT_COLS.ring, backgroundColor: bg(base) }]}>
          <Text style={{ fontWeight: 'bold', fontSize: 8 }}>{label}</Text>
        </View>
        <Cell w={RIGHT_COLS.name} shade={base} />
        <Cell w={RIGHT_COLS.grading} shade="na" />
        <Cell w={RIGHT_COLS.placing} shade={base} />
      </View>
    </View>
  );
}

export function ResultsSheetReport({ data }: { data: ResultsSheetData }) {
  const title = [data.showName, data.showDate].filter(Boolean).join('  —  ');
  return (
    <Document title={`${data.showName} — Results Sheet`}>
      <Page size="A4" orientation="landscape" style={s.page}>
        <View fixed style={s.headerWrap}>
          <Text style={s.title}>{title}</Text>
          {data.judges.length > 0 && <Text style={s.judgeLine}>Judge: {data.judges.join(', ')}</Text>}
          {data.jhJudges.length > 0 && (
            <Text style={s.judgeLine}>Junior Handling judge: {data.jhJudges.join(', ')}</Text>
          )}
          <View style={s.halfHeads}>
            <View style={{ width: LEFT_W }}>
              <Text style={s.halfHead}>Master sheet — please pass to the Secretary</Text>
            </View>
            <View style={{ width: GUTTER }} />
            <View style={{ width: RIGHT_W }}>
              <Text style={s.halfHead}>For the scoreboard</Text>
            </View>
          </View>
          <ColHeads />
        </View>

        {data.blocks.flatMap((b, i) => [
          <Band key={`${b.showClassId}-band`} text={b.heading} dark={i % 2 === 0} />,
          ...b.rows.map((r, j) => (
            <DataRow
              key={`${b.showClassId}-${j}`}
              label={b.label}
              ring={r.ringNumber}
              name={r.name}
              shaded={i % 2 === 0}
              grading={b.isJuniorHandling ? 'na' : 'none'}
              hd={b.isJuniorHandling || !b.measured ? 'na' : 'none'}
            />
          )),
        ])}

        {data.awards.length > 0 && <Band text="Best awards" dark />}
        {data.awards.map((a, i) => (
          <AwardRow key={`${a.label}-${i}`} label={a.label} shaded={false} />
        ))}

        <View fixed style={s.footerWrap}>
          <View style={{ width: LEFT_W }}>
            <Text style={s.sig}>Judge's signature ____________________   Date __________</Text>
          </View>
          <View style={{ width: GUTTER }} />
          <View style={{ width: RIGHT_W }}>
            <Text style={s.pageNo} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
          </View>
        </View>
      </Page>
    </Document>
  );
}
