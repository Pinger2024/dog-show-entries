/**
 * A3 4-up prize card preview — Amanda's idea (2026-04-23).
 *
 * Renders 4 prize card designs (1st / 2nd / 3rd / Reserve) tiled 2×2 on a
 * single A3 landscape page. 20-25 copies of this sheet on Mixam's A3 silk
 * flyer product cost ~£16-19 inc VAT = 20p per A5 card after guillotining.
 *
 * Run: npx tsx scripts/preview-a3-4up.tsx
 * Output: /tmp/a3-4up-preview.pdf
 */
import React from 'react';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Document, Page, Text, View, StyleSheet, Font, Image } from '@react-pdf/renderer';
import { renderToBuffer } from '@react-pdf/renderer';

const fontsDir = path.join(process.cwd(), 'public', 'fonts');
Font.register({
  family: 'Times',
  fonts: [
    { src: path.join(fontsDir, 'times-new-roman.ttf') },
    { src: path.join(fontsDir, 'times-new-roman-bold.ttf'), fontWeight: 'bold' },
    { src: path.join(fontsDir, 'times-new-roman-italic.ttf'), fontStyle: 'italic' },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

const SHOW = {
  organisation: 'Clyde Valley German Shepherd Dog Club',
  name: 'Championship Show 2026',
  date: 'Saturday 16 May 2026',
  showType: 'Championship Show',
};

const PLACEMENTS = [
  { label: 'First',   colour: '#C41E3A', fill: '#FDE8EC' },
  { label: 'Second',  colour: '#1E4D8C', fill: '#E3ECF6' },
  { label: 'Third',   colour: '#C5960C', fill: '#FDF6E0' },
  { label: 'Reserve', colour: '#1E7A3A', fill: '#E4F5EA' },
] as const;

// A3 landscape in pt: 1191 × 842
// One A5 landscape card in pt: 595 × 421
// Two cards across × two down = 1190 × 842 — fits A3 landscape precisely.
const CARD_W = 595;
const CARD_H = 421;

const s = StyleSheet.create({
  page: { fontFamily: 'Times', padding: 0, backgroundColor: '#fff' },
  sheet: { flexDirection: 'row', flexWrap: 'wrap', width: CARD_W * 2, height: CARD_H * 2 },
  card: { width: CARD_W, height: CARD_H, position: 'relative' },
  // Light crop-mark ruling so Amanda can see exactly where the guillotine cut lands
  cropLineV: { position: 'absolute', top: 0, bottom: 0, left: CARD_W, width: 0.5, backgroundColor: '#ccc' },
  cropLineH: { position: 'absolute', left: 0, right: 0, top: CARD_H, height: 0.5, backgroundColor: '#ccc' },
  outerBorder: {
    position: 'absolute', top: 12, left: 12, right: 12, bottom: 12, borderWidth: 3,
  },
  innerBorder: {
    position: 'absolute', top: 18, left: 18, right: 18, bottom: 18, borderWidth: 0.75, borderColor: '#999',
  },
  content: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'space-between' },
  topZone: { alignItems: 'center', width: '100%', marginTop: 18 },
  clubName: { fontSize: 22, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1.5, color: '#1a1a1a', marginBottom: 3, textAlign: 'center' },
  showName: { fontSize: 14, fontStyle: 'italic', color: '#444', marginBottom: 2, textAlign: 'center' },
  showMeta: { fontSize: 10, color: '#666', textAlign: 'center' },
  middleZone: { alignItems: 'center', width: '100%', marginTop: 10 },
  rule: { width: '70%', borderBottomWidth: 1.25, marginVertical: 6 },
  placementContainer: { paddingVertical: 8, paddingHorizontal: 36, borderWidth: 2.5, marginVertical: 2 },
  placementText: { fontSize: 36, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 4, textAlign: 'center' },
  bottomZone: { alignItems: 'center', width: '100%', marginBottom: 14 },
  writeInLabel: { fontSize: 10, fontStyle: 'italic', color: '#888', marginTop: 14, marginBottom: 2 },
  writeInLine: { borderBottomWidth: 0.75, borderBottomColor: '#bbb', width: '70%', height: 24 },
  footer: { position: 'absolute', bottom: 18, left: 0, right: 0, fontSize: 8, fontStyle: 'italic', color: '#aaa', textAlign: 'center' },
});

function Card({ placement }: { placement: typeof PLACEMENTS[number] }) {
  return (
    <View style={{ ...s.card, backgroundColor: placement.fill }}>
      <View style={{ ...s.outerBorder, borderColor: placement.colour }} />
      <View style={s.innerBorder} />
      <View style={s.content}>
        <View style={s.topZone}>
          <Text style={s.clubName}>{SHOW.organisation}</Text>
          <Text style={s.showName}>{SHOW.name}</Text>
          <Text style={s.showMeta}>{SHOW.showType} · {SHOW.date}</Text>
        </View>
        <View style={s.middleZone}>
          <View style={{ ...s.rule, borderBottomColor: placement.colour }} />
          <View style={{ ...s.placementContainer, borderColor: placement.colour }}>
            <Text style={{ ...s.placementText, color: placement.colour }}>{placement.label}</Text>
          </View>
          <View style={{ ...s.rule, borderBottomColor: placement.colour }} />
        </View>
        <View style={s.bottomZone}>
          <Text style={s.writeInLabel}>Class</Text>
          <View style={s.writeInLine} />
          <Text style={s.writeInLabel}>Exhibit</Text>
          <View style={s.writeInLine} />
        </View>
      </View>
      <Text style={s.footer}>RemiShowManager.co.uk</Text>
    </View>
  );
}

function A3Sheet() {
  return (
    <Document title="A3 4-up prize card preview" author="Remi Show Manager">
      <Page size="A3" orientation="landscape" style={s.page}>
        <View style={s.sheet}>
          {PLACEMENTS.map((p) => (
            <Card key={p.label} placement={p} />
          ))}
        </View>
        {/* guillotine guide lines */}
        <View style={s.cropLineV} />
        <View style={s.cropLineH} />
      </Page>
    </Document>
  );
}

async function main() {
  const buf = await renderToBuffer(<A3Sheet />);
  const out = '/tmp/a3-4up-preview.pdf';
  await fs.writeFile(out, buf);
  console.log(`Wrote ${out} (${(buf.length / 1024).toFixed(1)} KB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
