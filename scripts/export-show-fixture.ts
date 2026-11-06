#!/usr/bin/env -S npx tsx
/**
 * Export one real show's full document-rendering graph into a committed
 * golden-document fixture — src/__tests__/golden/fixtures/<slug>.json.
 *
 * ⚠️ THIS TALKS TO PRODUCTION. Only the team lead runs this, and only with
 * the explicit `--i-know-this-is-prod` flag. It opens a DEDICATED,
 * READ-ONLY database session (`SET default_transaction_read_only = on`) —
 * every query in export-show-fixture-core.ts is a plain SELECT, and the
 * read-only flag makes any accidental write fail loudly rather than
 * silently touching prod data.
 *
 * Usage:
 *   npx tsx scripts/export-show-fixture.ts <showId> <slug> --i-know-this-is-prod
 *
 * Example:
 *   npx tsx scripts/export-show-fixture.ts \
 *     3f9a2e10-....-....-....-............ south-western-2026 \
 *     --i-know-this-is-prod
 *
 * Writes: src/__tests__/golden/fixtures/<slug>.json
 *
 * Every value that could identify a real person (exhibitors, owners, judges,
 * stewards, the secretary, schedule officials, dog names, kennel affixes,
 * registration numbers, emails, phones, addresses) is pseudonymised before
 * anything is written to disk — see scripts/lib/anonymise.ts and the policy
 * comment at the top of scripts/lib/export-show-fixture-core.ts. Club/show/
 * breed/class names, dates, fees and award prefixes are kept verbatim.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/server/db/schema';
import { exportShowFixture } from './lib/export-show-fixture-core';

async function main() {
  const args = process.argv.slice(2);
  const flagIndex = args.indexOf('--i-know-this-is-prod');
  const confirmed = flagIndex !== -1;
  if (confirmed) args.splice(flagIndex, 1);

  const [showId, slug] = args;

  if (!showId || !slug) {
    console.error(
      'Usage: npx tsx scripts/export-show-fixture.ts <showId> <slug> --i-know-this-is-prod',
    );
    process.exit(1);
  }

  if (!confirmed) {
    console.error(
      'Refusing to run: this script queries the LIVE PRODUCTION database.\n' +
        'Re-run with --i-know-this-is-prod once you have confirmed the showId ' +
        'and slug are correct.',
    );
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  console.log(`Connecting read-only, exporting show ${showId} as "${slug}"...`);

  // A dedicated connection, deliberately NOT the shared src/server/db pool —
  // this is the one place in the codebase that is allowed (and expected) to
  // point at prod, and it must never share a pool with anything that could
  // later be reused for a write.
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    // Belt-and-braces: even though every query in export-show-fixture-core.ts
    // is a SELECT, force the session itself to reject any write.
    await client.unsafe('SET default_transaction_read_only = on');

    const fixture = await exportShowFixture(db, showId, slug);

    const entryCount = fixture.tables.entries.length;
    const classCount = fixture.tables.showClasses.length;
    console.log(
      `Exported: ${entryCount} entries, ${classCount} classes, ` +
        `${fixture.tables.judges.length} judges, ${fixture.tables.users.length} users ` +
        `(all anonymised).`,
    );

    const outDir = path.join(process.cwd(), 'src/__tests__/golden/fixtures');
    mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `${slug}.json`);
    writeFileSync(outPath, JSON.stringify(fixture, null, 2) + '\n');
    console.log(`Wrote ${outPath}`);
    console.log(
      'Next: `npm run golden` to render every applicable document against this ' +
        'fixture. A missing baseline is written automatically on first run.',
    );
  } finally {
    await client.end({ timeout: 1 });
  }
}

main().catch((err) => {
  console.error('Export failed:', err);
  process.exit(1);
});
