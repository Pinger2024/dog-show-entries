import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { GET as cronGET } from '@/app/api/cron/route';
import { resendMocks } from '../helpers/resend-mocks';
import { testDb } from '../helpers/db';
import { orders } from '@/server/db/schema';
import {
  makeSecretaryWithOrg,
  makeShow,
  makeUser,
  makeOrder,
  makeSundryItem,
  makeOrderSundryItem,
} from '../helpers/factories';

// Frozen "now" for every test in this file: 2026-06-15 11:00 Europe/London
// (BST, UTC+1) — safely after the 8:30am gate the cron branch shares with
// the catalogue-ready email. Only Date is faked (not timers), so the real
// Postgres client's own timer usage is untouched.
const FROZEN_NOW = '2026-06-15T10:00:00.000Z';
const TODAY = '2026-06-15';
const PLUS_6_DAYS = '2026-06-21';
const PLUS_10_DAYS = '2026-06-25';

process.env.CRON_SECRET = 'test-cron-secret';
const cronReq = () => new Request(`http://localhost/api/cron?secret=test-cron-secret`);

beforeEach(() => {
  resendMocks.send.mockClear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(FROZEN_NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

async function makeParkingOrder(opts: {
  showStartDate: string;
  orderStatus?: 'paid' | 'pending_payment';
  withParkingSundry?: boolean;
  showStatus?: 'cancelled';
}) {
  const { org } = await makeSecretaryWithOrg();
  const exhibitor = await makeUser({ role: 'exhibitor' });
  const show = await makeShow({
    organisationId: org.id,
    startDate: opts.showStartDate,
    endDate: opts.showStartDate,
    ...(opts.showStatus ? { status: opts.showStatus } : {}),
  });
  const order = await makeOrder({
    showId: show.id,
    exhibitorId: exhibitor.id,
    status: opts.orderStatus ?? 'paid',
  });
  const sundry = await makeSundryItem({
    showId: show.id,
    name: opts.withParkingSundry === false ? 'Online Catalogue' : 'Pre-paid Parking Pass',
  });
  await makeOrderSundryItem({ orderId: order.id, sundryItemId: sundry.id, quantity: 1, unitPrice: 300 });
  return { org, exhibitor, show, order };
}

describe('cron: pre-paid parking pass email (week-before branch)', () => {
  it('sends once and stamps parkingPassEmailedAt for a paid order with a parking sundry at T+6d', async () => {
    const { order, exhibitor } = await makeParkingOrder({ showStartDate: PLUS_6_DAYS });

    const res = await cronGET(cronReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.parkingPassEmailsSent).toBe(1);

    expect(resendMocks.send).toHaveBeenCalledTimes(1);
    const payload = resendMocks.send.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.to).toBe(exhibitor.email);
    expect(Array.isArray(payload.attachments)).toBe(true);
    expect((payload.attachments as Array<{ filename: string }>)[0]?.filename).toMatch(/Parking-Pass\.pdf$/);

    const [updated] = await testDb.select().from(orders).where(eq(orders.id, order.id));
    expect(updated?.parkingPassEmailedAt).not.toBeNull();
  });

  it('does not resend on a second tick', async () => {
    await makeParkingOrder({ showStartDate: PLUS_6_DAYS });

    const first = await cronGET(cronReq());
    expect((await first.json()).parkingPassEmailsSent).toBe(1);
    resendMocks.send.mockClear();

    const second = await cronGET(cronReq());
    const secondBody = await second.json();
    expect(secondBody.parkingPassEmailsSent).toBe(0);
    expect(resendMocks.send).not.toHaveBeenCalled();
  });

  it('never sends for an order with no parking sundry', async () => {
    await makeParkingOrder({ showStartDate: PLUS_6_DAYS, withParkingSundry: false });

    const res = await cronGET(cronReq());
    const body = await res.json();
    expect(body.parkingPassEmailsSent).toBe(0);
    expect(resendMocks.send).not.toHaveBeenCalled();
  });

  it('does not send yet for a show more than 7 days out (T+10d)', async () => {
    await makeParkingOrder({ showStartDate: PLUS_10_DAYS });

    const res = await cronGET(cronReq());
    const body = await res.json();
    expect(body.parkingPassEmailsSent).toBe(0);
    expect(resendMocks.send).not.toHaveBeenCalled();
  });

  it('never sends for an unpaid order', async () => {
    await makeParkingOrder({ showStartDate: PLUS_6_DAYS, orderStatus: 'pending_payment' });

    const res = await cronGET(cronReq());
    const body = await res.json();
    expect(body.parkingPassEmailsSent).toBe(0);
    expect(resendMocks.send).not.toHaveBeenCalled();
  });

  it('never sends for a cancelled show, even with a paid parking order in the window', async () => {
    await makeParkingOrder({ showStartDate: PLUS_6_DAYS, showStatus: 'cancelled' });

    const res = await cronGET(cronReq());
    const body = await res.json();
    expect(body.parkingPassEmailsSent).toBe(0);
    expect(resendMocks.send).not.toHaveBeenCalled();
  });

  it('sends on the show morning itself (T+0d, within the inclusive window)', async () => {
    await makeParkingOrder({ showStartDate: TODAY });

    const res = await cronGET(cronReq());
    const body = await res.json();
    expect(body.parkingPassEmailsSent).toBe(1);
    expect(resendMocks.send).toHaveBeenCalledTimes(1);
  });
});
