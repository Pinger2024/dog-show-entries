import 'dotenv/config';
import { db } from '@/server/db/index.js';
import { eq } from 'drizzle-orm';
import * as schema from '@/server/db/schema/index.js';

async function main() {
  if (db === null) { console.log('No db'); return; }
  
  const memberships = await db.query.memberships.findMany({
    where: eq(schema.memberships.organisationId, 'b8a6dfcd-65aa-4442-abc7-342873f02be4'),
    with: { user: true },
  });
  
  for (const m of memberships) {
    console.log(JSON.stringify({
      userId: m.userId,
      name: m.user?.name,
      email: m.user?.email,
      role: m.role,
      status: m.status,
    }));
  }
}
main();
