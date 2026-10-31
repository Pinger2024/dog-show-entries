/**
 * Assign Mandy as a steward on the current E2E test show so she can
 * walk through the ringside flow end-to-end against real volume.
 *
 * Run: npx tsx scripts/assign-mandy-steward.ts
 */
import 'dotenv/config';
import { db } from '@/server/db/index.js';
import * as s from '@/server/db/schema/index.js';
import { eq, and, desc } from 'drizzle-orm';

const MANDY_USER_ID = '75e32446-9b97-4e70-9ed5-a6d8987af7af';
const SHOW_NAME = 'Hundark GSD E2E Test Show';

async function main() {
  if (!db) throw new Error('no db');

  const show = await db.query.shows.findFirst({
    where: eq(s.shows.name, SHOW_NAME),
    orderBy: [desc(s.shows.createdAt)],
  });
  if (!show) throw new Error(`show "${SHOW_NAME}" not found — run e2e seeder first`);
  console.log(`Show: ${show.name}  ${show.id}`);

  // Bump show status so steward dashboard surfaces it (only shows in
  // entries_closed / in_progress / completed are visible).
  if (show.status !== 'in_progress' && show.status !== 'completed' && show.status !== 'entries_closed') {
    await db.update(s.shows).set({ status: 'in_progress' }).where(eq(s.shows.id, show.id));
    console.log(`  bumped show status → in_progress`);
  } else {
    console.log(`  show status already ${show.status}`);
  }

  // Upsert steward assignment.
  const existing = await db.query.stewardAssignments.findFirst({
    where: and(
      eq(s.stewardAssignments.showId, show.id),
      eq(s.stewardAssignments.userId, MANDY_USER_ID),
    ),
  });
  if (existing) {
    console.log(`  steward assignment already exists (${existing.id})`);
  } else {
    const [row] = await db.insert(s.stewardAssignments).values({
      showId: show.id,
      userId: MANDY_USER_ID,
    }).returning();
    console.log(`  steward assignment created (${row.id})`);
  }

  // Ensure Mandy keeps her admin role (don't demote). Admin beats steward.
  const mandy = await db.query.users.findFirst({ where: eq(s.users.id, MANDY_USER_ID) });
  console.log(`  user role: ${mandy?.role}`);

  console.log(`\nDone. Mandy can now view the show at /steward/shows/${show.id}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
