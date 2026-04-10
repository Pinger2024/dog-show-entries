import 'dotenv/config';
import postgres from 'postgres';

async function main() {
  const client = postgres(process.env.DATABASE_URL as string);
  // Add the column if it doesn't exist
  await client`
    ALTER TABLE entries
    ADD COLUMN IF NOT EXISTS withhold_from_publication boolean NOT NULL DEFAULT false
  `;
  console.log('✓ Added withhold_from_publication column to entries');
  await client.end();
}
main();
