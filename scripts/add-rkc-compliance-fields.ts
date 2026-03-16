import 'dotenv/config';
import postgres from 'postgres';

async function applySchema() {
  const sql = postgres(process.env.DATABASE_URL as string);

  console.log('Adding RKC compliance fields...\n');

  // 1. Add registration_status to dogs
  const dogsCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'dogs' AND column_name = 'registration_status'
  `;
  if (dogsCols.length === 0) {
    await sql`ALTER TABLE dogs ADD COLUMN registration_status TEXT`;
    console.log('  + dogs.registration_status (NAF/TAF/CNAF)');
  } else {
    console.log('  = dogs.registration_status already exists');
  }

  // 2. Add jep_level to judges
  const judgesCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'judges' AND column_name = 'jep_level'
  `;
  if (judgesCols.length === 0) {
    await sql`ALTER TABLE judges ADD COLUMN jep_level INTEGER`;
    console.log('  + judges.jep_level (JEP level 1-6)');
  } else {
    console.log('  = judges.jep_level already exists');
  }

  console.log('\nDone.');
  await sql.end();
}

applySchema().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
