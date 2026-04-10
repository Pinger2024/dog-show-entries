import 'dotenv/config';
import postgres from 'postgres';

async function main() {
  const client = postgres(process.env.DATABASE_URL as string);
  const rows = await client`
    SELECT id, subject, text_body, from_email, status, created_at
    FROM feedback
    ORDER BY created_at DESC
    LIMIT 10
  `;
  for (const r of rows) {
    console.log('\n========================================');
    console.log('ID:', r.id);
    console.log('From:', r.from_email);
    console.log('Status:', r.status);
    console.log('Subject:', r.subject);
    console.log('Created:', r.created_at);
    console.log('--- BODY (first 2000 chars) ---');
    console.log((r.text_body || '').slice(0, 2000));
  }
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
