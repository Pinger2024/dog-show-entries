import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { readFileSync } from 'fs';
import path from 'path';
// Side-effect: registers the shared HankenGrotesk family. NEVER call
// Font.register again for this family from another module — see
// src/lib/pdf-fonts.ts for why duplicate registration is unsafe.
import '@/lib/pdf-fonts';

/**
 * SV / WUSV Grading Card (secretary-approved design, see
 * research/grading-card-sample/grading-card.html + .pdf — the canonical
 * reference this component reproduces). One A5-landscape, double-sided card
 * per entered DOG (one catalogue number per dog, not per entry row):
 *
 *   Page 1 (outside, when folded): LEFT half = WUSV back cover, RIGHT half =
 *     British Regional Group front cover + "Grading Card" — identical on
 *     every card.
 *   Page 2 (inside, when opened): LEFT half = dog details (auto-filled),
 *     RIGHT half = grading form (show/judge/sex/coat/class + the bilingual
 *     grade scale, left blank for the judge to circle, + signature line).
 *
 * Folded once down the middle, this becomes a 4-panel A6 hand card. Page
 * size is fixed at A5 landscape in points (595.28 × 419.53) per the print
 * spec — not the react-pdf preset, which is inconsistent across libraries.
 */
const A5_LANDSCAPE: [number, number] = [595.28, 419.53];
const HALF = A5_LANDSCAPE[0] / 2; // 297.64pt per panel

function loadLogo(filename: string): string | null {
  try {
    const buf = readFileSync(path.join(process.cwd(), 'public', 'grading-cards', filename));
    // Both shipped logo assets are physically JPEG data regardless of file
    // extension (confirmed via `file`) — mime type must match the real
    // encoding or react-pdf's image decoder fails.
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}
const brgLogo = loadLogo('brg-logo.jpg');
const wusvLogo = loadLogo('wusv-logo.png');

// The bilingual grading scale exactly as it appears on the secretary-approved
// sample card — nine rows spanning both the under-12-month scale (Very
// promising / Promising / Less promising) and the 12-months-and-over scale
// (Excellent / Very Good / Good / Sufficient / Insufficient / Faulty), in
// the sample's exact order and casing. See src/lib/sv-grading.ts for the
// underlying SvGrade model (SV_GRADING_OVER_TWELVE / SV_GRADING_UNDER_TWELVE)
// this mirrors — casing differs slightly from that module's labels
// ("Very promising" vs "Very Promising") because this reproduces the
// approved artwork verbatim rather than reformatting it.
const GRADE_ROWS: Array<{ en: string; de: string }> = [
  { en: 'Excellent', de: 'Vorzüglich' },
  { en: 'Very Good', de: 'Sehr Gut' },
  { en: 'Good', de: 'Gut' },
  { en: 'Very promising', de: 'Vielversprechend' },
  { en: 'Promising', de: 'Versprechend' },
  { en: 'Less promising', de: 'Weniger versprechend' },
  { en: 'Sufficient', de: 'Ausreichend' },
  { en: 'Insufficient', de: 'Ungenügend' },
  { en: 'Faulty', de: 'Mangelhaft' },
];

const C = {
  ink: '#1a1a1a',
  mid: '#555555',
  green: '#14532d',
  greenBg: '#f0fdf4',
  rule: '#d4d4d8',
};

const s = StyleSheet.create({
  panel: { width: HALF, height: A5_LANDSCAPE[1], padding: '20 22', fontFamily: 'HankenGrotesk' },
  panelFold: { borderLeftWidth: 1, borderLeftColor: '#cbd5e1', borderLeftStyle: 'dashed' },
  // Outside cover panels
  coverBack: { alignItems: 'center', justifyContent: 'flex-end' },
  coverBackImg: { width: '44%', marginBottom: 22 },
  coverFront: { alignItems: 'center' },
  coverFrontImg: { width: '82%', marginTop: 46 },
  coverFrontTitle: { marginTop: 34, fontSize: 21, fontWeight: 700, color: C.ink },
  // Inside — details panel
  showName: {
    textAlign: 'center',
    fontWeight: 700,
    fontSize: 14,
    color: C.green,
    borderBottomWidth: 1.5,
    borderBottomColor: C.green,
    paddingBottom: 5,
    marginBottom: 6,
  },
  detailsTable: { borderWidth: 1, borderColor: C.rule },
  detailRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.rule },
  detailRowLast: { flexDirection: 'row' },
  detailK: {
    width: '40%',
    padding: '5.5 7',
    fontSize: 9.5,
    color: C.mid,
    fontWeight: 700,
    borderRightWidth: 1,
    borderRightColor: C.rule,
  },
  detailV: { width: '60%', padding: '5.5 7', fontSize: 9.5, fontWeight: 700, color: C.ink },
  // Inside — grading panel
  grow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 5,
  },
  growLabel: { width: 58, fontSize: 10, fontWeight: 700, color: '#333333' },
  growValue: { fontSize: 10, fontWeight: 700, color: C.ink },
  gradeHead: { fontWeight: 700, fontSize: 10.5, marginTop: 9, marginBottom: 5 },
  gradeHint: { fontWeight: 400, color: '#999999', fontSize: 9 },
  gradeRow: { flexDirection: 'row', paddingVertical: 3.5 },
  gradeEn: { width: '52%', fontSize: 10 },
  gradeDe: { fontSize: 10, fontStyle: 'italic', color: '#666666' },
  sign: { marginTop: 12, fontSize: 10, flexDirection: 'row', alignItems: 'flex-end' },
  signLine: { flex: 1, borderBottomWidth: 1, borderBottomColor: '#333333', marginLeft: 6, height: 1 },
});

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={last ? s.detailRowLast : s.detailRow}>
      <Text style={s.detailK}>{label}</Text>
      <Text style={s.detailV}>{value || ' '}</Text>
    </View>
  );
}

function GrowRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.grow}>
      <Text style={s.growLabel}>{label}</Text>
      <Text style={s.growValue}>{value || ' '}</Text>
    </View>
  );
}

/** Static outside cover, identical on every card in the run. */
function CoverPage() {
  return (
    <Page size={A5_LANDSCAPE} style={{ flexDirection: 'row' }}>
      <View style={[s.panel, s.coverBack]}>
        {wusvLogo ? <Image src={wusvLogo} style={s.coverBackImg} /> : null}
      </View>
      <View style={[s.panel, s.panelFold, s.coverFront]}>
        {brgLogo ? <Image src={brgLogo} style={s.coverFrontImg} /> : null}
        <Text style={s.coverFrontTitle}>Grading Card</Text>
      </View>
    </Page>
  );
}

export interface GradingCardEntry {
  ringNumber: string;
  dogName: string;
  dob: string;
  microchipNumber: string;
  regNumber: string;
  sireName: string;
  damName: string;
  breederName: string;
  ownerName: string;
  sex: string;
  coat: string;
  className: string;
  judgeName: string;
}

export interface GradingCardsInfo {
  showName: string;
  showDate: string;
}

function InsidePage({ info, entry }: { info: GradingCardsInfo; entry: GradingCardEntry }) {
  return (
    <Page size={A5_LANDSCAPE} style={{ flexDirection: 'row' }}>
      <View style={s.panel}>
        <Text style={s.showName}>{info.showName}</Text>
        <View style={s.detailsTable}>
          <DetailRow label="Ring no" value={entry.ringNumber} />
          <DetailRow label="Name of exhibit" value={entry.dogName} />
          <DetailRow label="DOB" value={entry.dob} />
          <DetailRow label="Microchip no" value={entry.microchipNumber} />
          <DetailRow label="RKC / SV Reg no" value={entry.regNumber} />
          <DetailRow label="Sire" value={entry.sireName} />
          <DetailRow label="Dam" value={entry.damName} />
          <DetailRow label="Breeder" value={entry.breederName} />
          <DetailRow label="Owner" value={entry.ownerName} last />
        </View>
      </View>
      <View style={[s.panel, s.panelFold]}>
        <GrowRow label="Judge" value={entry.judgeName} />
        <GrowRow label="Show" value={info.showName} />
        <GrowRow label="Date" value={info.showDate} />
        <GrowRow label="Sex" value={entry.sex} />
        <GrowRow label="Coat" value={entry.coat} />
        <GrowRow label="Class" value={entry.className} />
        <Text style={s.gradeHead}>
          Grading <Text style={s.gradeHint}>(judge circles one)</Text>
        </Text>
        {GRADE_ROWS.map((g, i) => (
          <View key={i} style={s.gradeRow}>
            <Text style={s.gradeEn}>{g.en}</Text>
            <Text style={s.gradeDe}>{g.de}</Text>
          </View>
        ))}
        <View style={s.sign}>
          <Text>Judge:</Text>
          <View style={s.signLine} />
        </View>
      </View>
    </Page>
  );
}

/** Renders the full document: for N dogs, 2N pages (outside cover, inside
 * details+grading) per dog, in the given entry order. */
export function GradingCardsReport({
  info,
  entries,
}: {
  info: GradingCardsInfo;
  entries: GradingCardEntry[];
}) {
  const pages = entries.flatMap((entry, i) => [
    <CoverPage key={`cover-${i}`} />,
    <InsidePage key={`inside-${i}`} info={info} entry={entry} />,
  ]);
  return (
    <Document title={`Grading Cards — ${info.showName}`} author="Remi Show Manager">
      {pages}
    </Document>
  );
}
