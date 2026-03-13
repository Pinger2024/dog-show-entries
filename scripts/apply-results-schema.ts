import 'dotenv/config';
import postgres from 'postgres';

async function applySchema() {
  const sql = postgres(process.env.DATABASE_URL as string);

  console.log('Checking existing columns...');

  // Check shows table
  const showsCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'shows' AND column_name IN ('results_published_at', 'results_locked_at')
  `;
  const existingShowCols = new Set(showsCols.map((r) => r.column_name));
  console.log('Existing shows columns:', [...existingShowCols]);

  // Check judge_assignments table
  const jaCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'judge_assignments' AND column_name IN ('approval_token', 'approval_status', 'approval_sent_at', 'approved_at', 'approval_note')
  `;
  const existingJaCols = new Set(jaCols.map((r) => r.column_name));
  console.log('Existing judge_assignments columns:', [...existingJaCols]);

  // Check dog_timeline_posts table
  const dtpCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'dog_timeline_posts' AND column_name = 'source_show_id'
  `;
  const existingDtpCols = new Set(dtpCols.map((r) => r.column_name));
  console.log('Existing dog_timeline_posts columns:', [...existingDtpCols]);

  // Apply shows columns
  if (!existingShowCols.has('results_published_at')) {
    console.log('Adding results_published_at to shows...');
    await sql`ALTER TABLE shows ADD COLUMN results_published_at TIMESTAMPTZ`;
  } else {
    console.log('results_published_at already exists');
  }
  if (!existingShowCols.has('results_locked_at')) {
    console.log('Adding results_locked_at to shows...');
    await sql`ALTER TABLE shows ADD COLUMN results_locked_at TIMESTAMPTZ`;
  } else {
    console.log('results_locked_at already exists');
  }

  // Apply judge_assignments columns
  if (!existingJaCols.has('approval_token')) {
    console.log('Adding approval_token to judge_assignments...');
    await sql`ALTER TABLE judge_assignments ADD COLUMN approval_token UUID`;
  } else {
    console.log('approval_token already exists');
  }
  if (!existingJaCols.has('approval_status')) {
    console.log('Adding approval_status to judge_assignments...');
    await sql`ALTER TABLE judge_assignments ADD COLUMN approval_status TEXT`;
  } else {
    console.log('approval_status already exists');
  }
  if (!existingJaCols.has('approval_sent_at')) {
    console.log('Adding approval_sent_at to judge_assignments...');
    await sql`ALTER TABLE judge_assignments ADD COLUMN approval_sent_at TIMESTAMPTZ`;
  } else {
    console.log('approval_sent_at already exists');
  }
  if (!existingJaCols.has('approved_at')) {
    console.log('Adding approved_at to judge_assignments...');
    await sql`ALTER TABLE judge_assignments ADD COLUMN approved_at TIMESTAMPTZ`;
  } else {
    console.log('approved_at already exists');
  }
  if (!existingJaCols.has('approval_note')) {
    console.log('Adding approval_note to judge_assignments...');
    await sql`ALTER TABLE judge_assignments ADD COLUMN approval_note TEXT`;
  } else {
    console.log('approval_note already exists');
  }

  // Add index on approval_token
  const idxExists = await sql`
    SELECT 1 FROM pg_indexes WHERE indexname = 'judge_assignments_approval_token_idx'
  `;
  if (idxExists.length === 0) {
    console.log('Creating index on approval_token...');
    await sql`CREATE INDEX judge_assignments_approval_token_idx ON judge_assignments (approval_token)`;
  } else {
    console.log('approval_token index already exists');
  }

  // Apply dog_timeline_posts column
  if (!existingDtpCols.has('source_show_id')) {
    console.log('Adding source_show_id to dog_timeline_posts...');
    await sql`ALTER TABLE dog_timeline_posts ADD COLUMN source_show_id UUID REFERENCES shows(id)`;
  } else {
    console.log('source_show_id already exists');
  }

  console.log('\nSchema migration complete!');
  await sql.end();
  process.exit(0);
}

applySchema().catch(async (e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
