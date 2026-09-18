/**
 * Bug-hunt #27: the sundry maxPerOrder cap was checked per cart line, so
 * sending the same item across duplicate lines (2 + 2 when the cap is 2) slipped
 * 4 past a cap of 2. Quantities are now aggregated per item before the check.
 */
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { sundryItems as sundryItemsTable, orders } from '@/server/db/schema';
import { testDb } from '../helpers/db';
import { createTestCaller } from '../helpers/context';
import { makeUser, makeOrg, makeBreed, makeShow, makeDog } from '../helpers/factories';

async function setup() {
  const exhibitor = await makeUser({ role: 'exhibitor' });
  const org = await makeOrg();
  const breed = await makeBreed();
  const show = await makeShow({
    organisationId: org.id,
    breedId: breed.id,
    status: 'entries_open',
    firstEntryFee: 1000,
    nfcEntryFee: 0,
  });
  const dog = await makeDog({ ownerId: exhibitor.id, breedId: breed.id });
  const [item] = await testDb
    .insert(sundryItemsTable)
    .values({ showId: show.id, name: 'Catalogue', priceInPence: 300, sortOrder: 0, enabled: true, maxPerOrder: 2 })
    .returning();
  return { exhibitor, show, dog, item };
}

describe('sundry maxPerOrder cap (bug-hunt #27)', () => {
  it('rejects duplicate lines whose combined quantity exceeds the cap', async () => {
    const { exhibitor, show, dog, item } = await setup();
    await expect(
      createTestCaller(exhibitor).orders.checkout({
        showId: show.id,
        entries: [{ entryType: 'standard', dogId: dog.id, classIds: [], isNfc: true }],
        sundryItems: [
          { sundryItemId: item!.id, quantity: 2 },
          { sundryItemId: item!.id, quantity: 2 }, // combined 4 > cap 2
        ],
      })
    ).rejects.toThrow(/Maximum 2/i);
  });

  it('accepts duplicate lines within the cap and aggregates them', async () => {
    const { exhibitor, show, dog, item } = await setup();
    const res = await createTestCaller(exhibitor).orders.checkout({
      showId: show.id,
      entries: [{ entryType: 'standard', dogId: dog.id, classIds: [], isNfc: true }],
      sundryItems: [
        { sundryItemId: item!.id, quantity: 1 },
        { sundryItemId: item!.id, quantity: 1 }, // combined 2 == cap 2
      ],
    });
    const order = await testDb.query.orders.findFirst({ where: eq(orders.id, res.orderId) });
    expect(order?.totalAmount).toBe(600); // 2 × £3, NFC entry fee 0
  });
});
