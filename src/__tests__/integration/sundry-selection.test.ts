/**
 * Unit tests for the sundry-selection ONE owner
 * (src/server/services/sundry-selection.ts) — extracted from the rules that
 * used to live only inline in `orders.checkout`. See
 * sundry-selection-one-owner.test.ts for the guard that keeps it the only
 * copy.
 */
import { describe, it, expect } from 'vitest';
import { testDb } from '../helpers/db';
import { makeOrg, makeBreed, makeShow } from '../helpers/factories';
import { sundryItems as sundryItemsTable } from '@/server/db/schema';
import { validateSundrySelection } from '@/server/services/sundry-selection';

async function setupShow() {
  const org = await makeOrg();
  const breed = await makeBreed();
  const show = await makeShow({ organisationId: org.id, breedId: breed.id, status: 'entries_open' });
  return { org, breed, show };
}

describe('validateSundrySelection', () => {
  it('aggregates quantity across two cart lines of the same item and reports one over_max violation', async () => {
    const { show } = await setupShow();
    const [item] = await testDb
      .insert(sundryItemsTable)
      .values({ showId: show.id, name: 'Catalogue', priceInPence: 300, sortOrder: 0, enabled: true, maxPerOrder: 2 })
      .returning();

    const result = await validateSundrySelection(testDb, {
      showId: show.id,
      items: [
        { sundryItemId: item!.id, quantity: 2 },
        { sundryItemId: item!.id, quantity: 2 }, // combined 4 > cap 2
      ],
    });

    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toMatchObject({
      sundryItemId: item!.id,
      kind: 'over_max',
      requested: 4,
      max: 2,
    });
  });

  it('flags a disabled item', async () => {
    const { show } = await setupShow();
    const [item] = await testDb
      .insert(sundryItemsTable)
      .values({ showId: show.id, name: 'Rosette', priceInPence: 500, sortOrder: 0, enabled: false })
      .returning();

    const result = await validateSundrySelection(testDb, {
      showId: show.id,
      items: [{ sundryItemId: item!.id, quantity: 1 }],
    });

    expect(result.violations).toEqual([
      { sundryItemId: item!.id, name: 'Rosette', kind: 'disabled', requested: 1 },
    ]);
    expect(result.items).toHaveLength(0);
  });

  it('flags an item that belongs to another show', async () => {
    const { show } = await setupShow();
    const { show: otherShow } = await setupShow();
    const [item] = await testDb
      .insert(sundryItemsTable)
      .values({ showId: otherShow.id, name: 'Mug', priceInPence: 800, sortOrder: 0, enabled: true })
      .returning();

    const result = await validateSundrySelection(testDb, {
      showId: show.id,
      items: [{ sundryItemId: item!.id, quantity: 1 }],
    });

    expect(result.violations).toEqual([
      { sundryItemId: item!.id, name: 'Mug', kind: 'wrong_show', requested: 1 },
    ]);
  });

  it('flags an unknown item id', async () => {
    const { show } = await setupShow();
    const unknownId = '00000000-0000-0000-0000-000000000000';

    const result = await validateSundrySelection(testDb, {
      showId: show.id,
      items: [{ sundryItemId: unknownId, quantity: 1 }],
    });

    expect(result.violations).toEqual([
      { sundryItemId: unknownId, kind: 'not_found', requested: 1 },
    ]);
  });

  it('returns validated items with correct unit prices and no violations for a valid selection', async () => {
    const { show } = await setupShow();
    const [catalogue, rosette] = await testDb
      .insert(sundryItemsTable)
      .values([
        { showId: show.id, name: 'Catalogue', priceInPence: 300, sortOrder: 0, enabled: true, maxPerOrder: 2 },
        { showId: show.id, name: 'Rosette', priceInPence: 500, sortOrder: 1, enabled: true },
      ])
      .returning();

    const result = await validateSundrySelection(testDb, {
      showId: show.id,
      items: [
        { sundryItemId: catalogue!.id, quantity: 2 },
        { sundryItemId: rosette!.id, quantity: 1 },
      ],
    });

    expect(result.violations).toHaveLength(0);
    expect(result.items).toEqual(
      expect.arrayContaining([
        { sundryItemId: catalogue!.id, name: 'Catalogue', quantity: 2, unitPrice: 300 },
        { sundryItemId: rosette!.id, name: 'Rosette', quantity: 1, unitPrice: 500 },
      ]),
    );
  });
});
