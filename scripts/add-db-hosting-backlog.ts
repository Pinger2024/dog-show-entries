/**
 * Source: 2026-05-06 — Michael flagged that Remi's prod Postgres on Render
 * has no backups at the current tier (~$20/mo without). He also runs
 * Lettiva on a separate Render Postgres. Surfaced while planning the
 * multi-breed RKC compliance work (#113) — concluded the compliance work
 * isn't blocked on a hosting decision (local Postgres + integration tests
 * are sufficient), but the backup gap is a real risk that should be
 * closed independently and the hosting question deserves a deliberate
 * look once the immediate gap is fixed.
 */
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { backlog } from '../src/server/db/schema/backlog';
import { desc } from 'drizzle-orm';

const title = 'Database hosting evaluation + automated backups';

const description = `Background: Remi's production Postgres lives on
Render (~$20/mo tier with no automated backups at current spec).
Michael also runs Lettiva on a separate Render Postgres. Real
exposure: a Stripe-backed app with no off-host backups is one
provider incident away from data loss.

Two separable problems. Fix the urgent one first, then make the
hosting choice deliberately.

═══════════════════════════════════════════════════════════════════
PROBLEM 1 — No automated backups (urgent, do first)
═══════════════════════════════════════════════════════════════════

Add a scheduled \`pg_dump\` for both Remi and Lettiva, encrypting
the dump and shipping to Cloudflare R2 (or S3). Daily at minimum,
hourly during entry-open windows is cheap. Retention 30 days
rolling + a monthly snapshot kept for a year.

Why R2: zero egress, pennies per GB, already in our stack for
print orders. No new vendor.

Implementation outline (~half day):
  - Render cron service or GitHub Actions scheduled workflow
  - \`pg_dump --format=custom\` → gzip → encrypt with age or gpg →
    upload to R2 with date-stamped key
  - Smoke test: monthly automated restore into a throwaway DB,
    fail loudly on integrity mismatch
  - Document the restore procedure in repo (no good having backups
    nobody knows how to restore from)

Doing this closes the immediate "no backups" risk regardless of
where we end up hosting long-term.

═══════════════════════════════════════════════════════════════════
PROBLEM 2 — Hosting platform evaluation (deliberate, do second)
═══════════════════════════════════════════════════════════════════

Compare current Render setup against alternatives for both Remi
and Lettiva. Cost, pooling behaviour, backup story, region/latency,
extension support, vendor lock-in.

Candidates worth scoring (Postgres-compatible, Drizzle-friendly):
  - Render Postgres Pro tier (status quo + backups, ~$29/mo per DB)
  - Prisma Postgres (Michael flagged — usage-priced, has a free
    tier, edge pooling baked in; relatively new product)
  - Neon (serverless Postgres, branching for preview envs is a real
    feature, generous free tier)
  - Supabase (Postgres + auth + storage; we don't need the extras
    but pricing on just-the-DB is competitive)
  - Self-hosted on a $5 Hetzner box (cheapest, most ops burden)

Output: a one-page comparison table + a recommendation. Decision
to migrate is its own piece of work — connection-string churn,
pooling differences, downtime planning, rollback. Realistically a
1–2 day operation per database with non-zero risk.

═══════════════════════════════════════════════════════════════════
WHEN
═══════════════════════════════════════════════════════════════════

Problem 1 (backups): next available half-day. Should not be
blocked by anything.

Problem 2 (evaluation): when nothing else urgent is in flight.
Definitely NOT during the multi-breed compliance build (#113) or
any other live customer-impacting work.

═══════════════════════════════════════════════════════════════════
NON-GOALS
═══════════════════════════════════════════════════════════════════

- Migrating prod databases as part of this ticket. That's a
  separate decision after the evaluation lands.
- Building a hosted staging environment. Local Postgres + dev
  server is sufficient for current development needs (validated
  while planning #113). Staging can be its own conversation later.`;

const priority = 'high' as const;

const questions = `For Michael:

1. R2 vs S3 for backup storage? R2 is cheaper (no egress) and
   already in the stack for print orders. Sticking with R2 unless
   you have a reason to prefer S3.

2. Backup retention: 30 days rolling + monthly-for-a-year is the
   default I'd implement. Shout if you want longer.

3. Render cron service vs GitHub Actions for the scheduled dump?
   GitHub Actions is free and the secrets handling is already
   wired; Render cron keeps everything on one platform. Slight
   preference for GHA on cost/visibility grounds.

4. Restore drill cadence: monthly automated restore into a
   throwaway DB is what I'd default to. Anything less and you
   don't actually know your backups work.

5. Hosting evaluation timing: is "after multi-breed compliance
   #113 ships" the right slot, or sooner? The backup fix is
   urgent; the migration is not.`;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL not set');

  const client = postgres(connectionString, { prepare: false });
  const db = drizzle(client);

  const [latest] = await db
    .select({ featureNumber: backlog.featureNumber })
    .from(backlog)
    .orderBy(desc(backlog.featureNumber))
    .limit(1);
  const nextNumber = (latest?.featureNumber ?? 0) + 1;

  const [inserted] = await db
    .insert(backlog)
    .values({
      featureNumber: nextNumber,
      title,
      description,
      questions,
      priority,
      status: 'awaiting_feedback',
    })
    .returning({ featureNumber: backlog.featureNumber, id: backlog.id });

  console.log(`Added backlog #${inserted.featureNumber}: ${title}`);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
