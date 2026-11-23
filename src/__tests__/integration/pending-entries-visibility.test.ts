/**
 * Bug (Mandy 2026-07-20): the secretary entries page has a "Pending" status
 * filter and a "N started checkout" stat, but selecting Pending showed NOTHING —
 * because entries.getForShow hides entries on pending_payment orders by default
 * (Amanda 2026-05-28: abandoned checkouts shouldn't clutter the list). The stat
 * promised rows the filter could never show.
 *
 * Fix: when the secretary explicitly asks for status='pending', surface the
 * awaiting-payment entries (with exhibitor + dog, so she can see who to chase),
 * while the default list stays clean.
 */
import { describe, it, expect } from 'vitest';
import { createTestCaller } from '../helpers/context';
import {
  makeSecretaryWithOrg,
  makeShow,
  makeUser,
  makeDog,
  makeOrder,
  makeEntry,
  makeBreed,
} from '../helpers/factories';

describe('secretary entries — Pending filter surfaces awaiting-payment entries', () => {
  it('hides pending-order entries by default, shows them (with names) under status=pending', async () => {
    const { user: secretary, org } = await makeSecretaryWithOrg();
    const breed = await makeBreed();
    const show = await makeShow({ organisationId: org.id, breedId: breed.id, status: 'entries_open' });
    const exhibitor = await makeUser({ role: 'exhibitor' });

    // A booked-in (paid) entry — always visible.
    const paidDog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const paidOrder = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'paid' });
    const confirmedEntry = await makeEntry({
      showId: show.id, dogId: paidDog.id, exhibitorId: exhibitor.id, orderId: paidOrder.id, status: 'confirmed',
    });

    // An awaiting-payment entry — hidden from the default list.
    const pendingDog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
    const pendingOrder = await makeOrder({ showId: show.id, exhibitorId: exhibitor.id, status: 'pending_payment' });
    const pendingEntry = await makeEntry({
      showId: show.id, dogId: pendingDog.id, exhibitorId: exhibitor.id, orderId: pendingOrder.id, status: 'pending',
    });

    const caller = createTestCaller(secretary);

    // Default list: the paid entry shows, the pending one is hidden.
    const def = await caller.entries.getForShow({ showId: show.id, limit: 500 });
    const defIds = def.items.map((e) => e.id);
    expect(defIds).toContain(confirmedEntry.id);
    expect(defIds).not.toContain(pendingEntry.id);

    // Pending filter: the awaiting-payment entry appears, and only that one.
    const pending = await caller.entries.getForShow({ showId: show.id, limit: 500, status: 'pending' });
    const pendingIds = pending.items.map((e) => e.id);
    expect(pendingIds).toContain(pendingEntry.id);
    expect(pendingIds).not.toContain(confirmedEntry.id);

    // The row carries who it's for — the whole point of the fix.
    const row = pending.items.find((e) => e.id === pendingEntry.id)!;
    expect(row.exhibitor?.id).toBe(exhibitor.id);
    expect(row.dog?.id).toBe(pendingDog.id);
  });
});
