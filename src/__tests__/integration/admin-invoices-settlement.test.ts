import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeOrg,
  makeBreed,
  makeShow,
  makeDog,
  makeEntry,
  makeEntryClass,
  makeShowClass,
  makeClassDef,
  makeOrder,
  makePayment,
  makeSundryItem,
  makeOrderSundryItem,
} from '../helpers/factories';
import { testDb } from '../helpers/db';
import { entries as entriesTable } from '@/server/db/schema';
import { InvoicePdf, type InvoicePdfInfo } from '@/components/reports/invoice-pdf';
import { stripUnembeddedBase14Fonts } from '@/lib/pdf-pad';

/**
 * Reproduces South Western GSD Club's real settlement (INV-SWGSD-0004,
 * hand-built via the one-off sw-settlement.ts script) as a seeded show, then
 * asserts the admin-issued statement lands on the SAME headline figures the
 * hand-built PDF showed — this is the gate for the settlement redesign: the
 * itemisation service must reconcile these shapes exactly, to the penny.
 *
 * Fixture shape (see settlement-itemisation.ts for the rules each piece
 * exercises):
 *  - 76 confirmed entries at 13 distinct price points (£19.45–£19.80ish,
 *    deliberately nudged to sum to EXACTLY £1,483.00) on one viaRemi order
 *    — more than 3 distinct prices, so the "N entries @ £min–£max" range
 *    line applies (rule 1).
 *  - 8 viaRemi + 2 direct entries in Special Award Classes @ £3.00 — the
 *    combined JH/SAC line, detected by class type not price (rule 2).
 *  - 23 "Printed Catalogue" + 1 "Club Membership" sundries, and 3×£5
 *    "Donation" sundries — grouped by name, donations combined onto one
 *    line (rules 3–4).
 *  - An order-level £9.00 discount (components sum £14.83 higher than the
 *    order total) and a £2.00 refund payment row (type='refund') — both
 *    reconciliation lines (rules 4–5... "critical" per the brief).
 *  - 4 direct £20.00 entries, 4 orderless NFC free entries.
 *  - Real card fees summing to £38.69 across 3 payments, discounted 40%
 *    (£15.48) — matches the hand-built INV-SWGSD-0004 costs exactly.
 */
async function seedSouthWesternShapedShow() {
  const breed = await makeBreed();
  const exhibitor = await makeUser({ role: 'exhibitor' });
  const org = await makeOrg({ name: 'South Western Test GSD Club' });
  const show = await makeShow({ organisationId: org.id, breedId: breed.id });
  const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });

  const specialAwardClassDef = await makeClassDef({ name: 'Special Award Class A', type: 'special' });
  const specialAwardClass = await makeShowClass({ showId: show.id, classDefinitionId: specialAwardClassDef.id, entryFee: 300 });

  // ── Order 1 (viaRemi): 76 regular entries at 13 distinct price points,
  // summing to EXACTLY £1,483.00 — computed at runtime, not hand-typed. ──
  const PRICE_POINTS = [1945, 1946, 1947, 1948, 1949, 1950, 1951, 1952, 1953, 1954, 1955, 1956, 1957];
  const COUNTS = [6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 5, 5]; // sums to 76
  const feePence: number[] = [];
  PRICE_POINTS.forEach((price, i) => {
    for (let k = 0; k < COUNTS[i]!; k++) feePence.push(price);
  });
  expect(feePence).toHaveLength(76);
  const rawSum = feePence.reduce((a, b) => a + b, 0);
  feePence[0] = feePence[0]! + (148_300 - rawSum); // nudge to exactly £1,483.00
  expect(feePence.reduce((a, b) => a + b, 0)).toBe(148_300);

  const orderEntries = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 148_300 - 900 });
  for (const fee of feePence) {
    await makeEntry({ showId: show.id, dogId: dog!.id, exhibitorId: exhibitor.id, orderId: orderEntries.id, totalFee: fee });
  }
  await makePayment({ orderId: orderEntries.id, stripePaymentId: 'pi_sw_1', amount: orderEntries.totalAmount, status: 'succeeded', feePence: 2000 });

  // ── Order 2 (viaRemi): 8 Special Award Class entries @ £3.00 + the £2.00 refund. ──
  const orderJhViaRemi = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 2400 });
  for (let i = 0; i < 8; i++) {
    const entry = await makeEntry({ showId: show.id, dogId: dog!.id, exhibitorId: exhibitor.id, orderId: orderJhViaRemi.id, totalFee: 300 });
    await makeEntryClass({ entryId: entry!.id, showClassId: specialAwardClass!.id, fee: 300 });
  }
  await makePayment({ orderId: orderJhViaRemi.id, stripePaymentId: 'pi_sw_2', amount: orderJhViaRemi.totalAmount, status: 'succeeded', feePence: 869 });
  await makePayment({ orderId: orderJhViaRemi.id, stripePaymentId: 'pi_sw_2', amount: 200, status: 'refunded', type: 'refund' });

  // ── Order 3 (viaRemi): sundries — 23 catalogues @ £4.00, 1 membership @ £10.00. ──
  const catalogueItem = await makeSundryItem({ showId: show.id, name: 'Printed Catalogue', priceInPence: 400 });
  const membershipItem = await makeSundryItem({ showId: show.id, name: 'Club Membership', priceInPence: 1000 });
  const orderSundries = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 10_200 });
  await makeOrderSundryItem({ orderId: orderSundries.id, sundryItemId: catalogueItem!.id, quantity: 23, unitPrice: 400 });
  await makeOrderSundryItem({ orderId: orderSundries.id, sundryItemId: membershipItem!.id, quantity: 1, unitPrice: 1000 });
  await makePayment({ orderId: orderSundries.id, stripePaymentId: 'pi_sw_3', amount: orderSundries.totalAmount, status: 'succeeded', feePence: 1000 });

  // ── Order 4 (viaRemi): 3× £5.00 donation sundries. ──
  const donationItem = await makeSundryItem({ showId: show.id, name: 'Donation', priceInPence: 500 });
  const orderDonations = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 1500 });
  await makeOrderSundryItem({ orderId: orderDonations.id, sundryItemId: donationItem!.id, quantity: 3, unitPrice: 500 });

  // ── Order 5 (direct): 4 entries @ £20.00. ──
  const orderDirectEntries = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 8000, stripePaymentIntentId: null });
  for (let i = 0; i < 4; i++) {
    await makeEntry({ showId: show.id, dogId: dog!.id, exhibitorId: exhibitor.id, orderId: orderDirectEntries.id, totalFee: 2000 });
  }

  // ── Order 6 (direct): 2 Special Award Class entries @ £3.00. ──
  const orderDirectJh = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 600, stripePaymentIntentId: null });
  for (let i = 0; i < 2; i++) {
    const entry = await makeEntry({ showId: show.id, dogId: dog!.id, exhibitorId: exhibitor.id, orderId: orderDirectJh.id, totalFee: 300 });
    await makeEntryClass({ entryId: entry!.id, showClassId: specialAwardClass!.id, fee: 300 });
  }

  // ── 4 orderless NFC free entries. ──
  for (let i = 0; i < 4; i++) {
    await testDb.insert(entriesTable).values({
      showId: show.id,
      dogId: dog!.id,
      exhibitorId: exhibitor.id,
      orderId: null,
      status: 'confirmed',
      totalFee: 0,
      isNfc: true,
    });
  }

  return { org, show, exhibitor };
}

