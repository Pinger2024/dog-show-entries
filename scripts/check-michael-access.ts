import 'dotenv/config';
import { db } from '@/server/db/index.js';
import { eq } from 'drizzle-orm';
import * as schema from '@/server/db/schema/index.js';

async function main() {
  if (db === null) { console.log('No db'); return; }
  
  // Find Michael's user
  const users = await db.query.users.findMany({
    where: eq(schema.users.email, 'michael@prometheus-it.com'),
  });
  
  if (users.length === 0) {
    console.log('Michael not found by email, searching all users...');
    const allUsers = await db.query.users.findMany();
    for (const u of allUsers) {
      console.log(JSON.stringify({ id: u.id, name: u.name, email: u.email, role: u.role }));
    }
    return;
  }
  
  const michael = users[0];
  console.log('Michael:', JSON.stringify({ id: michael.id, name: michael.name, email: michael.email, role: michael.role }));
  
  // Check all his memberships
  const memberships = await db.query.memberships.findMany({
    where: eq(schema.memberships.userId, michael.id),
    with: { organisation: true },
  });
  
  console.log('\nMemberships:');
  for (const m of memberships) {
    console.log(JSON.stringify({ org: m.organisation?.name, orgId: m.organisationId, role: m.role, status: m.status }));
  }
  
  // Check if he has Clyde Valley membership
  const clydeValleyId = 'b8a6dfcd-65aa-4442-abc7-342873f02be4';
  const hasClydeValley = memberships.some(m => m.organisationId === clydeValleyId);
  console.log('\nHas Clyde Valley membership:', hasClydeValley);
}
main();
