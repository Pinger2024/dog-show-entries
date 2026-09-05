import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';

// Real react-pdf render (no mock) — asserting the actual PDF a purchased
// parking pass produces (magic bytes + one page per quantity), not just
// auth/response shape. Same pattern as prize-cards-full-suite.test.ts.
vi.mock('@/lib/impersonation', () => ({
  getImpersonatedUserId: vi.fn(async () => null),
}));

import { auth } from '@/lib/auth';
import { GET as parkingPassGET } from '@/app/api/parking-pass/[orderId]/route';
import { NextRequest } from 'next/server';
import {
  makeSecretaryWithOrg,
  makeShow,
  makeUser,
  makeOrder,
  makeSundryItem,
  makeOrderSundryItem,
} from '../helpers/factories';

beforeEach(() => {
  vi.mocked(auth).mockReset();
});

const params = (orderId: string) => ({ params: Promise.resolve({ orderId }) });
const req = (orderId: string) => new NextRequest(`http://localhost/api/parking-pass/${orderId}`);

function authedAs(user: { id: string; email: string; name: string | null; role: string }) {
  vi.mocked(auth).mockResolvedValue({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user: { id: user.id, email: user.email, name: user.name, role: user.role } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

async function makePaidParkingOrder(opts: { quantity?: number } = {}) {
  const { org } = await makeSecretaryWithOrg();
  const exhibitor = await makeUser({ role: 'exhibitor', name: 'Jane Exhibitor' });
  const show = await makeShow({ organisationId: org.id, name: 'Test Championship Show' });
  const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid' });
  const parkingItem = await makeSundryItem({ showId: show.id, name: 'Pre-paid Parking Pass' });
  await makeOrderSundryItem({
    orderId: order.id,
    sundryItemId: parkingItem.id,
    quantity: opts.quantity ?? 1,
    unitPrice: 300,
  });
  return { org, exhibitor, show, order };
}

describe('GET /api/parking-pass/[orderId]', () => {
  it('returns 401 unauthenticated', async () => {
    const { order } = await makePaidParkingOrder();
    vi.mocked(auth).mockResolvedValue(null);
    const res = await parkingPassGET(req(order.id), params(order.id));
    expect(res.status).toBe(401);
  });

  it('returns 404 for an unknown order', async () => {
    const stranger = await makeUser({ role: 'exhibitor' });
    authedAs(stranger);
    const res = await parkingPassGET(
      req('00000000-0000-0000-0000-000000000000'),
      params('00000000-0000-0000-0000-000000000000'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 403 for a different exhibitor', async () => {
    const { order } = await makePaidParkingOrder();
    const stranger = await makeUser({ role: 'exhibitor' });
    authedAs(stranger);
    const res = await parkingPassGET(req(order.id), params(order.id));
    expect(res.status).toBe(403);
  });

  it('returns 404 when the order has no parking sundry', async () => {
    const { org } = await makeSecretaryWithOrg();
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const show = await makeShow({ organisationId: org.id });
    const order = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid' });
    const catalogueItem = await makeSundryItem({ showId: show.id, name: 'Online Catalogue' });
    await makeOrderSundryItem({ orderId: order.id, sundryItemId: catalogueItem.id, quantity: 1, unitPrice: 500 });

    authedAs(exhibitor);
    const res = await parkingPassGET(req(order.id), params(order.id));
    expect(res.status).toBe(404);
  });

  it('returns 200 with a real PDF for the owning exhibitor — one page per quantity', async () => {
    const { order, exhibitor } = await makePaidParkingOrder({ quantity: 2 });
    authedAs(exhibitor);
    const res = await parkingPassGET(req(order.id), params(order.id));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');

    const buffer = Buffer.from(await res.arrayBuffer());
    expect(buffer.subarray(0, 5).toString('utf-8')).toBe('%PDF-');

    const pdf = await PDFDocument.load(buffer);
    expect(pdf.getPageCount()).toBe(2);
  });

  it('returns 200 for a member of the show organisation (not the exhibitor)', async () => {
    const { org, order } = await makePaidParkingOrder();
    const secretary = await makeUser({ role: 'secretary' });
    const { makeMembership } = await import('../helpers/factories');
    await makeMembership({ userId: secretary.id, organisationId: org.id });
    authedAs(secretary);
    const res = await parkingPassGET(req(order.id), params(order.id));
    expect(res.status).toBe(200);
  });

  it('returns 200 for a platform admin regardless of organisation', async () => {
    const { order } = await makePaidParkingOrder();
    const admin = await makeUser({ role: 'admin' });
    authedAs(admin);
    const res = await parkingPassGET(req(order.id), params(order.id));
    expect(res.status).toBe(200);
  });
});
