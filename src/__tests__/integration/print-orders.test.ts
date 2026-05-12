import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { printOrders, printOrderItems } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrg,
  makeShow,
  makeOrg,
} from '../helpers/factories';
import { PRINT_PACKAGE_TIERS, calculatePrintOrderFee } from '@/lib/print-products';

async function makePackageOrderSetup() {
  const { user, org } = await makeSecretaryWithOrg();
  const show = await makeShow({ organisationId: org.id });
  const caller = createTestCaller(user);
  return { user, org, show, caller };
}

const packageOrderInput = (showId: string) => ({
  showId,
  catalogueQty: 50,
  deliveryName: 'Show Secretary',
  deliveryAddress1: '1 Show Lane',
  deliveryTown: 'Showtown',
  deliveryPostcode: 'SH1 1AA',
});

describe('printOrders.getPackageOptions', () => {
  it('returns tier1 for a show with no entries (0 ≤ 100)', async () => {
    const { show, caller } = await makePackageOrderSetup();
    const result = await caller.printOrders.getPackageOptions({ showId: show.id });
    expect(result.tooLarge).toBe(false);
    expect(result.tier?.id).toBe('tier1');
    expect(result.tier?.options).toHaveLength(PRINT_PACKAGE_TIERS[0].options.length);
  });

  it('rejects on a foreign show', async () => {
    const { user } = await makeSecretaryWithOrg();
    const otherOrg = await makeOrg();
    const otherShow = await makeShow({ organisationId: otherOrg.id });
    await expect(
      createTestCaller(user).printOrders.getPackageOptions({ showId: otherShow.id }),
    ).rejects.toThrow(/access/i);
  });
});

describe('printOrders.createPackageOrder', () => {
  it('creates a draft order with catalogue and prize_cards items', async () => {
    const { show, caller } = await makePackageOrderSetup();
    const { orderId } = await caller.printOrders.createPackageOrder(packageOrderInput(show.id));
    expect(orderId).toBeTruthy();

    const order = await testDb.query.printOrders.findFirst({
      where: eq(printOrders.id, orderId),
    });
    expect(order?.status).toBe('draft');
    expect(order?.deliveryName).toBe('Show Secretary');

    const tier1option50 = PRINT_PACKAGE_TIERS[0].options.find((o) => o.catalogueQty === 50)!;
    const fee = calculatePrintOrderFee(tier1option50.pricePence);
    expect(order?.subtotalAmount).toBe(tier1option50.pricePence);
    expect(order?.totalAmount).toBe(tier1option50.pricePence + fee);

    const items = await testDb.query.printOrderItems.findMany({
      where: eq(printOrderItems.printOrderId, orderId),
    });
    expect(items).toHaveLength(2);

    const catalogue = items.find((i) => i.documentType === 'catalogue');
    expect(catalogue?.quantity).toBe(50);
    expect(catalogue?.lineTotal).toBe(tier1option50.pricePence);

    const prizeCards = items.find((i) => i.documentType === 'prize_cards');
    expect(prizeCards?.lineTotal).toBe(0);
    expect(prizeCards?.unitSellingPrice).toBe(0);
  });

  it('rejects an invalid catalogueQty not in the tier options', async () => {
    const { show, caller } = await makePackageOrderSetup();
    await expect(
      caller.printOrders.createPackageOrder({ ...packageOrderInput(show.id), catalogueQty: 99 }),
    ).rejects.toThrow(/not a valid option/);
  });

  it('rejects createPackageOrder on a foreign show', async () => {
    const { user } = await makeSecretaryWithOrg();
    const otherOrg = await makeOrg();
    const otherShow = await makeShow({ organisationId: otherOrg.id });
    await expect(
      createTestCaller(user).printOrders.createPackageOrder(packageOrderInput(otherShow.id)),
    ).rejects.toThrow(/access/i);
  });
});

describe('printOrders.getById / listByShow', () => {
  it('getById returns the order with embedded items and orderedBy + show', async () => {
    const { show, caller, user } = await makePackageOrderSetup();
    const { orderId } = await caller.printOrders.createPackageOrder(packageOrderInput(show.id));

    const order = await caller.printOrders.getById({ orderId });
    expect(order.id).toBe(orderId);
    expect(order.items).toHaveLength(2);
    expect(order.orderedBy?.id).toBe(user.id);
  });

  it('getById returns NOT_FOUND for unknown order id', async () => {
    const { user } = await makeSecretaryWithOrg();
    await expect(
      createTestCaller(user).printOrders.getById({
        orderId: '00000000-0000-0000-0000-000000000000',
      }),
    ).rejects.toThrow(/Order not found/);
  });

  it('listByShow returns orders for the show, newest first', async () => {
    const { show, caller } = await makePackageOrderSetup();
    await caller.printOrders.createPackageOrder(packageOrderInput(show.id));
    await caller.printOrders.createPackageOrder(packageOrderInput(show.id));
    const list = await caller.printOrders.listByShow({ showId: show.id });
    expect(list).toHaveLength(2);
  });
});

describe('printOrders.cancelOrder', () => {
  it('cancels a draft order', async () => {
    const { show, caller } = await makePackageOrderSetup();
    const { orderId } = await caller.printOrders.createPackageOrder(packageOrderInput(show.id));

    const res = await caller.printOrders.cancelOrder({ orderId });
    expect(res.success).toBe(true);
    const refreshed = await testDb.query.printOrders.findFirst({
      where: eq(printOrders.id, orderId),
    });
    expect(refreshed?.status).toBe('cancelled');
  });

  it('rejects cancellation of an already-paid order', async () => {
    const { show, caller } = await makePackageOrderSetup();
    const { orderId } = await caller.printOrders.createPackageOrder(packageOrderInput(show.id));
    await testDb.update(printOrders).set({ status: 'paid' })
      .where(eq(printOrders.id, orderId));

    await expect(caller.printOrders.cancelOrder({ orderId }))
      .rejects.toThrow(/Only draft or awaiting payment/);
  });

  it('returns NOT_FOUND for unknown order id', async () => {
    const { user } = await makeSecretaryWithOrg();
    await expect(
      createTestCaller(user).printOrders.cancelOrder({
        orderId: '00000000-0000-0000-0000-000000000000',
      }),
    ).rejects.toThrow(/Order not found/);
  });
});
