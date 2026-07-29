import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { readFileSync } from 'fs';
import path from 'path';
// Side-effect: registers the HankenGrotesk family. Imported from the single
// shared module — NEVER re-register the family inline in this file (it
// corrupted font tag allocation elsewhere in the print pipeline, 2026-07-10;
// see src/lib/pdf-fonts.ts).
import '@/lib/pdf-fonts';
import type { SettlementSection, SettlementSnapshot } from '@/server/db/schema/invoices';

const remiLogo: string | null = (() => {
  try {
    const buf = readFileSync(path.join(process.cwd(), 'public', 'branding', 'remi-horizontal.png'));
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
})();

const C = {
  ink: '#1b241d',
  mid: '#52525b',
  light: '#71717a',
  rule: '#d4d4d8',
  band: '#20452c',
  bandText: '#f3ecdc',
  zebra: '#f4f4f5',
  credit: '#1a7a3c',
};

const s = StyleSheet.create({
  page: { paddingTop: 20, paddingBottom: 24, paddingHorizontal: 38, fontFamily: 'HankenGrotesk', fontSize: 9.5, color: C.ink },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  logo: { width: 100, objectFit: 'contain' },
  title: { fontSize: 20, fontWeight: 800, color: C.band, textAlign: 'right' },
  meta: { fontSize: 8.5, color: C.mid, textAlign: 'right', marginTop: 1.5 },

  clubName: { fontSize: 12.5, fontWeight: 700, marginBottom: 1 },
  showLine: { fontSize: 9, color: C.mid, marginBottom: 3, lineHeight: 1.25 },

  band: { flexDirection: 'row', backgroundColor: C.band, paddingVertical: 3, paddingHorizontal: 8, marginTop: 5 },
  bandLabel: { color: C.bandText, fontWeight: 700, fontSize: 9, flex: 1 },
  bandAmt: { color: C.bandText, fontWeight: 700, fontSize: 9, width: 80, textAlign: 'right' },

  row: { flexDirection: 'row', paddingVertical: 2.5, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: C.rule },
  rowAlt: { backgroundColor: C.zebra },
  cellDesc: { flex: 1, fontSize: 9 },
  cellSub: { fontSize: 7, color: C.light, marginTop: 0.5 },
  cellAmt: { width: 80, textAlign: 'right', fontSize: 9 },
  creditAmt: { width: 80, textAlign: 'right', fontSize: 9, color: C.credit },

  totalRow: { flexDirection: 'row', paddingVertical: 3.5, paddingHorizontal: 8, borderTopWidth: 1.2, borderTopColor: C.ink },
  totalLabel: { flex: 1, fontWeight: 700, fontSize: 9.5 },
  totalAmt: { width: 80, textAlign: 'right', fontWeight: 700, fontSize: 9.5 },

  entriesLine: { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 8, justifyContent: 'space-between' },
  entriesLineLabel: { fontWeight: 700, fontSize: 8.5 },
  entriesLineValue: { fontSize: 8.5, color: C.mid },

  netBand: { flexDirection: 'row', backgroundColor: C.band, paddingVertical: 7, paddingHorizontal: 12, marginTop: 6, borderRadius: 3 },
  netLabel: { color: C.bandText, fontWeight: 700, fontSize: 13, flex: 1 },
  netAmt: { color: C.bandText, fontWeight: 700, fontSize: 13, textAlign: 'right' },

  footNote: { marginTop: 5, fontSize: 7, color: C.light, lineHeight: 1.3 },

  captureGap: { marginTop: 5, padding: 6, borderWidth: 1, borderColor: '#c9a227', borderRadius: 4, backgroundColor: '#fdf6e3' },
  captureGapText: { fontSize: 7.5, color: '#7a5c00' },

  footer: { position: 'absolute', bottom: 12, left: 38, right: 38, textAlign: 'center', fontSize: 6.5, color: C.light, borderTopWidth: 0.5, borderTopColor: C.rule, paddingTop: 4 },
});

function money(pence: number): string {
  const sign = pence < 0 ? '-' : '';
  const abs = Math.abs(pence);
  return `${sign}£${(abs / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Section({ section }: { section: SettlementSection }) {
  return (
    <View wrap={false}>
      <View style={s.band}>
        <Text style={s.bandLabel}>{section.title}</Text>
        <Text style={s.bandAmt}>Amount</Text>
      </View>
      {section.lines.map((l, i) => (
        <View key={i} style={i % 2 === 1 ? [s.row, s.rowAlt] : s.row}>
          <View style={s.cellDesc}>
            <Text>{l.label}</Text>
            {l.sub ? <Text style={s.cellSub}>{l.sub}</Text> : null}
          </View>
          <Text style={l.isCredit ? s.creditAmt : s.cellAmt}>{money(l.amountPence)}</Text>
        </View>
      ))}
      <View style={s.totalRow}>
        <Text style={s.totalLabel}>{section.totalLabel}</Text>
        <Text style={s.totalAmt}>{money(section.totalPence)}</Text>
      </View>
    </View>
  );
}

export type InvoicePdfInfo = {
  invoiceNumber: string;
  clubName: string;
  showName: string;
  showDate: string;
  issuedAt: string;
};

export function InvoicePdf({
  info,
  lineItems,
  netToClubPence,
  captureGapCount,
}: {
  info: InvoicePdfInfo;
  /** Rendered VERBATIM from the issued invoice's snapshot — never recomputed here. */
  lineItems: SettlementSnapshot;
  netToClubPence: number;
  captureGapCount: number;
}) {
  return (
    <Document title={`Settlement ${info.invoiceNumber} — ${info.clubName}`} author="Remi Show Manager">
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          {remiLogo ? <Image src={remiLogo} style={s.logo} /> : <Text>Remi</Text>}
          <View>
            <Text style={s.title}>SETTLEMENT</Text>
            <Text style={s.meta}>Statement &amp; invoice</Text>
            <Text style={s.meta}>Date: {info.issuedAt}</Text>
            <Text style={s.meta}>Invoice ref: {info.invoiceNumber}</Text>
          </View>
        </View>

        <Text style={s.clubName}>{info.clubName}</Text>
        <Text style={s.showLine}>
          {info.showName}
          {'\n'}
          {info.showDate}
        </Text>

        <Section section={lineItems.viaRemi} />
        <Section section={lineItems.direct} />
        {lineItems.free.lines.length > 0 ? <Section section={lineItems.free} /> : null}

        <View style={s.entriesLine}>
          <Text style={s.entriesLineLabel}>Total entries</Text>
          <Text style={s.entriesLineValue}>{lineItems.totalEntriesLine}</Text>
        </View>

        <Section section={lineItems.costs} />

        <View style={s.netBand}>
          <Text style={s.netLabel}>Net to credit the club</Text>
          <Text style={s.netAmt}>{money(netToClubPence)}</Text>
        </View>

        {captureGapCount > 0 ? (
          <View style={s.captureGap}>
            <Text style={s.captureGapText}>
              {captureGapCount} payment{captureGapCount === 1 ? '' : 's'} missing captured fee data — figures may be
              incomplete.
            </Text>
          </View>
        ) : null}

        <Text style={s.footNote}>
          The net figure above is the money Remi collected on the club&apos;s behalf ({money(lineItems.viaRemi.totalPence)})
          less Remi&apos;s costs ({money(lineItems.costs.totalPence)}), and will be paid to the club by bank transfer
          after the show. Costs are deducted from the amount collected, so no separate payment is needed — this
          statement also serves as your invoice (ref {info.invoiceNumber}).
          {lineItems.direct.totalPence > 0
            ? ` The ${money(lineItems.direct.totalPence)} of postal/manual entries was paid directly to the club and is shown for completeness only — it is not part of the Remi transfer.`
            : ''}
          {' '}Card fees are the actual amounts charged by Stripe Payments UK, Ltd. — not an estimate. Remi Show
          Manager is not VAT registered.
        </Text>

        <Text
          style={s.footer}
          fixed
          render={({ pageNumber, totalPages }) => `Remi  ·  remishowmanager.co.uk  ·  Page ${pageNumber} of ${totalPages}`}
        />
      </Page>
    </Document>
  );
}
