import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { readFileSync } from 'fs';
import path from 'path';
// Side-effect: registers the HankenGrotesk family. Imported from the single
// shared module — NEVER re-register the family inline in this file (it
// corrupted font tag allocation elsewhere in the print pipeline, 2026-07-10;
// see src/lib/pdf-fonts.ts).
import '@/lib/pdf-fonts';
import type { InvoiceLineItem } from '@/server/db/schema';

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
  rule: '#d4d4d8',
  band: '#20452c',
  bandText: '#f3ecdc',
  zebra: '#f4f4f5',
  credit: '#1a7a3c',
};

const s = StyleSheet.create({
  page: { paddingTop: 30, paddingBottom: 40, paddingHorizontal: 36, fontFamily: 'HankenGrotesk', fontSize: 9.5, color: C.ink },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  logo: { width: 110, objectFit: 'contain' },
  invoiceTitle: { fontSize: 20, fontWeight: 800, color: C.band, marginBottom: 2 },
  invoiceNumber: { fontSize: 10, color: C.mid },

  partiesRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18, gap: 24 },
  partyBlock: { flex: 1 },
  partyLabel: { fontSize: 7.5, fontWeight: 700, color: C.mid, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  partyLine: { fontSize: 9, color: C.ink, marginBottom: 1.5 },
  partyLineMuted: { fontSize: 8, color: C.mid, marginBottom: 1.5 },

  thead: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: C.band, paddingVertical: 5, paddingHorizontal: 8, marginTop: 6 },
  th: { color: C.bandText, fontWeight: 700, fontSize: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: C.rule },
  rowAlt: { backgroundColor: C.zebra },
  rowLabel: { fontSize: 9.5 },
  rowLabelBold: { fontSize: 9.5, fontWeight: 700 },
  rowSub: { fontSize: 7.5, color: C.mid, marginTop: 1 },
  rowAmount: { fontSize: 9.5 },
  rowAmountBold: { fontSize: 9.5, fontWeight: 700 },
  rowAmountCredit: { fontSize: 9.5, color: C.credit },

  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 8, backgroundColor: C.band, marginTop: 4 },
  totalLabel: { fontSize: 11, fontWeight: 800, color: C.bandText },
  totalAmount: { fontSize: 12, fontWeight: 800, color: C.bandText },

  settlementBox: { marginTop: 22, padding: 12, borderWidth: 1, borderColor: C.rule, borderRadius: 4, backgroundColor: '#fafaf9' },
  settlementTitle: { fontSize: 9, fontWeight: 700, marginBottom: 4 },
  settlementText: { fontSize: 8.5, color: C.mid, lineHeight: 1.4 },

  vatNote: { marginTop: 8, fontSize: 7.5, color: C.mid },

  captureGap: { marginTop: 10, padding: 8, borderWidth: 1, borderColor: '#c9a227', borderRadius: 4, backgroundColor: '#fdf6e3' },
  captureGapText: { fontSize: 8, color: '#7a5c00' },

  footer: { position: 'absolute', bottom: 18, left: 36, right: 36, textAlign: 'center', fontSize: 7, color: C.mid },
});

function money(pence: number): string {
  const sign = pence < 0 ? '-' : '';
  const abs = Math.abs(pence);
  return `${sign}£${(abs / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  captureGapCount,
}: {
  info: InvoicePdfInfo;
  /** Rendered VERBATIM from the issued invoice's snapshot — never recomputed here. */
  lineItems: InvoiceLineItem[];
  captureGapCount: number;
}) {
  return (
    <Document title={`Invoice ${info.invoiceNumber} — ${info.clubName}`} author="Remi Show Manager">
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.invoiceTitle}>Invoice</Text>
            <Text style={s.invoiceNumber}>{info.invoiceNumber}</Text>
            <Text style={s.invoiceNumber}>{info.issuedAt}</Text>
          </View>
          {remiLogo ? <Image src={remiLogo} style={s.logo} /> : null}
        </View>

        <View style={s.partiesRow}>
          <View style={s.partyBlock}>
            <Text style={s.partyLabel}>From</Text>
            <Text style={s.partyLine}>Remi Show Manager</Text>
            <Text style={s.partyLineMuted}>Michael James T/A Remi Show Manager</Text>
            <Text style={s.partyLineMuted}>William House, Mobbs Way</Text>
            <Text style={s.partyLineMuted}>Lowestoft, NR32 3AL</Text>
            <Text style={s.partyLineMuted}>remishowmanager.co.uk</Text>
            <Text style={s.partyLineMuted}>ICO reg. C1920187</Text>
          </View>
          <View style={s.partyBlock}>
            <Text style={s.partyLabel}>Billed to</Text>
            <Text style={s.partyLine}>The Secretary</Text>
            <Text style={s.partyLine}>{info.clubName}</Text>
            <Text style={s.partyLineMuted}>{info.showName}</Text>
            <Text style={s.partyLineMuted}>{info.showDate}</Text>
          </View>
        </View>

        <View style={s.thead}>
          <Text style={s.th}>Description</Text>
          <Text style={s.th}>Amount</Text>
        </View>

        {lineItems.map((item, i) => {
          if (item.isTotal) {
            return (
              <View key={i} style={s.totalRow}>
                <Text style={s.totalLabel}>{item.label}</Text>
                <Text style={s.totalAmount}>{money(item.amountPence)}</Text>
              </View>
            );
          }
          return (
            <View key={i} style={i % 2 === 1 ? [s.row, s.rowAlt] : s.row}>
              <View>
                <Text style={s.rowLabel}>{item.label}</Text>
                {item.sub ? <Text style={s.rowSub}>{item.sub}</Text> : null}
              </View>
              <Text style={item.isCredit ? s.rowAmountCredit : s.rowAmount}>{money(item.amountPence)}</Text>
            </View>
          );
        })}

        {captureGapCount > 0 ? (
          <View style={s.captureGap}>
            <Text style={s.captureGapText}>
              {captureGapCount} payment{captureGapCount === 1 ? '' : 's'} missing captured fee data — figures may be incomplete.
            </Text>
          </View>
        ) : null}

        <View style={s.settlementBox}>
          <Text style={s.settlementTitle}>How this is settled</Text>
          <Text style={s.settlementText}>
            The total fee due is deducted from the entry fees Remi collected for this show before the
            remainder is sent to you; any balance still owing is settled by bank transfer.{'\n'}
            Reference: {info.invoiceNumber}
          </Text>
        </View>

        <Text style={s.vatNote}>Remi Show Manager is not VAT registered — no VAT is charged on this invoice.</Text>

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
