/**
 * Create the BAGSD (British Association for German Shepherd Dogs)
 * organisation, attach Mandy as active secretary, upload the logo to
 * R2 and link it as the org logo.
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { db } from '@/server/db/index.js';
import * as s from '@/server/db/schema/index.js';
import { eq } from 'drizzle-orm';

const MANDY_USER_ID = '75e32446-9b97-4e70-9ed5-a6d8987af7af';
const LOGO_SRC = '/Users/michaeljames/.claude/channels/telegram/inbox/1776462636253-AQADpA5rGyOlGVN9.jpg';
const ORG_NAME = 'British Association for German Shepherd Dogs';
const ORG_SLUG = 'bagsd';

async function uploadLogo(): Promise<string> {
  const accountId = process.env.R2_ACCOUNT_ID!;
  const accessKey = process.env.R2_ACCESS_KEY_ID!;
  const secretKey = process.env.R2_SECRET_ACCESS_KEY!;
  const bucket = process.env.R2_BUCKET_NAME!;
  const publicUrl = process.env.R2_PUBLIC_URL!;
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  });
  const body = readFileSync(LOGO_SRC);
  const key = `org-logos/bagsd-${Date.now()}.jpg`;
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: 'image/jpeg',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return `${publicUrl.replace(/\/$/, '')}/${key}`;
}

async function main() {
  if (!db) throw new Error('no db');

  const existing = await db.query.organisations.findFirst({ where: eq(s.organisations.name, ORG_NAME) });
  if (existing) {
    console.log(`BAGSD already exists (${existing.id}) — updating logo + ensuring Mandy is a member`);
    const logoUrl = await uploadLogo();
    await db.update(s.organisations).set({ logoUrl, updatedAt: new Date() }).where(eq(s.organisations.id, existing.id));
    console.log(`  logo URL: ${logoUrl}`);
    const membership = await db.query.memberships.findFirst({ where: eq(s.memberships.organisationId, existing.id) });
    if (!membership) {
      await db.insert(s.memberships).values({
        userId: MANDY_USER_ID,
        organisationId: existing.id,
        status: 'active',
      });
      console.log('  added Mandy as active member');
    }
    process.exit(0);
  }

  console.log('Uploading BAGSD logo to R2...');
  const logoUrl = await uploadLogo();
  console.log(`  logo URL: ${logoUrl}`);

  const [org] = await db.insert(s.organisations).values({
    name: ORG_NAME,
    type: 'single_breed',
    logoUrl,
  }).returning();
  console.log(`Created organisation: ${org.name} (${org.id})`);

  await db.insert(s.memberships).values({
    userId: MANDY_USER_ID,
    organisationId: org.id,
    status: 'active',
  });
  console.log(`Linked Mandy McAteer as an active member`);

  console.log(`\nDone. Amanda should now see BAGSD in her org switcher.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
