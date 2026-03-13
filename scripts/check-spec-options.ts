import 'dotenv/config';
import { db } from '@/server/db';
import { printPriceCache } from '@/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';

async function check() {
  // Sample specs for Folded Leaflets
  const sample = await db
    .select({ specs: printPriceCache.specs, quantity: printPriceCache.quantity })
    .from(printPriceCache)
    .where(
      and(
        eq(printPriceCache.tradeprintProductName, 'Folded Leaflets'),
        eq(printPriceCache.serviceLevel, 'standard')
      )
    )
    .limit(3);
  console.log('Sample specs:', JSON.stringify(sample, null, 2));

  // Check what keys the specs object actually has
  const specKeys = await db.execute(sql`
    SELECT DISTINCT jsonb_object_keys(specs) as key
    FROM print_price_cache
    WHERE tradeprint_product_name = 'Folded Leaflets'
    AND service_level = 'standard'
    LIMIT 50
  `);
  console.log('Spec keys:', specKeys.rows);

  // Paper Types with filter
  const filterSpecs = {
    'Size': 'A5 Landscape',
    'Sides Printed': 'Double Sided',
    'Folding': 'Folded to 4pp A6',
    'Sets': '1',
  };

  const paperTypes = await db
    .selectDistinct({
      value: sql<string>`${printPriceCache.specs}->>'Paper Type'`,
    })
    .from(printPriceCache)
    .where(
      and(
        eq(printPriceCache.tradeprintProductName, 'Folded Leaflets'),
        eq(printPriceCache.serviceLevel, 'standard'),
        sql`${printPriceCache.specs} @> ${JSON.stringify(filterSpecs)}::jsonb`
      )
    );
  console.log('Paper Types (with filter):', paperTypes.map(r => r.value).filter(Boolean));

  // Without filter
  const allPaperTypes = await db
    .selectDistinct({
      value: sql<string>`${printPriceCache.specs}->>'Paper Type'`,
    })
    .from(printPriceCache)
    .where(
      and(
        eq(printPriceCache.tradeprintProductName, 'Folded Leaflets'),
        eq(printPriceCache.serviceLevel, 'standard'),
      )
    );
  console.log('All Paper Types (no filter):', allPaperTypes.map(r => r.value).filter(Boolean));

  // All Sizes
  const sizes = await db
    .selectDistinct({
      value: sql<string>`${printPriceCache.specs}->>'Size'`,
    })
    .from(printPriceCache)
    .where(
      and(
        eq(printPriceCache.tradeprintProductName, 'Folded Leaflets'),
        eq(printPriceCache.serviceLevel, 'standard'),
      )
    );
  console.log('All Sizes (no filter):', sizes.map(r => r.value).filter(Boolean));

  process.exit(0);
}
check();
