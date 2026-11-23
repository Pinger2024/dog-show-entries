import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { testDb } from '../helpers/db';
import { loadShowFixture } from '../helpers/show-fixture';
import { makeUser, makeOrder, makeOrderSundryItem } from '../helpers/factories';
import { sundryItems } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { computeShowMetrics } from '@/server/services/show-metrics';
import { hasUserPurchasedCatalogue } from '@/lib/catalogue-utils';
import { generateParkingPassPdf } from '@/server/services/parking-pass-pdf';
import { isDonationKind } from '@/lib/sundry-kind';
import type { ShowFixture } from '../../../scripts/lib/export-show-fixture-core';

// The explicit kind column replaced name-guessing in a dozen places. This
// proves real shows behave the same: every golden fixture's sundries, run
// through the OLD name rules (frozen copy below, deliberately not imported)
// and through the new kind-based code. The ONLY allowed difference is the
// synthetic fixture's bare "Catalogue" (was ONLINE, is now PRINTED - the enter
// page always told people to collect a printed one).

// ---- frozen copy of the legacy rules (15 Oct 2026) ----
const legacyIsCatalogue = (n: string) => n.toLowerCase().includes('catalogue');
const legacyIsPrinted = (n: string) => legacyIsCatalogue(n) && n.toLowerCase().includes('print');
const legacyIsOnline = (n: string) => legacyIsCatalogue(n) && !n.toLowerCase().includes('print');
const legacyIsParking = (n: string) => /\bparking\b/i.test(n) || /\bcar\s*pass\b/i.test(n);
const legacyIsDonation = (n: string) => n.toLowerCase().includes('donation');

const dir = path.join(__dirname, 'fixtures');
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();

describe('golden fixtures: sundry behaviour is unchanged by the kind column', () => {
  it('finds the fixtures', () => {
    expect(files.length).toBeGreaterThanOrEqual(13);
  });

  it.each(files)('%s', async (file) => {
    const fixture = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as ShowFixture;
    const { showId } = await loadShowFixture(testDb, fixture);
    const items = await testDb.select().from(sundryItems).where(eq(sundryItems.showId, showId));

    // One paid order per sundry, so each can be asked about on its own.
    const buyers: Array<{ name: string; orderId: string; exhibitorId: string }> = [];
    for (const item of items) {
      const exhibitor = await makeUser({ role: 'exhibitor' });
      const order = await makeOrder({ showId, exhibitorId: exhibitor.id, status: 'paid', totalAmount: 100 });
      await makeOrderSundryItem({ orderId: order.id, sundryItemId: item.id, quantity: 1, unitPrice: 100 });
      buyers.push({ name: item.name, orderId: order.id, exhibitorId: exhibitor.id });
    }

    // Expected differences: only the bare synthetic "Catalogue".
    const allowedDifference = (n: string) => file === 'synthetic-rkc-champ.json' && n === 'Catalogue';

    // 1. Printed / online counts
    const m = await computeShowMetrics(testDb, showId);
    const legacyPrinted = items.filter((i) => legacyIsPrinted(i.name) && !allowedDifference(i.name)).length;
    const legacyOnline = items.filter((i) => legacyIsOnline(i.name) && !allowedDifference(i.name)).length;
    const movedToPrinted = items.filter((i) => allowedDifference(i.name)).length;
    expect(m.paidPrintedCatalogueCount).toBe(legacyPrinted + movedToPrinted);
    expect(m.paidOnlineCatalogueCount).toBe(legacyOnline);

    for (const b of buyers) {
      // 2. Catalogue access (printed or online unlocks it - unchanged)
      expect(await hasUserPurchasedCatalogue(testDb, showId, b.exhibitorId), `access: ${b.name}`).toBe(
        legacyIsCatalogue(b.name),
      );
      // 3. Parking pass yes/no
      expect((await generateParkingPassPdf(b.orderId)) !== null, `parking: ${b.name}`).toBe(legacyIsParking(b.name));
    }

    // 4. Settlement donation line
    for (const i of items) {
      expect(isDonationKind(i.kind), `donation: ${i.name}`).toBe(legacyIsDonation(i.name));
    }
  });

  it('the synthetic bare "Catalogue" is the one thing that moved: online -> printed', async () => {
    const fixture = JSON.parse(readFileSync(path.join(dir, 'synthetic-rkc-champ.json'), 'utf8')) as ShowFixture;
    const { showId } = await loadShowFixture(testDb, fixture);
    const [item] = await testDb.select().from(sundryItems).where(eq(sundryItems.showId, showId));
    expect(item?.name).toBe('Catalogue');
    expect(legacyIsOnline('Catalogue')).toBe(true);
    expect(item?.kind).toBe('printed_catalogue');
  });
});
