import 'dotenv/config';
import { db } from '@/server/db/index.js';
import { sql } from 'drizzle-orm';

async function main() {
  // Broader fix: replace standalone "KC" with "RKC" in titles and descriptions
  // Target patterns: "from KC", "to KC", "KC regulations", "certificates from KC"
  const replacements = [
    { old: 'from KC', new: 'from RKC' },
    { old: 'to KC', new: 'to RKC' },
    { old: 'KC regulations', new: 'RKC regulations' },
  ];

  for (const r of replacements) {
    await db.execute(
      sql`UPDATE show_checklist_items 
          SET title = REPLACE(title, ${r.old}, ${r.new})
          WHERE title LIKE ${'%' + r.old + '%'} AND title NOT LIKE ${'%R' + r.old + '%'}`
    );
    await db.execute(
      sql`UPDATE show_checklist_items 
          SET description = REPLACE(description, ${r.old}, ${r.new})
          WHERE description LIKE ${'%' + r.old + '%'} AND description NOT LIKE ${'%R' + r.old + '%'}`
    );
    console.log(`Fixed: "${r.old}" → "${r.new}"`);
  }

  // Verify
  const remaining = await db.execute(
    sql`SELECT DISTINCT title FROM show_checklist_items WHERE (title LIKE '%KC%' AND title NOT LIKE '%RKC%') LIMIT 20`
  );
  console.log('\nRemaining items with KC (not RKC):');
  for (const r of remaining) {
    console.log(`  - ${(r as any).title}`);
  }

  if (remaining.length === 0) {
    console.log('  None — all fixed!');
  }

  process.exit(0);
}

main().catch(console.error);
