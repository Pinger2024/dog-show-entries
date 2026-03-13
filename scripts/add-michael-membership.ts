import 'dotenv/config';
import { db } from '@/server/db/index.js';
import * as schema from '@/server/db/schema/index.js';

async function main() {
  if (db === null) { console.log('No db'); return; }
  
  await db.insert(schema.memberships).values({
    userId: 'c32da437-ca13-4434-bc7d-a2d4d3b4b1c6',
    organisationId: 'b8a6dfcd-65aa-4442-abc7-342873f02be4',
    role: 'admin',
    status: 'active',
  });
  
  console.log('Added Michael to Clyde Valley GSD Club as admin');
}
main();
