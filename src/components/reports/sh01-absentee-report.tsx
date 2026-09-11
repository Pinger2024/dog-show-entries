import { Document, Page, View, Text, Image, StyleSheet, Font } from '@react-pdf/renderer';
import { readFileSync } from 'fs';
import path from 'path';
import type { Sh01BreedRow } from '@/lib/sh01-absentee';

/**
 * The official RKC SH01 "Single Breed/Sub Group Championship Absentee Report",
 * auto-filled from the show's entries (Mandy 2026-07-07 — the KC are strict on
 * their form + branding, so this replicates it, KC logo included). The figures
 * feed the KC's annual CC allocation; counting rules live in lib/sh01-absentee.
 *
 * Field-for-field replica of the official SH01/CAT VERSION 6 (JUNE 2023) form
 * (research/rkc-sh01-absentee/SH01-official-sample.pdf) — every pre-printed
 * label, section bar and footer line below is copied verbatim from that
 * sample so a secretary can tell exactly what goes where, same as the paper
 * form. Where we have data it fills the field; where we don't, the label
 * still prints with a blank line for a secretary to complete by hand.
 *
 * Inter is registered (not the base-14 Helvetica) so every font is embedded —
 * an unembedded base-14 font fails print preflight (see
 * reference_catalogue_print_preflight) — and so any diacritic in a society
 * name renders correctly.
 */
