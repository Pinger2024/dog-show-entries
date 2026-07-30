import path from 'path';
import { readFileSync } from 'fs';
import { Document, Page, View, Text, Image, StyleSheet, Font } from '@react-pdf/renderer';
import type { SvResultsReportData } from '@/lib/sv-results';

/**
 * SV / WUSV graded RESULTS report (Mandy 2026-06-27 — the GSDL British Regional
 * Group secretary needs Remi to produce the graded results sheet regional clubs
 * circulate after a show). Mirrors the GSDL sample's structure (coat → class →
 * graded rows → Best/Most-Promising + Junior Handling footer) with Remi's house
 * styling.
 *
 * Inter is registered (not the base-14 Helvetica) because GSD pedigree names are
 * full of Czech / Polish / Lithuanian diacritics (č, ž, ł, ė, í) that WinAnsi
 * Helvetica can't encode — and an embedded font also passes print preflight.
 */
const fontsDir = path.join(process.cwd(), 'public', 'fonts');
Font.register({
  family: 'Inter',
  fonts: [
    { src: path.join(fontsDir, 'inter-regular.ttf') },
    { src: path.join(fontsDir, 'inter-regular.ttf'), fontStyle: 'italic' },
    { src: path.join(fontsDir, 'inter-semibold.ttf'), fontWeight: 'bold' },
    { src: path.join(fontsDir, 'inter-semibold.ttf'), fontWeight: 'bold', fontStyle: 'italic' },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

const remiLogo: string | null = (() => {
  try {
    const buf = readFileSync(path.join(process.cwd(), 'public', 'branding', 'remi-horizontal.png'));
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
})();

const C = {
  ink: '#1a1a1a',
  mid: '#52525b',
  faint: '#71717a',
  rule: '#d4d4d8',
  band: '#0d5c3d',
  bandText: '#ffffff',
  coatBg: '#0d5c3d',
  classBg: '#eef3f0',
  absent: '#a1a1aa',
};

const s = StyleSheet.create({
  page: {
    paddingTop: 26,
    paddingBottom: 38,
    paddingHorizontal: 32,
    fontFamily: 'Inter',
    fontSize: 9,
    color: C.ink,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  org: { fontSize: 9, color: C.mid, marginBottom: 2 },
  showName: { fontSize: 15, fontWeight: 'bold', marginBottom: 3 },
  title: { fontSize: 11, fontWeight: 'bold', color: C.band },
  meta: { fontSize: 8, color: C.mid, marginTop: 3 },
  metaStrong: { fontSize: 8.5, color: C.ink, marginTop: 2 },
  logo: { width: 92, objectFit: 'contain' },

  // Coat section heading (Short Coat / Long Coats)
  coatHead: {
    backgroundColor: C.coatBg,
    color: C.bandText,
    fontSize: 11,
    fontWeight: 'bold',
    paddingVertical: 4,
    paddingHorizontal: 6,
    marginTop: 10,
    marginBottom: 2,
  },
  // Class sub-heading (Working Male (2 years +))
  classHead: {
    backgroundColor: C.classBg,
    color: C.band,
    fontSize: 9.5,
    fontWeight: 'bold',
    paddingVertical: 3,
    paddingHorizontal: 6,
    marginTop: 6,
    marginBottom: 1,
  },

  // Result rows
  row: { flexDirection: 'row', paddingVertical: 2.5, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: C.rule },
  gradeCell: { width: '9%', fontWeight: 'bold', fontSize: 8.5 },
  placeCell: { width: '7%', fontSize: 8.5, color: C.mid },
  nameCell: { width: '34%', fontWeight: 'bold', fontSize: 8.5, paddingRight: 6 },
  sireCell: { width: '25%', fontSize: 8, color: C.faint, paddingRight: 6 },
  damCell: { width: '25%', fontSize: 8, color: C.faint },
  pedLabel: { color: C.mid },
  absentText: { color: C.absent },

  // Footer — awards + junior handling
  footerWrap: { marginTop: 14 },
  awardsBox: { borderTopWidth: 1.5, borderTopColor: C.band, paddingTop: 8 },
  awardRow: { flexDirection: 'row', paddingVertical: 2 },
  awardLabel: { width: '42%', fontWeight: 'bold', fontSize: 9.5 },
  awardValue: { width: '58%', fontSize: 9.5 },

  jhBox: { marginTop: 12, borderTopWidth: 0.5, borderTopColor: C.rule, paddingTop: 8 },
  jhJudge: { fontSize: 9, fontWeight: 'bold', marginBottom: 4 },
  jhGroupHead: { fontSize: 9, fontWeight: 'bold', color: C.band, marginTop: 4, marginBottom: 1 },
  jhRow: { flexDirection: 'row', paddingVertical: 1.5, paddingLeft: 12 },
  jhPlace: { width: 28, fontSize: 8.5, color: C.mid },
  jhName: { fontSize: 8.5 },

  footer: { position: 'absolute', bottom: 16, left: 32, right: 32, textAlign: 'center', fontSize: 7, color: C.mid },
});

export interface SvResultsReportInfo {
  orgName: string | null;
  showName: string;
  showDate: string;
  generatedAt: string;
}

export function SvResultsReport({ info, data }: { info: SvResultsReportInfo; data: SvResultsReportData }) {
  return (
    <Document title={`SV Graded Results — ${info.showName}`} author="Remi Show Manager">
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header} fixed>
          <View style={{ flex: 1, paddingRight: 12 }}>
            {info.orgName ? <Text style={s.org}>{info.orgName}</Text> : null}
            <Text style={s.showName}>{info.showName}</Text>
            <Text style={s.title}>SV Graded Results</Text>
            <Text style={s.metaStrong}>
              {info.showDate}  ·  Entered {data.entered} · Present {data.present} · Absentees {data.absenteePct}%
            </Text>
            {data.judgeName ? <Text style={s.meta}>Judge: {data.judgeName}</Text> : null}
          </View>
          {remiLogo ? <Image src={remiLogo} style={s.logo} /> : null}
        </View>

        {/* Body — coat sections */}
        {data.coatSections.map((section, si) => (
          <View key={si}>
            {section.title ? <Text style={s.coatHead}>{section.title}</Text> : null}
            {section.classes.map((cls, ci) => (
              <View key={ci} wrap={false}>
                <Text style={s.classHead}>{cls.label}</Text>
                {cls.rows.map((r, ri) => (
                  <View key={ri} style={s.row} wrap={false}>
                    <Text style={[s.gradeCell, r.absent ? s.absentText : {}]}>{r.grade}</Text>
                    <Text style={[s.placeCell, r.absent ? s.absentText : {}]}>{r.placement}</Text>
                    <Text style={[s.nameCell, r.absent ? s.absentText : {}]}>{r.name}</Text>
                    <Text style={[s.sireCell, r.absent ? s.absentText : {}]}>{r.sire}</Text>
                    <Text style={[s.damCell, r.absent ? s.absentText : {}]}>{r.dam}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ))}

        {/* Footer — Best / Most Promising awards */}
        {(data.awards.length > 0 || data.jhGroups.length > 0) && (
          <View style={s.footerWrap} wrap={false}>
            {data.awards.length > 0 && (
              <View style={s.awardsBox}>
                {data.awards.map((a, i) => (
                  <View key={i} style={s.awardRow}>
                    <Text style={s.awardLabel}>{a.label}</Text>
                    <Text style={s.awardValue}>{a.dogName}</Text>
                  </View>
                ))}
              </View>
            )}

            {data.jhGroups.length > 0 && (
              <View style={s.jhBox}>
                {data.jhJudgeName ? <Text style={s.jhJudge}>Junior Handling — Judge: {data.jhJudgeName}</Text> : null}
                {data.jhGroups.map((g, gi) => (
                  <View key={gi}>
                    <Text style={s.jhGroupHead}>{g.label}</Text>
                    {g.rows.map((row, ri) => (
                      <View key={ri} style={s.jhRow}>
                        <Text style={s.jhPlace}>{row.placement}</Text>
                        <Text style={s.jhName}>{row.handler}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        <Text
          style={s.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `Produced with Remi  ·  remishowmanager.co.uk  ·  Page ${pageNumber} of ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}
