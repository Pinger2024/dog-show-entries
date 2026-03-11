import 'dotenv/config';
import { db } from '@/server/db/index.js';
import { eq, and, isNull } from 'drizzle-orm';
import * as schema from '@/server/db/schema/index.js';
import { uploadToR2, getPublicUrl } from '@/server/services/storage.js';
import { readFileSync } from 'fs';

const ORG_ID = 'b8a6dfcd-65aa-4442-abc7-342873f02be4';

async function main() {
  if (db === null) { console.log('No db'); return; }

  // Upload Royal Canin logo from local file
  const rcLogo = readFileSync('/tmp/royal-canin-logo.png');
  const rcKey = `sponsors/royal-canin-logo.png`;
  await uploadToR2(rcKey, rcLogo, 'image/png');
  const rcUrl = getPublicUrl(rcKey);
  console.log('Uploaded Royal Canin logo:', rcUrl);

  // Update Royal Canin sponsor with R2 URL
  await db
    .update(schema.sponsors)
    .set({ logoUrl: rcUrl, logoStorageKey: rcKey })
    .where(
      and(
        eq(schema.sponsors.name, 'Royal Canin'),
        eq(schema.sponsors.organisationId, ORG_ID),
        isNull(schema.sponsors.deletedAt)
      )
    );
  console.log('Updated Royal Canin logo URL in DB');

  // Verify all sponsor logos
  const sponsors = await db.query.sponsors.findMany({
    where: and(
      eq(schema.sponsors.organisationId, ORG_ID),
      isNull(schema.sponsors.deletedAt)
    ),
  });

  console.log('\nAll sponsor logos:');
  for (const s of sponsors) {
    console.log(`  ${s.name}: ${s.logoUrl ?? 'NONE'}`);
  }
}

main().catch(console.error);
