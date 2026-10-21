import { describe, it, expect } from 'vitest';
import { createTestCaller } from '../helpers/context';
import { testDb } from '../helpers/db';
import {
  makeSecretaryWithOrg,
  makeUser,
  makeShow,
  makeOrder,
  makeSundryItem,
  makeOrderSundryItem,
} from '../helpers/factories';
import { computeShowMetrics } from '@/server/services/show-metrics';
import { hasUserPurchasedCatalogue } from '@/lib/catalogue-utils';
import { loadCatalogueOrdersSplit, loadPrebookedCatalogueRows } from '@/server/services/report-queries';
import { generateParkingPassPdf } from '@/server/services/parking-pass-pdf';
import type { SundryKind } from '@/lib/sundry-kind';

// Consumers read sundry_items.kind - never the name (15 Oct 2026). Each test
// gives an item a name that would have fooled the old name rules.

async function paidOrderWith(name: string, kind: SundryKind, quantity = 1) {
  const { org } = await makeSecretaryWithOrg();
  const exhibitor = await makeUser({ role: 'exhibitor' });
  const show = await makeShow({ organisationId: org.id });
  const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 500 * quantity });
  const item = await makeSundryItem({ showId: show.id, name, kind });
  await makeOrderSundryItem({ orderId: order.id, sundryItemId: item.id, quantity, unitPrice: 500 });
  return { org, exhibitor, show, order, item };
}

describe('show metrics counts catalogues by kind', () => {
  it('"Programme" with kind printed_catalogue counts as a printed catalogue', async () => {
    const { show } = await paidOrderWith('Programme', 'printed_catalogue', 2);
    const m = await computeShowMetrics(testDb, show.id);
    expect(m.paidPrintedCatalogueCount).toBe(2);
    expect(m.paidOnlineCatalogueCount).toBe(0);
  });
  it('"Catalogue Advert" with kind advert counts as neither', async () => {
    const { show } = await paidOrderWith('Catalogue Advert', 'advert');
    const m = await computeShowMetrics(testDb, show.id);
    expect(m.paidPrintedCatalogueCount).toBe(0);
    expect(m.paidOnlineCatalogueCount).toBe(0);
  });
  it('a "Printed ..." name with kind online_catalogue counts as online', async () => {
    const { show } = await paidOrderWith('Printed-style PDF', 'online_catalogue');
    const m = await computeShowMetrics(testDb, show.id);
    expect(m.paidOnlineCatalogueCount).toBe(1);
    expect(m.paidPrintedCatalogueCount).toBe(0);
  });
});

describe('catalogue access reads the kind', () => {
  it('"Programme" printed_catalogue unlocks catalogue access', async () => {
    const { show, exhibitor } = await paidOrderWith('Programme', 'printed_catalogue');
    expect(await hasUserPurchasedCatalogue(testDb, show.id, exhibitor.id)).toBe(true);
    const list = await createTestCaller(exhibitor as never).shows.getMyCataloguePurchases();
    expect(list.map((p) => p.showId)).toContain(show.id);
  });
  it('"Catalogue Advert" with kind advert does NOT unlock it', async () => {
    const { show, exhibitor } = await paidOrderWith('Catalogue Advert', 'advert');
    expect(await hasUserPurchasedCatalogue(testDb, show.id, exhibitor.id)).toBe(false);
    expect(await createTestCaller(exhibitor as never).shows.getMyCataloguePurchases()).toEqual([]);
  });
});

describe('catalogue reports split by kind', () => {
  it('printed vs online, whatever the names say', async () => {
    const { show } = await paidOrderWith('Programme', 'printed_catalogue');
    const split = await loadCatalogueOrdersSplit(testDb, show.id);
    expect(split.printed).toHaveLength(1);
    expect(split.online).toHaveLength(0);
    const rows = await loadPrebookedCatalogueRows(testDb, show.id);
    expect(rows.map((r) => r.type)).toEqual(['Printed']);
  });
  it('an advert named like a catalogue is not listed', async () => {
    const { show } = await paidOrderWith('Catalogue Advert', 'advert');
    const split = await loadCatalogueOrdersSplit(testDb, show.id);
    expect(split.printed).toHaveLength(0);
    expect(split.online).toHaveLength(0);
    expect(await loadPrebookedCatalogueRows(testDb, show.id)).toEqual([]);
  });
});

describe('parking passes read the kind', () => {
  it('a parking-kind item named "Voucher" produces a parking pass', async () => {
    const { order, exhibitor } = await paidOrderWith('Voucher', 'parking', 2);
    const pass = await generateParkingPassPdf(order.id);
    expect(pass).not.toBeNull();
    const mine = await createTestCaller(exhibitor as never).orders.myParkingPasses();
    expect(mine).toHaveLength(1);
    expect(mine[0]?.quantity).toBe(2);
  });
  it('"Car Park Pass" with kind parking is recognised (the old rule missed it)', async () => {
    const { order } = await paidOrderWith('Car Park Pass', 'parking');
    expect(await generateParkingPassPdf(order.id)).not.toBeNull();
  });
  it('an item NAMED "Parking" but with kind other produces nothing', async () => {
    const { order, exhibitor } = await paidOrderWith('Parking donation box', 'other');
    expect(await generateParkingPassPdf(order.id)).toBeNull();
    expect(await createTestCaller(exhibitor as never).orders.myParkingPasses()).toEqual([]);
  });
});
