import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { dogPhotos, achievements } from '@/server/db/schema';

vi.mock('@/server/services/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/services/storage')>();
  return {
    ...actual,
    uploadToR2: vi.fn(async () => undefined),
    getPublicUrl: vi.fn((key: string) => `https://public.r2.test/${key}`),
  };
});

import { auth } from '@/lib/auth';
import { POST as dogPhotoPOST } from '@/app/api/upload/dog-photo/route';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import {
  makeUser,
  makeOrg,
  makeBreed,
  makeShow,
  makeShowClass,
  makeDog,
  makeEntry,
  makeEntryClass,
  makeResult,
  makeJudge,
  makeJudgeAssignment,
} from '../helpers/factories';

beforeEach(() => {
  vi.mocked(auth).mockReset();
});

describe('orders.checkout edge cases', () => {
  it('multi-class entry sums fees correctly via show-level tiered pricing', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const org = await makeOrg();
    const breed = await makeBreed();
    const show = await makeShow({
      organisationId: org.id, breedId: breed.id, status: 'entries_open',
      firstEntryFee: 1000, subsequentEntryFee: 500,
    });
    const [c1, c2, c3, dog] = await Promise.all([
      makeShowClass({ showId: show.id, breedId: breed.id, entryFee: 1000 }),
      makeShowClass({ showId: show.id, breedId: breed.id, entryFee: 1000 }),
      makeShowClass({ showId: show.id, breedId: breed.id, entryFee: 1000 }),
      makeDog({ ownerId: exhibitor.id, breedId: breed.id }),
    ]);

    const res = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: [{ entryType: 'standard', dogId: dog.id, classIds: [c1.id, c2.id, c3.id], isNfc: false }],
    });

    // checkout returns { clientSecret, orderId }; verify the order's totalAmount.
    const { orders } = await import('@/server/db/schema');
    const order = await testDb.query.orders.findFirst({ where: eq(orders.id, res.orderId) });
    // 1 first @ 1000 + 2 subsequent @ 500 = 2000
    expect(order?.totalAmount).toBe(2000);
  });

  it('rejects entry when exhibitor name matches an assigned judge', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor', name: 'Mary Judge' });
    const org = await makeOrg();
    const breed = await makeBreed();
    const show = await makeShow({
      organisationId: org.id, breedId: breed.id, status: 'entries_open', firstEntryFee: 500,
    });
    const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    // Assign a judge with the same name as the exhibitor
    const judge = await makeJudge({ name: 'Mary Judge' });
    await makeJudgeAssignment({ showId: show.id, judgeId: judge.id, breedId: breed.id });

    await expect(
      createTestCaller(exhibitor).orders.checkout({
        showId: show.id,
        entries: [{ entryType: 'standard', dogId: dog.id, classIds: [showClass.id], isNfc: false }],
      }),
    ).rejects.toThrow(/judge at this show/);
  });

  it('rejects checkout when caller does not own one of the dogs', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const otherUser = await makeUser({ role: 'exhibitor' });
    const org = await makeOrg();
    const breed = await makeBreed();
    const show = await makeShow({
      organisationId: org.id, breedId: breed.id, status: 'entries_open', firstEntryFee: 500,
    });
    const showClass = await makeShowClass({ showId: show.id, breedId: breed.id });
    const otherDog = await makeDog({ ownerId: otherUser.id, breedId: breed.id });
    await expect(
      createTestCaller(exhibitor).orders.checkout({
        showId: show.id,
        entries: [{ entryType: 'standard', dogId: otherDog.id, classIds: [showClass.id], isNfc: false }],
      }),
    ).rejects.toThrow(/not owned by you/);
  });

  // Amanda 2026-04-24: live-site bug. Cart with one NFC entry (no classes)
  // plus a £5 donation sundry crashed checkout with "values() must be called
  // with at least one value" — the entryClasses insert was called with an
  // empty array because NFC entries legitimately carry zero classes.
  it('accepts a cart of NFC-only entry + sundry item (no classes)', async () => {
    const exhibitor = await makeUser({ role: 'exhibitor' });
    const org = await makeOrg();
    const breed = await makeBreed();
    const show = await makeShow({
      organisationId: org.id, breedId: breed.id, status: 'entries_open',
      firstEntryFee: 1000, nfcEntryFee: 0,
    });
    const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const { sundryItems: sundryItemsTable } = await import('@/server/db/schema');
    const [donation] = await testDb.insert(sundryItemsTable).values({
      showId: show.id,
      name: 'Voluntary donation',
      priceInPence: 500,
      sortOrder: 0,
    }).returning();

    const res = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: [{ entryType: 'standard', dogId: dog.id, classIds: [], isNfc: true }],
      sundryItems: [{ sundryItemId: donation!.id, quantity: 1 }],
    });

    const { orders: ordersTable } = await import('@/server/db/schema');
    const order = await testDb.query.orders.findFirst({
      where: eq(ordersTable.id, res.orderId),
    });
    expect(order?.totalAmount).toBe(500);
  });
});

