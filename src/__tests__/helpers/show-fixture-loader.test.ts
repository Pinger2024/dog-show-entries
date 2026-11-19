import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { db } from '@/server/db';
import { loadShowFixture } from './show-fixture';
import type { ShowFixture } from '../../../scripts/lib/export-show-fixture-core';

function loadRkcFixture(): ShowFixture {
  const p = path.join(__dirname, '../golden/fixtures/synthetic-rkc-champ.json');
  return JSON.parse(readFileSync(p, 'utf8')) as ShowFixture;
}

describe('loadShowFixture', () => {
  // Regression test for a real incident (2026-09-02): north-eastern and
  // south-western's real exports both failed to load with
  // `orders_discount_group_id_show_discount_groups_id_fk` because orders
  // were inserted before show_discount_groups. The synthetic RKC fixture's
  // first entry carries a real order referencing the show's discount group
  // (see generate-synthetic-fixture.ts) specifically to exercise this path.
  it('loads a fixture whose orders reference show_discount_groups without error', async () => {
    const fixture = loadRkcFixture();
    const hasDiscountGroupOrder = fixture.tables.orders.some(
      (o) => (o as { discountGroupId?: string | null }).discountGroupId != null,
    );
    expect(hasDiscountGroupOrder).toBe(true); // sanity: the fixture actually exercises this

    await expect(loadShowFixture(db, fixture)).resolves.toMatchObject({ slug: 'synthetic-rkc-champ' });
  });

  // A fixture missing an FK target — either a real export gap, or (as
  // above) a loader-ordering bug — must fail with a message naming the
  // table, the column, and the missing id, not a bare Postgres
  // "violates foreign key constraint" with no indication of what's missing.
  it('fails with a clear table/column/id message when an FK target is missing from the fixture', async () => {
    const fixture = loadRkcFixture();
    const missingId = randomUUID();
    const orderWithDanglingRef = {
      ...(fixture.tables.orders.find((o) => (o as { discountGroupId?: string | null }).discountGroupId != null) as Record<
        string,
        unknown
      >),
    };
    orderWithDanglingRef.discountGroupId = missingId;
    const broken: ShowFixture = {
      ...fixture,
      tables: {
        ...fixture.tables,
        orders: fixture.tables.orders.map((o) =>
          (o as { id: string }).id === orderWithDanglingRef.id ? orderWithDanglingRef : o,
        ),
      },
    };

    await expect(loadShowFixture(db, broken)).rejects.toThrow(
      new RegExp(`"orders".*"discount_group_id".*${missingId}.*"show_discount_groups"`, 's'),
    );
  });
});
