import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

async function main() {
  console.log('Checking for missing class definitions...\n');

  // First, see what already exists
  const existing = await db.execute(sql`SELECT name FROM class_definitions ORDER BY name`);
  console.log('Existing class definitions:');
  for (const row of existing) {
    console.log(`  - ${row.name}`);
  }
  console.log(`\nTotal existing: ${existing.length}\n`);

  // All class definitions from seed.ts — the canonical list
  const allClassDefs = [
    // Age-based
    { name: 'Minor Puppy', type: 'age', sortOrder: 1, minAgeMonths: 6, maxAgeMonths: 9, description: 'For dogs of 6 and not exceeding 9 calendar months of age on the first day of the show.' },
    { name: 'Puppy', type: 'age', sortOrder: 2, minAgeMonths: 6, maxAgeMonths: 12, description: 'For dogs of 6 and not exceeding 12 calendar months of age on the first day of the show.' },
    { name: 'Junior', type: 'age', sortOrder: 3, minAgeMonths: 6, maxAgeMonths: 18, description: 'For dogs of 6 and not exceeding 18 calendar months of age on the first day of the show.' },
    { name: 'Yearling', type: 'age', sortOrder: 4, minAgeMonths: 12, maxAgeMonths: 24, description: 'For dogs of 12 and not exceeding 24 calendar months of age on the first day of the show.' },
    { name: 'Veteran', type: 'age', sortOrder: 5, minAgeMonths: 84, maxAgeMonths: null, description: 'For dogs of not less than 7 years of age on the first day of the show.' },
    // Achievement-based
    { name: 'Maiden', type: 'achievement', sortOrder: 1, minAgeMonths: null, maxAgeMonths: null, maxWins: 0, description: 'For dogs which have not won a CC/RCC or a first prize at an Open or Championship Show.' },
    { name: 'Novice', type: 'achievement', sortOrder: 2, minAgeMonths: null, maxAgeMonths: null, maxWins: 2, description: 'For dogs which have not won a CC or 3 or more first prizes at Open and Championship Shows.' },
    { name: 'Undergraduate', type: 'achievement', sortOrder: 3, minAgeMonths: null, maxAgeMonths: null, maxWins: 2, description: 'For dogs which have not won a CC or 3 or more first prizes at Championship Shows in Undergraduate, Graduate, Post Graduate, Mid Limit, Limit, or Open.' },
    { name: 'Graduate', type: 'achievement', sortOrder: 4, minAgeMonths: null, maxAgeMonths: null, maxWins: 3, description: 'For dogs which have not won a CC or 4 or more first prizes at Championship Shows.' },
    { name: 'Post Graduate', type: 'achievement', sortOrder: 5, minAgeMonths: null, maxAgeMonths: null, maxWins: 4, description: 'For dogs which have not won a CC or 5 or more first prizes at Championship Shows.' },
    { name: 'Mid Limit', type: 'achievement', sortOrder: 6, minAgeMonths: null, maxAgeMonths: null, maxWins: 4, description: 'For dogs which have not won a CC or 3 or more first prizes in Mid Limit, Limit, or Open at Championship Shows.' },
    { name: 'Limit', type: 'achievement', sortOrder: 7, minAgeMonths: null, maxAgeMonths: null, maxWins: 6, description: 'For dogs which have not become Show Champions or won 3 or more CCs or 7 or more first prizes at Championship Shows in Limit or Open.' },
    { name: 'Open', type: 'achievement', sortOrder: 8, minAgeMonths: null, maxAgeMonths: null, maxWins: null, description: 'For all dogs of the breed eligible for entry at the show. No restrictions.' },
    // Special Long Coat GSD varieties
    { name: 'Special Long Coat Puppy', type: 'age', sortOrder: 6, minAgeMonths: 6, maxAgeMonths: 12, description: 'For Long Coat German Shepherd Dogs of 6 and not exceeding 12 calendar months of age on the first day of the show.' },
    { name: 'Special Long Coat Junior', type: 'age', sortOrder: 7, minAgeMonths: 6, maxAgeMonths: 18, description: 'For Long Coat dogs aged 6-18 months' },
    { name: 'Special Long Coat Yearling', type: 'age', sortOrder: 8, minAgeMonths: 12, maxAgeMonths: 24, description: 'For Long Coat dogs aged 12-24 months' },
    { name: 'Special Long Coat Open', type: 'achievement', sortOrder: 9, minAgeMonths: null, maxAgeMonths: null, maxWins: null, description: 'For Long Coat German Shepherd Dogs eligible for entry at the show. No restrictions.' },
    // Special
    { name: 'Good Citizen Dog Scheme', type: 'special', sortOrder: 1, minAgeMonths: null, maxAgeMonths: null, description: 'For dogs that have passed any level of the Royal Kennel Club Good Citizen Dog Scheme.' },
    { name: 'Special Beginners', type: 'special', sortOrder: 2, minAgeMonths: null, maxAgeMonths: null, description: 'For dogs whose owners/handlers have never won a CC or Reserve CC at Championship Shows.' },
    // Junior Handler (legacy)
    { name: 'Junior Handler (6-11)', type: 'junior_handler', sortOrder: 1, minAgeMonths: 72, maxAgeMonths: 143, description: 'For handlers aged 6-11 years on the day of the show. Judged on handling skill, not the dog.' },
    { name: 'Junior Handler (12-16)', type: 'junior_handler', sortOrder: 2, minAgeMonths: 144, maxAgeMonths: 203, description: 'For handlers aged 12-16 years on the day of the show. Judged on handling skill, not the dog.' },
    // YKC Handling (official RKC route)
    { name: 'YKC Handling (6-11)', type: 'junior_handler', sortOrder: 10, minAgeMonths: 72, maxAgeMonths: 144, description: 'Young Kennel Club handling. YKC membership required. Crufts qualifier.' },
    { name: 'YKC Handling (12-17)', type: 'junior_handler', sortOrder: 11, minAgeMonths: 144, maxAgeMonths: 216, description: 'Young Kennel Club handling. YKC membership required. Crufts qualifier.' },
    { name: 'YKC Handling (18-24)', type: 'junior_handler', sortOrder: 12, minAgeMonths: 216, maxAgeMonths: 300, description: 'Young Kennel Club handling. YKC membership required. Crufts qualifier.' },
    // JHA Handling (independent organisation)
    { name: 'JHA Handling (6-11)', type: 'junior_handler', sortOrder: 20, minAgeMonths: 72, maxAgeMonths: 144, description: 'Junior Handling Association. JHA membership required.' },
    { name: 'JHA Handling (12-16)', type: 'junior_handler', sortOrder: 21, minAgeMonths: 144, maxAgeMonths: 204, description: 'Junior Handling Association. JHA membership required.' },
  ];

  // Insert each one with ON CONFLICT DO NOTHING
  let insertedCount = 0;
  const insertedNames: string[] = [];

  for (const cd of allClassDefs) {
    const result = await db.execute(sql`
      INSERT INTO class_definitions (name, type, sort_order, min_age_months, max_age_months, max_wins, description)
      VALUES (
        ${cd.name},
        ${cd.type}::class_type,
        ${cd.sortOrder},
        ${cd.minAgeMonths ?? null},
        ${cd.maxAgeMonths ?? null},
        ${'maxWins' in cd ? (cd as any).maxWins ?? null : null},
        ${cd.description}
      )
      ON CONFLICT (name) DO NOTHING
      RETURNING name
    `);
    if (result.length > 0) {
      insertedCount++;
      insertedNames.push(cd.name);
      console.log(`  INSERTED: ${cd.name} (${cd.type})`);
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Total in canonical list: ${allClassDefs.length}`);
  console.log(`Already existed: ${allClassDefs.length - insertedCount}`);
  console.log(`Newly inserted: ${insertedCount}`);
  if (insertedNames.length > 0) {
    console.log('\nNewly inserted class definitions:');
    for (const name of insertedNames) {
      console.log(`  + ${name}`);
    }
  } else {
    console.log('\nAll class definitions already existed — nothing to insert.');
  }

  // Verify final state
  const final = await db.execute(sql`SELECT name, type, sort_order FROM class_definitions ORDER BY type, sort_order`);
  console.log(`\nFinal class definitions in database (${final.length} total):`);
  for (const row of final) {
    console.log(`  [${row.type}] ${row.name} (sort: ${row.sort_order})`);
  }

  await client.end();
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