describe('dogs.getShowResults', () => {
  it('returns flat results for a dog with placements (sorted by show date desc)', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const org = await makeOrg();
    const breed = await makeBreed();
    const dog = await makeDog({ ownerId: owner.id, breedId: breed.id });

    // Two shows: an earlier one and a later one
    const showOlder = await makeShow({
      organisationId: org.id, breedId: breed.id, status: 'completed',
      startDate: '2030-01-01', endDate: '2030-01-01',
    });
    const showNewer = await makeShow({
      organisationId: org.id, breedId: breed.id, status: 'completed',
      startDate: '2030-06-01', endDate: '2030-06-01',
    });

    for (const show of [showOlder, showNewer]) {
      const sc = await makeShowClass({ showId: show.id, breedId: breed.id });
      const entry = await makeEntry({
        showId: show.id, dogId: dog.id, exhibitorId: owner.id, status: 'confirmed',
      });
      const ec = await makeEntryClass({ entryId: entry.id, showClassId: sc.id });
      await makeResult({ entryClassId: ec.id, placement: 1 });
    }

    const results = await createTestCaller(owner).dogs.getShowResults({ dogId: dog.id });
    expect(results).toHaveLength(2);
    expect(results[0]?.showId).toBe(showNewer.id); // newest first
    expect(results[1]?.showId).toBe(showOlder.id);
  });

  it('returns empty for a dog with no placements yet', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id });
    const results = await createTestCaller(owner).dogs.getShowResults({ dogId: dog.id });
    expect(results).toEqual([]);
  });
});

describe('dogs.getWinSummary', () => {
  it('returns aggregated win counts for an owned dog', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id });
    // Insert a CC + a BoB directly
    await testDb.insert(achievements).values([
      { dogId: dog.id, type: 'cc', date: '2030-04-01' },
      { dogId: dog.id, type: 'best_of_breed', date: '2030-04-01' },
    ]);
    const summary = await createTestCaller(owner).dogs.getWinSummary({ dogId: dog.id });
    expect(summary).toBeDefined();
  });
});

describe('POST /api/upload/dog-photo', () => {
  function postForm(form: Record<string, string | Blob>) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(form)) fd.append(k, v);
    return new Request('http://localhost/api/upload/dog-photo', {
      method: 'POST',
      body: fd,
    });
  }

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null);
    const res = await dogPhotoPOST(postForm({}) as never);
    expect(res.status).toBe(401);
  });

  it('returns 400 when file is missing', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    vi.mocked(auth).mockResolvedValueOnce({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user: { id: owner.id, email: owner.email, name: owner.name, role: owner.role } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const res = await dogPhotoPOST(postForm({ dogId: 'whatever' }) as never);
    expect(res.status).toBe(400);
  });

  it('returns 404 for a dog the caller does not own', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const intruder = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id });
    vi.mocked(auth).mockResolvedValueOnce({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user: { id: intruder.id, email: intruder.email, name: intruder.name, role: intruder.role } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const file = new File([new Uint8Array(100)], 'photo.jpg', { type: 'image/jpeg' });
    const res = await dogPhotoPOST(postForm({ file, dogId: dog.id }) as never);
    expect(res.status).toBe(404);
  });

  it('uploads to R2 + inserts dogPhotos row, marking first photo as primary', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id });
    vi.mocked(auth).mockResolvedValueOnce({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user: { id: owner.id, email: owner.email, name: owner.name, role: owner.role } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const file = new File([new Uint8Array(100)], 'rocky.jpg', { type: 'image/jpeg' });
    const res = await dogPhotoPOST(postForm({ file, dogId: dog.id }) as never);
    expect(res.status).toBe(200);

    const photos = await testDb.query.dogPhotos.findMany({ where: eq(dogPhotos.dogId, dog.id) });
    expect(photos).toHaveLength(1);
    expect(photos[0]?.isPrimary).toBe(true); // first photo = primary
    expect(photos[0]?.storageKey).toMatch(new RegExp(`^dogs/${dog.id}/[0-9a-f-]+\\.jpg$`));
  });

  it('rejects non-image MIME types', async () => {
    const owner = await makeUser({ role: 'exhibitor' });
    const dog = await makeDog({ ownerId: owner.id });
    vi.mocked(auth).mockResolvedValueOnce({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user: { id: owner.id, email: owner.email, name: owner.name, role: owner.role } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const file = new File([new Uint8Array(100)], 'doc.pdf', { type: 'application/pdf' });
    const res = await dogPhotoPOST(postForm({ file, dogId: dog.id }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/image/i);
  });
});
