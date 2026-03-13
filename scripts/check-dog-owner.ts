import { db } from '../src/server/db';
import { users, dogs, dogOwners } from '../src/server/db/schema';
import { eq, ilike } from 'drizzle-orm';

async function main() {
  if (!db) { console.log('No DB connection'); process.exit(1); }

  const michael = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(ilike(users.email, '%michael@prometheus%'));
  console.log('Michael:', JSON.stringify(michael, null, 2));

  const dog = await db.select({ id: dogs.id, registeredName: dogs.registeredName, ownerId: dogs.ownerId })
    .from(dogs)
    .where(eq(dogs.id, 'f2d69080-7aa5-4898-a778-330e6b3ed253'));
  console.log('Dog:', JSON.stringify(dog, null, 2));

  const owners = await db.select()
    .from(dogOwners)
    .where(eq(dogOwners.dogId, 'f2d69080-7aa5-4898-a778-330e6b3ed253'));
  console.log('Dog owners:', JSON.stringify(owners, null, 2));

  process.exit(0);
}
main();
