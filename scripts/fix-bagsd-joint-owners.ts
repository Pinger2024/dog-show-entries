/**
 * One-off DB write — apply Amanda's joint-owner corrections to specific
 * dogs in the BAGSD show ahead of catalogue print.
 *
 * Approach: for each correction, DELETE existing dog_owners rows then
 * INSERT the new set in order. Preserves the linked Remi user account
 * on rows where the named owner matches an existing exhibitor.
 *
 * Run from the project root:
 *   npx tsx scripts/fix-bagsd-joint-owners.ts          # dry-run, prints diffs
 *   npx tsx scripts/fix-bagsd-joint-owners.ts --apply  # commits to DB
 */
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, ilike } from 'drizzle-orm';
import * as schema from '../src/server/db/schema';

interface OwnerInput {
  /** Display name as Amanda gave it. Will be stored verbatim — the
   *  catalogue will Title-Case at render time. */
  name: string;
  /** Optional email — looked up against users table to re-link the
   *  Remi account if we already know it. */
  emailHint?: string;
}

interface Correction {
  registeredNameMatch: string; // ILIKE pattern
  owners: OwnerInput[];
}

const CORRECTIONS: Correction[] = [
  // ── Batch 1 (applied 2026-05-22) ──
  {
    registeredNameMatch: 'AMIRA VOM FICHTENSCHLAG%',
    owners: [
      { name: 'John McGough' },
      { name: 'Rachel Craik', emailHint: 'rachel_craik@yahoo.co.uk' },
      { name: 'Liam Henderson' },
    ],
  },
  {
    registeredNameMatch: 'GAYVILLE VARINKA%',
    owners: [
      { name: 'Maxine Cowan', emailHint: 'craziantix@sky.com' },
      { name: 'Derek Shipley' },
    ],
  },
  // ── Batch 2 (Amanda Telegram 2026-05-22 ~20:09) ──
  {
    // "Monksley Questa" — registered with a trailing space in the DB.
    registeredNameMatch: 'Monksley Questa%',
    owners: [
      { name: 'Ann Swift', emailHint: 'monksley@btinternet.com' },
      { name: 'Neil Dodds' },
    ],
  },
  {
    // Currently inverted: primary slot has "N Dodds" linked to Ann Swift's
    // user account, "A Swift" demoted to slot 1.
    registeredNameMatch: 'Monksley Ulkan',
    owners: [
      { name: 'Ann Swift', emailHint: 'monksley@btinternet.com' },
      { name: 'Neil Dodds' },
    ],
  },
  {
    registeredNameMatch: 'Monksley Uschka',
    owners: [
      { name: 'Ann Swift', emailHint: 'monksley@btinternet.com' },
      { name: 'Neil Dodds' },
    ],
  },
  {
    registeredNameMatch: 'RUMBA VON PALLAS ATHENE%',
    owners: [
      { name: 'Amber Kemble', emailHint: 'kemble247@googlemail.com' },
      { name: 'Ben Pascoe' },
    ],
  },
  {
    // Amanda typed "Shernaa gemstone vom falkenholz" but DB has "JEMSTONE".
    registeredNameMatch: 'SHERNAA JEMSTONE VOM FALKENHOLZ',
    owners: [
      { name: 'Amber Kemble', emailHint: 'kemble247@googlemail.com' },
      { name: 'Ben Pascoe' },
    ],
  },
  {
    // Two "Trimika's Japan" rows exist — one with apostrophe + the real
    // exhibitor (craziantix@sky.com), one with email "me@me.com" (test
    // duplicate). Anchor to the apostrophe + uppercase variant.
    registeredNameMatch: "TRIMIKA'S JAPAN",
    owners: [
      { name: 'Maxine Cowan', emailHint: 'craziantix@sky.com' },
      { name: 'Derek Shipley' },
    ],
  },
  {
    registeredNameMatch: "XIBOR B'YANKA",
    owners: [
      { name: 'Rachel Craik', emailHint: 'rachel_craik@yahoo.co.uk' },
      { name: 'John McGough' },
    ],
  },
];

/** Dogs already corrected in earlier runs — skip them so re-running this
 *  script doesn't undo and re-write the same change repeatedly. */
const ALREADY_APPLIED = new Set([
  'AMIRA VOM FICHTENSCHLAG%',
  'GAYVILLE VARINKA%',
]);

async function main() {
  const apply = process.argv.includes('--apply');
  const client = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });

  console.log(apply ? '🚀 APPLY mode — will commit' : '👀 DRY RUN — no writes');
  console.log('');

  for (const correction of CORRECTIONS) {
    if (ALREADY_APPLIED.has(correction.registeredNameMatch)) {
      console.log(`\n— Skipping ${correction.registeredNameMatch} (already applied in earlier run) —`);
      continue;
    }
    const dog = await db.query.dogs.findFirst({
      where: ilike(schema.dogs.registeredName, correction.registeredNameMatch),
    });
    if (!dog) {
      console.warn(`⚠️  Dog matching "${correction.registeredNameMatch}" not found — skipping`);
      continue;
    }

    const existing = await db.query.dogOwners.findMany({
      where: eq(schema.dogOwners.dogId, dog.id),
      orderBy: (t, { asc }) => [asc(t.sortOrder)],
    });

    console.log(`\n=== ${dog.registeredName} (${dog.id}) ===`);
    console.log('Before:');
    for (const o of existing) {
      console.log(`  [${o.sortOrder}] ${o.ownerName}${o.isPrimary ? ' (primary)' : ''}  user_id=${o.userId ?? '—'}  email=${o.ownerEmail || '—'}`);
    }

    // Build the new rows. For each correction owner, see if any of the
    // existing rows had a matching email/user → keep that user link +
    // address + email so the exhibitor still owns the dog in Remi.
    const newRows = await Promise.all(
      correction.owners.map(async (input, idx) => {
        let userId: string | null = null;
        let address = '';
        let email = '';
        let phone: string | null = null;

        if (input.emailHint) {
          const existingMatch = existing.find((o) => o.ownerEmail === input.emailHint);
          if (existingMatch) {
            userId = existingMatch.userId;
            address = existingMatch.ownerAddress;
            email = existingMatch.ownerEmail;
            phone = existingMatch.ownerPhone;
          } else {
            // Look up the user by email so we can still link the account
            const user = await db.query.users.findFirst({
              where: eq(schema.users.email, input.emailHint),
            });
            if (user) {
              userId = user.id;
              email = user.email;
            }
          }
        }

        return {
          dogId: dog.id,
          ownerName: input.name,
          ownerAddress: address,
          ownerEmail: email,
          ownerPhone: phone,
          userId,
          sortOrder: idx,
          isPrimary: idx === 0,
        };
      }),
    );

    console.log('After:');
    for (const r of newRows) {
      console.log(`  [${r.sortOrder}] ${r.ownerName}${r.isPrimary ? ' (primary)' : ''}  user_id=${r.userId ?? '—'}  email=${r.ownerEmail || '—'}`);
    }

    if (apply) {
      await db.transaction(async (tx) => {
        await tx.delete(schema.dogOwners).where(eq(schema.dogOwners.dogId, dog.id));
        await tx.insert(schema.dogOwners).values(newRows);
      });
      console.log('✅ Applied');
    }
  }

  await client.end();
  if (!apply) {
    console.log('\n(dry run — re-run with --apply to commit)');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