describe('adminInvoices settlement — South Western GSD reproduction (acceptance gate)', () => {
  it('reconciles viaRemi/direct/costs/net to the exact hand-built INV-SWGSD-0004 figures', async () => {
    const { show } = await seedSouthWesternShapedShow();
    const admin = await makeUser({ role: 'admin' });
    const caller = createTestCaller(admin);

    const invoice = await caller.adminInvoices.issue({
      showId: show.id,
      packageFeePence: 16_000, // £160.00
      packageFeeDescription: 'Catalogue package',
      discount: { mode: 'percent', value: 40, label: 'Remi discount (40%)' },
    });

    expect(invoice.viaRemiTotalPence).toBe(161_300);
    expect(invoice.directTotalPence).toBe(8_600);
    expect(invoice.cardFeeTotalPence).toBe(3_869);
    expect(invoice.discountTotalPence).toBe(1_548);
    expect(invoice.costsTotalPence).toBe(18_321);
    expect(invoice.netToClubPence).toBe(142_979);

    // ── Render the real PDF (no react-pdf mock — this must actually paginate). ──
    const info: InvoicePdfInfo = {
      invoiceNumber: invoice.invoiceNumber,
      clubName: 'South Western Test GSD Club',
      showName: show.name,
      showDate: 'Sunday 9 August 2026',
      issuedAt: '29 July 2026',
    };
    const element = React.createElement(InvoicePdf, {
      info,
      lineItems: invoice.lineItems,
      netToClubPence: invoice.netToClubPence,
      captureGapCount: invoice.captureGapCount,
    });
    const rawBuffer = await renderToBuffer(element as React.ReactElement<import('@react-pdf/renderer').DocumentProps>);
    const buffer = Buffer.from(await stripUnembeddedBase14Fonts(rawBuffer));

    const dir = mkdtempSync(path.join(tmpdir(), 'settlement-pdf-'));
    const pdfPath = path.join(dir, 'settlement.pdf');
    writeFileSync(pdfPath, buffer);

    const text = execFileSync('pdftotext', ['-layout', pdfPath, '-']).toString('utf8');
    for (const needle of ['£1,613.00', '£86.00', '£183.21', '£1,429.79', 'Net to credit the club']) {
      expect(text).toContain(needle);
    }

    const pageCountOutput = execFileSync('pdfinfo', [pdfPath]).toString('utf8');
    const pagesLine = pageCountOutput.split('\n').find((l) => l.startsWith('Pages:'));
    const pageCount = pagesLine ? parseInt(pagesLine.replace('Pages:', '').trim(), 10) : NaN;
    expect(pageCount).toBe(1);

    const fontsOutput = execFileSync('pdffonts', [pdfPath]).toString('utf8');
    expect(fontsOutput).not.toContain('Helvetica');
    const fontDataLines = fontsOutput.split('\n').slice(2).filter((l) => l.trim().length > 0);
    expect(fontDataLines.length).toBeGreaterThan(0);
    for (const line of fontDataLines) {
      // Columns: name type encoding emb sub uni object-ID — "emb" (embedded)
      // must read "yes" for every font actually used in the document.
      expect(line).toMatch(/\byes\b.*\byes\b/);
    }
  }, 30_000);
});
