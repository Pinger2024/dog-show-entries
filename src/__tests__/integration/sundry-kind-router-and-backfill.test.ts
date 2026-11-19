import { describe, it, expect, afterEach } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import { sundryItems } from '@/server/db/schema';
import { migrateSundryKinds } from '@/server/db/startup-migrations';
import { createTestCaller } from '../helpers/context';
import { testDb } from '../helpers/db';
import { makeSecretaryWithOrg, makeShow, makeSundryItem } from '../helpers/factories';

describe('secretary sundry router: kind', () => {
  it('createSundryItem without a kind is rejected', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    await expect(
      createTestCaller(user as never).secretary.createSundryItem({
        showId: show.id, name: 'Printed Catalogue', priceInPence: 500,
      } as never),
    ).rejects.toThrow(/kind/i);
  });

  it('createSundryItem stores the chosen kind, even against the name', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const item = await createTestCaller(user as never).secretary.createSundryItem({
      showId: show.id, name: 'Printed Catalogue', kind: 'other', priceInPence: 500,
    });
    expect(item!.kind).toBe('other');
  });

  it('bulkCreateSundryItems requires and stores a kind per item', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const caller = createTestCaller(user as never);
    await expect(
      caller.secretary.bulkCreateSundryItems({
        showId: show.id, items: [{ name: 'Donation', priceInPence: 100 }],
      } as never),
    ).rejects.toThrow(/kind/i);
    await caller.secretary.bulkCreateSundryItems({
      showId: show.id,
      items: [{ name: 'Donation', kind: 'donation', priceInPence: 100 }],
    });
    const rows = await testDb.select().from(sundryItems).where(eq(sundryItems.showId, show.id));
    expect(rows.map((r) => r.kind)).toEqual(['donation']);
  });

  it('updateSundryItem changes the kind; public getSundryItems returns it', async () => {
    const { user, org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    const caller = createTestCaller(user as never);
    const item = await caller.secretary.createSundryItem({
      showId: show.id, name: 'Programme', kind: 'other', priceInPence: 500,
    });
    const updated = await caller.secretary.updateSundryItem({
      id: item!.id, showId: show.id, kind: 'printed_catalogue',
    });
    expect(updated.kind).toBe('printed_catalogue');
    const pub = await createTestCaller(null).shows.getSundryItems({ showId: show.id });
    expect(pub[0]?.kind).toBe('printed_catalogue');
  });
});

describe('startup backfill of sundry_items.kind', () => {
  // The test DB already has the finished column. Put it back into its
  // pre-migration shape (nullable, no default), run the real migration
  // function, and check what it did.
  afterEach(async () => {
    await migrateSundryKinds(testDb); // leaves the column NOT NULL + default again
  });

  async function loosen() {
    await testDb.execute(sql`ALTER TABLE sundry_items ALTER COLUMN kind DROP NOT NULL`);
    await testDb.execute(sql`ALTER TABLE sundry_items ALTER COLUMN kind DROP DEFAULT`);
  }
  async function insertNullKind(showId: string, name: string) {
    const rows = await testDb.execute<{ id: string }>(sql`
      INSERT INTO sundry_items (show_id, name, price_in_pence, kind)
      VALUES (${showId}, ${name}, 100, NULL) RETURNING id`);
    return rows[0]!.id;
  }
  async function kindOf(id: string) {
    const [row] = await testDb.select({ kind: sundryItems.kind }).from(sundryItems).where(eq(sundryItems.id, id));
    return row?.kind;
  }

  it('fills NULL kinds from the name, then locks the column down', async () => {
    const { org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    await loosen();
    const a = await insertNullKind(show.id, 'Printed Catalogue + pen');
    const b = await insertNullKind(show.id, 'Car Park Pass');
    const c = await insertNullKind(show.id, 'Baby Puppy Class');
    const filled = await migrateSundryKinds(testDb);
    expect(filled).toBe(3);
    expect(await kindOf(a)).toBe('printed_catalogue');
    expect(await kindOf(b)).toBe('parking');
    expect(await kindOf(c)).toBe('other');
    const [col] = await testDb.execute<{ is_nullable: string; column_default: string | null }>(sql`
      SELECT is_nullable, column_default FROM information_schema.columns
       WHERE table_name = 'sundry_items' AND column_name = 'kind'`);
    expect(col?.is_nullable).toBe('NO');
    expect(col?.column_default).toMatch(/other/);
  });

  it('a second run never overwrites a kind the secretary chose', async () => {
    const { org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    await loosen();
    const stray = await insertNullKind(show.id, 'Printed Catalogue');
    // The secretary deliberately says this catalogue-ish name is "something else".
    const chosen = await makeSundryItem({ showId: show.id, name: 'Online Catalogue', kind: 'other' });
    await migrateSundryKinds(testDb);
    expect(await kindOf(stray)).toBe('printed_catalogue');
    expect(await kindOf(chosen.id)).toBe('other');
    const again = await migrateSundryKinds(testDb);
    expect(again).toBe(0);
    expect(await kindOf(chosen.id)).toBe('other');
  });

  it('two services booting at once end in the same, correct state', async () => {
    const { org } = await makeSecretaryWithOrg();
    const show = await makeShow({ organisationId: org.id });
    await loosen();
    const ids = await Promise.all(
      ['Online Catalogue', 'Donation', 'Advert', 'Club Membership — Sole'].map((n) => insertNullKind(show.id, n)),
    );
    await Promise.all([migrateSundryKinds(testDb), migrateSundryKinds(testDb)]);
    expect(await Promise.all(ids.map(kindOf))).toEqual(['online_catalogue', 'donation', 'advert', 'membership']);
  });
});
