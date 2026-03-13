import 'dotenv/config';
import { db } from '@/server/db/index.js';
import { sql } from 'drizzle-orm';

async function main() {
  // Fix title text: KC → RKC in existing checklist items
  const result = await db.execute(
    sql`UPDATE show_checklist_items 
        SET title = REPLACE(title, 'KC show licence', 'RKC show licence'),
            description = REPLACE(COALESCE(description, ''), 'KC licence', 'RKC licence')
        WHERE title LIKE '%KC show licence%' OR title LIKE '%KC licence%' OR description LIKE '%KC licence%'`
  );
  console.log(`Updated ${result.rowCount} rows (KC → RKC in checklist items)`);

  // Also fix any "Bring KC licence" items
  const result2 = await db.execute(
    sql`UPDATE show_checklist_items 
        SET title = REPLACE(title, 'Bring KC licence', 'Bring RKC licence')
        WHERE title LIKE '%Bring KC licence%'`
  );
  console.log(`Updated ${result2.rowCount} rows (Bring KC → Bring RKC)`);

  // Fix "Record KC licence number"
  const result3 = await db.execute(
    sql`UPDATE show_checklist_items 
        SET title = REPLACE(title, 'Record KC licence', 'Record RKC licence')
        WHERE title LIKE '%Record KC licence%'`
  );
  console.log(`Updated ${result3.rowCount} rows (Record KC → Record RKC)`);

  process.exit(0);
}

main().catch(console.error);