const fontsDir = path.join(process.cwd(), 'public', 'fonts');
Font.register({
  family: 'Inter',
  fonts: [
    { src: path.join(fontsDir, 'inter-regular.ttf') },
    { src: path.join(fontsDir, 'inter-semibold.ttf'), fontWeight: 'bold' },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

const kcLogo: string | null = (() => {
  try {
    const buf = readFileSync(path.join(process.cwd(), 'public', 'assets', 'kc-sh01-logo.png'));
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
})();

const G = '#046A38'; // KC green
const RULE = '#b9c7bd';
const GROUP_RULE = 1.5; // thicker divider between the BREED / DOGS & BITCHES / MIXED column groups

const s = StyleSheet.create({
  page: { paddingVertical: 22, paddingHorizontal: 30, fontFamily: 'Inter', fontSize: 8, color: '#222' },
  badge: { position: 'absolute', top: 0, right: 0, backgroundColor: '#cfe3d6', color: G, fontFamily: 'Inter', fontWeight: 'bold', fontSize: 18, paddingTop: 6, paddingBottom: 10, paddingHorizontal: 18, borderBottomLeftRadius: 12 },
  logo: { height: 44, objectFit: 'contain', alignSelf: 'center', marginBottom: 4 },
  title: { textAlign: 'center', fontFamily: 'Inter', fontWeight: 'bold', fontSize: 14, marginBottom: 8 },
  bar: { backgroundColor: G, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, paddingHorizontal: 6 },
  barText: { color: '#fff', fontFamily: 'Inter', fontWeight: 'bold', fontSize: 7.5 },
  // Society details — official form runs "DATE OF SHOW" and "NAME OF
  // SECRETARY" side by side in one row; "NAME OF SOCIETY" gets its own
  // full-width row above it. Labels are the pre-printed ALL CAPS wording
  // copied verbatim from the sample — do not re-case to title case.
  frow: { flexDirection: 'row', borderWidth: 0.6, borderColor: RULE, borderTopWidth: 0 },
  fLbl: { width: '18%', fontFamily: 'Inter', fontWeight: 'bold', fontSize: 8, padding: 4, borderRightWidth: 0.6, borderRightColor: RULE },
  fVal: { fontFamily: 'Inter', fontWeight: 'bold', fontSize: 9.5, color: '#111', padding: 4 },
  fHalf: { width: '50%', flexDirection: 'row', alignItems: 'stretch' },
  fHalfBorder: { borderRightWidth: 0.6, borderRightColor: RULE },
  instr: { fontSize: 7, lineHeight: 1.35, color: '#333', paddingVertical: 6 },
  // main grid — official form has the group-header row ("DOGS & BITCHES" /
  // "MIXED") in WHITE with GREEN text/borders, and only the column
  // sub-header row ("BREED", "NO. OF DOGS", ...) solid green with white
  // text. Getting this inverted (both rows solid green) is a real mismatch
  // against the sample, so the two rows use distinct styles below.
  gWrap: { borderWidth: 0.6, borderColor: G },
  gGroupHeadRow: { flexDirection: 'row', borderBottomWidth: 0.6, borderBottomColor: G },
  gBreedTopCell: { width: '22%' },
  gGroupRow: { flexDirection: 'row', width: '78%' },
  gGroup: { color: G, fontFamily: 'Inter', fontWeight: 'bold', fontSize: 7, textAlign: 'center', paddingVertical: 3 },
  gSubHeadRow: { flexDirection: 'row', backgroundColor: G },
  gBreedCell: { width: '22%', justifyContent: 'center', paddingHorizontal: 4, borderRightWidth: GROUP_RULE, borderRightColor: '#fff' },
  gBreedText: { color: '#fff', fontFamily: 'Inter', fontWeight: 'bold', fontSize: 7 },
  gSubRow: { flexDirection: 'row', width: '78%' },
  gSub: { color: '#fff', fontFamily: 'Inter', fontWeight: 'bold', fontSize: 6, textAlign: 'center', paddingVertical: 4, paddingHorizontal: 2, borderRightWidth: 0.5, borderRightColor: '#fff' },
  dRow: { flexDirection: 'row', borderWidth: 0.6, borderColor: RULE, borderTopWidth: 0, minHeight: 26 },
  dBreed: { width: '22%', fontFamily: 'Inter', fontWeight: 'bold', fontSize: 9, padding: 5, justifyContent: 'center', borderRightWidth: GROUP_RULE, borderRightColor: G },
  dNum: { width: '13%', fontFamily: 'Inter', fontWeight: 'bold', fontSize: 11, textAlign: 'center', paddingVertical: 6, borderRightWidth: 0.6, borderRightColor: RULE, justifyContent: 'center' },
  dGroupDivider: { borderRightWidth: GROUP_RULE, borderRightColor: G },
  dBlank: { backgroundColor: '#f4f6f4' },
  note: { borderWidth: 0.8, borderColor: G, color: G, fontFamily: 'Inter', fontWeight: 'bold', fontSize: 7, padding: 4, marginVertical: 8 },
  sign: { fontSize: 8, paddingVertical: 8 },
  line: { borderBottomWidth: 0.7, borderBottomColor: '#333' },
  footer: { textAlign: 'center', fontSize: 6.5, color: '#555', marginTop: 8, lineHeight: 1.4 },
});

export interface Sh01ReportInfo {
  society: string;
  showDate: string; // DD/MM/YYYY
  secretaryName: string;
}

function NumCell({ value, show, groupDivider }: { value: number; show: boolean; groupDivider?: boolean }) {
  return (
    <View style={[s.dNum, ...(show ? [] : [s.dBlank]), ...(groupDivider ? [s.dGroupDivider] : [])]}>
      <Text>{show ? String(value) : ''}</Text>
    </View>
  );
}

function BreedRow({ row }: { row: Sh01BreedRow }) {
  const sep = row.judgedSeparately;
  return (
    <View style={s.dRow} wrap={false}>
      <View style={s.dBreed}><Text>{row.breedName}</Text></View>
      <NumCell value={row.dogs} show={sep} />
      <NumCell value={row.absentDogs} show={sep} />
      <NumCell value={row.bitches} show={sep} />
      <NumCell value={row.absentBitches} show={sep} groupDivider />
      <NumCell value={row.mixed} show={!sep} />
      <NumCell value={row.absentMixed} show={!sep} />
    </View>
  );
}

function EmptyRow() {
  return (
    <View style={s.dRow} wrap={false}>
      <View style={s.dBreed}><Text> </Text></View>
      <View style={s.dNum} /><View style={s.dNum} /><View style={s.dNum} />
      <View style={[s.dNum, s.dGroupDivider]} />
      <View style={[s.dNum, s.dBlank]} /><View style={[s.dNum, s.dBlank]} />
    </View>
  );
}

export function Sh01AbsenteeReport({ info, breeds }: { info: Sh01ReportInfo; breeds: Sh01BreedRow[] }) {
  const emptyRows = Math.max(0, 6 - breeds.length);
  return (
    <Document title={`SH01 Absentee Report — ${info.society}`} author="Remi Show Manager">
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.badge}>SH01</Text>
        {kcLogo ? <Image src={kcLogo} style={s.logo} /> : null}
        <Text style={s.title}>SINGLE BREED/SUB GROUP CHAMPIONSHIP ABSENTEE REPORT</Text>

        <View style={s.bar}>
          <Text style={s.barText}>DETAILS OF SOCIETY</Text>
          <Text style={s.barText}>PLEASE COMPLETE IN BLOCK CAPITALS AND INK</Text>
        </View>
        <View style={s.frow}>
          <Text style={s.fLbl}>NAME OF SOCIETY</Text>
          <Text style={s.fVal}>{info.society.toUpperCase()}</Text>
        </View>
        {/* DATE OF SHOW + NAME OF SECRETARY share one row on the official form. */}
        <View style={[s.frow, { padding: 0 }]}>
          <View style={[s.fHalf, s.fHalfBorder]}>
            <Text style={s.fLbl}>DATE OF SHOW</Text>
            <Text style={s.fVal}>{info.showDate}</Text>
          </View>
          <View style={s.fHalf}>
            <Text style={s.fLbl}>NAME OF SECRETARY</Text>
            <Text style={s.fVal}>{info.secretaryName.toUpperCase()}</Text>
          </View>
        </View>

        <Text style={s.instr}>
          Please list below the total number of dogs (not entries) and absentees for breeds that were awarded CCs.{'\n'}
          Please note that it is not necessary to state the number of dogs and absentees per class.{'\n'}
          If the breed was judged separately (dogs and bitches) then please only complete the Dogs and Bitches section and leave the Mixed section blank. Alternatively, if the breed was judged together, then please only complete the Mixed section and leave the Dogs and Bitches section blank.
        </Text>

        {/* Main table */}
        <View style={s.gWrap}>
          <View style={s.gGroupHeadRow}>
            <View style={s.gBreedTopCell} />
            <View style={s.gGroupRow}>
              <Text style={[s.gGroup, { width: '66.66%' }]}>DOGS &amp; BITCHES</Text>
              <Text style={[s.gGroup, { width: '33.33%' }]}>MIXED</Text>
            </View>
          </View>
          <View style={s.gSubHeadRow}>
            <View style={s.gBreedCell}><Text style={s.gBreedText}>BREED</Text></View>
            <View style={s.gSubRow}>
              <Text style={[s.gSub, { width: '16.66%' }]}>NO. OF DOGS</Text>
              <Text style={[s.gSub, { width: '16.66%' }]}>NO. OF ABSENTEES (DOGS)</Text>
              <Text style={[s.gSub, { width: '16.66%' }]}>NO. OF BITCHES</Text>
              <Text style={[s.gSub, { width: '16.66%', borderRightWidth: GROUP_RULE }]}>NO. OF ABSENTEES (BITCHES)</Text>
              <Text style={[s.gSub, { width: '16.66%' }]}>NO. OF DOGS &amp; BITCHES</Text>
              <Text style={[s.gSub, { width: '16.66%' }]}>NO. OF ABSENTEES</Text>
            </View>
          </View>
        </View>
        {breeds.map((r) => <BreedRow key={r.breedName} row={r} />)}
        {Array.from({ length: emptyRows }).map((_, i) => <EmptyRow key={`e${i}`} />)}

        <Text style={s.note}>
          The figures provided on this sheet are used to calculate the annual allocation of CCs and the Stud Book bands. Therefore, it is absolutely vital you ensure the correct statistics are provided in the columns above.
        </Text>

        {/* wrap={false}: the office-use bar and the declaration/signature block
            are small and belong together — never split across a page break. */}
        <View wrap={false}>
          <View style={s.bar}><Text style={s.barText}>OFFICE USE ONLY</Text></View>
          <View style={s.sign}>
            <Text>I declare that the information provided on this form is correct</Text>
            <View style={{ flexDirection: 'row', marginTop: 14, alignItems: 'flex-end' }}>
              <Text>Print Name </Text><View style={[s.line, { width: 150, marginRight: 18 }]} />
              <Text>Signature </Text><View style={[s.line, { width: 150, marginRight: 18 }]} />
              <Text>Date </Text><View style={[s.line, { width: 90 }]} />
            </View>
          </View>
        </View>

        <Text style={s.footer}>
          The Kennel Club, Kennel Club House, Gatehouse Way, Aylesbury HP19 8DB  ·  Telephone 01296 318540  ·  www.thekennelclub.org.uk{'\n'}
          All information is correct at time of printing{'\n'}
          SH01/CAT VERSION 6 JUNE 2023  ·  Generated by Remi
        </Text>
      </Page>
    </Document>
  );
}
