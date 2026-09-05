/* One-off (Mandy 2026-08-24): Remi-branded invoice to GSDL – British Regional
 * Group for the North East Regional's grading cards, at exact Doxzoo cost with
 * no margin — the 2026 regional-show arrangement (decided 2026-08-11). Figures
 * transcribed from Mandy's Doxzoo order confirmation. Same layout as the
 * Michael-reviewed BAGSD invoice (_tmp-invoice.ts). Payable by BACS, so this
 * one DOES carry the payment block — pass the account number as argv[2].
 */
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

const ACCOUNT_NUMBER = process.argv[2] ?? '';
if (!ACCOUNT_NUMBER) {
  console.error('usage: tsx scripts/_invoice-gsdl-brg-grading-cards.ts <remi-account-number>');
  process.exit(1);
}

const logo = (() => {
  try {
    const b = readFileSync(path.join(process.cwd(), 'public', 'branding', 'remi-horizontal.png'));
    return `data:image/png;base64,${b.toString('base64')}`;
  } catch { return null; }
})();

const C = { ink: '#1a1a1a', mid: '#52525b', light: '#71717a', band: '#0d5c3d', rule: '#d4d4d8', zebra: '#f4f4f5' };
const s = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 40, paddingHorizontal: 40, fontFamily: 'Helvetica', fontSize: 9.5, color: C.ink },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  logo: { width: 120, objectFit: 'contain' },
  invTitle: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: C.band, textAlign: 'right' },
  invMeta: { fontSize: 9, color: C.mid, textAlign: 'right', marginTop: 4 },
  parties: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 26 },
  partyBox: { width: '48%' },
  partyLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 1, color: C.light, marginBottom: 4 },
  partyName: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  partyLine: { fontSize: 9, color: C.mid, marginBottom: 1.5 },
  thead: { flexDirection: 'row', backgroundColor: C.band, paddingVertical: 5, paddingHorizontal: 8 },
  thDesc: { color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 8.5, flex: 1 },
  thAmt: { color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 8.5, width: 90, textAlign: 'right' },
  row: { flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: C.rule },
  rowAlt: { backgroundColor: C.zebra },
  cellDesc: { flex: 1, fontSize: 9.5 },
  cellSub: { fontSize: 7.5, color: C.light, marginTop: 1 },
  cellAmt: { width: 90, textAlign: 'right', fontSize: 9.5 },
  totalRow: { flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 8, borderTopWidth: 1.5, borderTopColor: C.band, marginTop: 2 },
  totalLabel: { flex: 1, fontFamily: 'Helvetica-Bold', fontSize: 12 },
  totalAmt: { width: 90, textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 12 },
  summaryBox: { marginBottom: 18, paddingVertical: 9, paddingHorizontal: 11, backgroundColor: C.zebra, borderRadius: 4 },
  summaryText: { fontSize: 8.8, color: C.mid, marginBottom: 2, lineHeight: 1.35 },
  payBox: { marginTop: 28, borderWidth: 0.75, borderColor: C.rule, borderRadius: 4, padding: 12 },
  payLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 1, color: C.light, marginBottom: 5 },
  payLine: { fontSize: 9, color: C.mid, marginBottom: 2.5 },
  note: { marginTop: 18, fontSize: 8, color: C.light, lineHeight: 1.4 },
  footer: { position: 'absolute', bottom: 18, left: 40, right: 40, textAlign: 'center', fontSize: 7.5, color: C.light, borderTopWidth: 0.5, borderTopColor: C.rule, paddingTop: 6 },
});

type Line = { desc: string; sub?: string; amount: number };

