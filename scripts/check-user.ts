import { db } from '../src/server/db';
import { users } from '../src/server/db/schema';
import { ilike, or } from 'drizzle-orm';

async function main() {
  if (!db) { console.log('No DB'); process.exit(1); }
  const results = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
  }).from(users).where(
    or(
      ilike(users.email, '%hundark%'),
      ilike(users.email, '%mandy%')
    )
  );
  console.log('Amanda user records:', JSON.stringify(results, null, 2));
  process.exit(0);
}
main();
