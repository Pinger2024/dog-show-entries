import { db } from '@/server/db';
import { users, organisations, secretaryApplications, memberships } from '@/server/db/schema';
import { eq, like } from 'drizzle-orm';

async function main() {
  // Find user
  const [user] = await db.select({ id: users.id, email: users.email, role: users.role })
    .from(users).where(like(users.email, 'mitchelldisney3%'));
  console.log('User:', user);

  if (!user) { console.log('User not found'); process.exit(1); }

  // Find orgs
  const orgs = await db.select({ id: organisations.id, name: organisations.name })
    .from(organisations).where(like(organisations.name, '%owestoft%'));
  console.log('Orgs:', orgs);

  // Find applications
  const apps = await db.select({ id: secretaryApplications.id, organisationName: secretaryApplications.organisationName })
    .from(secretaryApplications).where(eq(secretaryApplications.userId, user.id));
  console.log('Applications:', apps);

  // Find memberships
  const mems = await db.select({ id: memberships.id, organisationId: memberships.organisationId })
    .from(memberships).where(eq(memberships.userId, user.id));
  console.log('Memberships:', mems);

  // --- Revert ---
  // 1. Delete user's memberships
  for (const mem of mems) {
    await db.delete(memberships).where(eq(memberships.id, mem.id));
    console.log('Deleted membership:', mem.id);
  }

  // 2. Delete applications
  for (const app of apps) {
    await db.delete(secretaryApplications).where(eq(secretaryApplications.id, app.id));
    console.log('Deleted application:', app.id);
  }

  // 3. Delete orgs (and any other memberships referencing them)
  for (const org of orgs) {
    await db.delete(memberships).where(eq(memberships.organisationId, org.id));
    await db.delete(organisations).where(eq(organisations.id, org.id));
    console.log('Deleted org:', org.id, org.name);
  }

  // 4. Revert user role
  await db.update(users).set({ role: 'exhibitor', onboardingCompletedAt: null }).where(eq(users.id, user.id));
  console.log('Reverted user role to exhibitor');

  console.log('\nDone! Mitchell is back to exhibitor.');
  process.exit(0);
}

main();