function Invoice() {
  const invoiceNo = 'INV-GSDL-BRG-0001';
  const invoiceDate = '25 August 2026';
  // Doxzoo order confirmation, 24 Aug 2026 21:58 (Mandy's screenshot).
  const lines: Line[] = [
    { desc: 'Grading cards — printing', sub: '69 cards (138 printed pages), A5 landscape, double-sided, silk 350gsm, full colour. Printed by Doxzoo.', amount: 20.80 },
    { desc: 'Production charge', sub: 'Doxzoo production, 2 working days', amount: 3.12 },
    // Doxzoo's three lines already include the £0.81 VAT it charged on the
    // £4.03 standard-rated element (order total £29.57; ex-VAT £28.76).
    { desc: 'Packaging & delivery', sub: 'Royal Mail Tracked 48 to the Event Manager', amount: 5.65 },
  ];
  const total = lines.reduce((sum, l) => sum + l.amount, 0);
  const fmt = (n: number) => `£${n.toFixed(2)}`;
  if (fmt(total) !== '£29.57') throw new Error(`total ${fmt(total)} does not reconcile to the Doxzoo order total £29.57`);

  return React.createElement(Document, { title: `Invoice ${invoiceNo} — GSDL British Regional Group`, author: 'Remi' },
    React.createElement(Page, { size: 'A4', style: s.page },
      React.createElement(View, { style: s.header },
        logo ? React.createElement(Image, { src: logo, style: s.logo }) : React.createElement(Text, {}, 'Remi'),
        React.createElement(View, {},
          React.createElement(Text, { style: s.invTitle }, 'INVOICE'),
          React.createElement(Text, { style: s.invMeta }, `No. ${invoiceNo}`),
          React.createElement(Text, { style: s.invMeta }, `Date: ${invoiceDate}`),
          React.createElement(Text, { style: s.invMeta }, 'Payment due within 30 days'),
        ),
      ),
      React.createElement(View, { style: s.parties },
        React.createElement(View, { style: s.partyBox },
          React.createElement(Text, { style: s.partyLabel }, 'From'),
          React.createElement(Text, { style: s.partyName }, 'Remi Show Manager'),
          React.createElement(Text, { style: s.partyLine }, 'Michael James T/A Remi Show Manager'),
          React.createElement(Text, { style: s.partyLine }, 'William House, Mobbs Way'),
          React.createElement(Text, { style: s.partyLine }, 'Lowestoft, NR32 3AL'),
          React.createElement(Text, { style: s.partyLine }, 'remishowmanager.co.uk'),
          React.createElement(Text, { style: s.partyLine }, 'ICO reg. C1920187'),
        ),
        React.createElement(View, { style: s.partyBox },
          React.createElement(Text, { style: s.partyLabel }, 'Billed to'),
          React.createElement(Text, { style: s.partyName }, 'The Treasurer'),
          React.createElement(Text, { style: s.partyLine }, 'GSDL – British Regional Group'),
          React.createElement(Text, { style: s.partyLine }, 'Re: North East GSD Regional Group show'),
          React.createElement(Text, { style: s.partyLine }, 'Saturday 5 September 2026'),
          React.createElement(Text, { style: s.partyLine }, 'WUSV / GSDL-BRG grading cards'),
        ),
      ),
      React.createElement(View, { style: s.summaryBox },
        React.createElement(Text, { style: s.summaryText }, 'Grading cards for the North East Regional, supplied at cost price. No margin has been added: the amount below is exactly what the printer charged Remi.'),
      ),
      React.createElement(View, { style: s.thead },
        React.createElement(Text, { style: s.thDesc }, 'Description'),
        React.createElement(Text, { style: s.thAmt }, 'Amount'),
      ),
      ...lines.map((l, i) =>
        React.createElement(View, { key: i, style: i % 2 === 1 ? [s.row, s.rowAlt] : s.row },
          React.createElement(View, { style: s.cellDesc },
            React.createElement(Text, {}, l.desc),
            l.sub ? React.createElement(Text, { style: s.cellSub }, l.sub) : null,
          ),
          React.createElement(Text, { style: s.cellAmt }, fmt(l.amount)),
        ),
      ),
      React.createElement(View, { style: s.totalRow },
        React.createElement(Text, { style: s.totalLabel }, 'Total to pay'),
        React.createElement(Text, { style: s.totalAmt }, fmt(total)),
      ),
      React.createElement(View, { style: s.payBox },
        React.createElement(Text, { style: s.payLabel }, 'How to pay — bank transfer'),
        React.createElement(Text, { style: s.payLine }, 'Account name:  Michael James T/A Remi Show Manager'),
        React.createElement(Text, { style: s.payLine }, 'Sort code:  04-06-05'),
        React.createElement(Text, { style: s.payLine }, `Account number:  ${ACCOUNT_NUMBER}`),
        React.createElement(Text, { style: s.payLine }, `Reference:  ${invoiceNo}`),
      ),
      React.createElement(Text, { style: s.note },
        'Remi Show Manager is not VAT registered, so no VAT is charged by Remi on this invoice. The figures above are the printer’s charges to Remi exactly as billed and include £0.81 of VAT the printer charged on the standard-rated element of the order (printer total £29.57; £28.76 excluding that VAT).',
      ),
      React.createElement(Text, { style: s.footer, fixed: true }, 'Remi  ·  remishowmanager.co.uk  ·  Thank you'),
    ),
  );
}

(async () => {
  const buf = await renderToBuffer(Invoice() as any);
  const out = process.argv[3] ?? '/private/tmp/claude-501/-Users-michaeljames-Projects-dog-show-entries/c809a988-5136-48b1-9c06-4ae192b27bd2/scratchpad/Remi-Invoice-INV-GSDL-BRG-0001-Grading-Cards.pdf';
  writeFileSync(out, buf);
  console.log('wrote', out, buf.length);
})().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
