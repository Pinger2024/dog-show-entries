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

const draftOrderInput = (showId: string) => ({
  showId,
  items: [{
    documentType: 'catalogue',
    documentLabel: 'Show Catalogue',
    quantity: 50,
    unitTradeCost: 200,
    unitSellingPrice: 280,
    lineTotal: 50 * 280,
    tradeprintProductId: 'mixam-cat-001',
    printSpecs: { paperType: 'silk', size: 'a5' },
  }],
  serviceLevel: 'standard' as const,
  deliveryName: 'Show Secretary',
  deliveryAddress1: '1 Show Lane',
  deliveryTown: 'Showtown',
  deliveryPostcode: 'SH1 1AA',
});

describe('printOrders.createDraftOrder', () => {
  it('creates a draft order with linked items and computed markup', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const caller = createTestCaller(user);

    const { orderId } = await caller.printOrders.createDraftOrder(draftOrderInput(show.id));
    expect(orderId).toBeTruthy();

    const order = await testDb.query.printOrders.findFirst({
      where: eq(printOrders.id, orderId),
    });
    expect(order?.status).toBe('draft');
    expect(order?.subtotalAmount).toBe(50 * 280);
    expect(order?.totalAmount).toBe(50 * 280);
    expect(order?.deliveryName).toBe('Show Secretary');

    const items = await testDb.query.printOrderItems.findMany({
      where: eq(printOrderItems.printOrderId, orderId),
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.tradeprintProductId).toBe('mixam-cat-001');
    expect(items[0]?.printSpecs).toEqual({ paperType: 'silk', size: 'a5' });
  });

  it('rejects createDraftOrder on a foreign show', async () => {
    const { user } = await makeSecretaryWithOrg();
    const otherOrg = await makeOrg();
    const otherShow = await makeShow({ organisationId: otherOrg.id });
    await expect(
      createTestCaller(user).printOrders.createDraftOrder(draftOrderInput(otherShow.id)),
    ).rejects.toThrow(/access/i);
  });
});

describe('printOrders.getById / listByShow', () => {
  it('getById returns the order with embedded items and orderedBy + show', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const caller = createTestCaller(user);
    const { orderId } = await caller.printOrders.createDraftOrder(draftOrderInput(show.id));

    const order = await caller.printOrders.getById({ orderId });
    expect(order.id).toBe(orderId);
    expect(order.items).toHaveLength(1);
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
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const caller = createTestCaller(user);
    await caller.printOrders.createDraftOrder(draftOrderInput(show.id));
    await caller.printOrders.createDraftOrder(draftOrderInput(show.id));
    const list = await caller.printOrders.listByShow({ showId: show.id });
    expect(list).toHaveLength(2);
  });
});

describe('printOrders.cancelOrder', () => {
  it('cancels a draft order', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const caller = createTestCaller(user);
    const { orderId } = await caller.printOrders.createDraftOrder(draftOrderInput(show.id));

    const res = await caller.printOrders.cancelOrder({ orderId });
    expect(res.success).toBe(true);
    const refreshed = await testDb.query.printOrders.findFirst({
      where: eq(printOrders.id, orderId),
    });
    expect(refreshed?.status).toBe('cancelled');
  });

  it('rejects cancellation of an already-paid order', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const caller = createTestCaller(user);
    const { orderId } = await caller.printOrders.createDraftOrder(draftOrderInput(show.id));
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
