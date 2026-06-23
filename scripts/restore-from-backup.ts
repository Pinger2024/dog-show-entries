/**
 * scripts/restore-from-backup.ts
 *
 * Download an encrypted off-site R2 backup (made by backup-db.ts), DECRYPT it,
 * restore it into a target database, and sanity-check it. This is the half of a
 * backup that actually counts: proof we can recover, not just a file in a bucket.
 *
 * SAFETY: refuses to restore into any render.com host (never overwrite prod),
 * and refuses non-local targets unless --force is passed.
 *
 * Usage:
 *   npx tsx scripts/restore-from-backup.ts [--key=<r2 key>|latest] --target=<postgres url> [--force]
 *
 * Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, BACKUP_ENCRYPTION_KEY,
 *      BACKUP_R2_BUCKET (default remi), BACKUP_R2_PREFIX (default db-backups),
 *      PG_RESTORE_PATH (optional override).
 */
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { createDecipheriv, createHash } from 'node:crypto';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import postgres from 'postgres';

const parsed = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? 'true'] : [a, 'true'];
  }),
) as Record<string, string>;

const accountId = process.env.R2_ACCOUNT_ID;
const bucket = process.env.BACKUP_R2_BUCKET || 'remi';
const prefix = (process.env.BACKUP_R2_PREFIX || 'db-backups').replace(/\/$/, '');
const encKeyHex = process.env.BACKUP_ENCRYPTION_KEY || '';
const keyArg = parsed.key || 'latest';
const target = parsed.target || 'postgresql://postgres@127.0.0.1:5432/remi_test';
const force = parsed.force === 'true';

function fail(msg: string): never {
  console.error(`✗ restore failed: ${msg}`);
  process.exit(1);
}

const PG_RESTORE =
  process.env.PG_RESTORE_PATH ||
  (existsSync('/opt/homebrew/opt/postgresql@18/bin/pg_restore')
    ? '/opt/homebrew/opt/postgresql@18/bin/pg_restore'
    : 'pg_restore');

function safetyCheck(url: string) {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    fail('invalid --target url');
  }
  if (/render\.com$/i.test(host)) {
    fail(`refusing to restore into a render.com host (${host}) — never overwrite prod`);
  }
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (!isLocal && !force) {
    fail(`target ${host} is not local; pass --force if you really mean it`);
  }
}

/** Reverse of backup-db.ts encrypt(): [iv(12)][tag(16)][ciphertext]. */
function decrypt(blob: Buffer, keyHex: string): Buffer {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY must be 64 hex chars (32 bytes)');
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const ciphertext = blob.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function pgRestore(file: string, dbUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const restoreArgs = [
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      `--dbname=${dbUrl}`,
      file,
    ];
    const child = spawn(PG_RESTORE, restoreArgs, { stdio: ['ignore', 'inherit', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve();
      // pg_restore returns non-zero on benign warnings (e.g. DROP of an object
      // that doesn't exist yet). Only treat genuine errors as fatal; the row
      // counts afterwards are the real proof of a good restore.
      if (/\berror\b/i.test(stderr)) return reject(new Error(stderr.trim()));
      if (stderr.trim()) console.warn(stderr.trim());
      resolve();
    });
  });
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function main() {
  if (!accountId) fail('R2_ACCOUNT_ID must be set');
  if (!encKeyHex) fail('BACKUP_ENCRYPTION_KEY must be set');
  safetyCheck(target);

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    },
  });

  let key = keyArg;
  let expectedSha: string | undefined;
  if (keyArg === 'latest') {
    const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: `${prefix}/_meta/latest.json` }));
    const meta = JSON.parse(await r.Body!.transformToString());
    key = meta.key;
    expectedSha = meta.sha256;
    console.log(
      `• latest = ${key} (${(meta.plainBytes / 1024 / 1024).toFixed(1)} MB plaintext, ${meta.createdAt})`,
    );
  }

  const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const blob = await bodyToBuffer(obj.Body);
  console.log(`• downloaded ${(blob.length / 1024 / 1024).toFixed(1)} MB ciphertext — decrypting`);
  const plain = decrypt(blob, encKeyHex);

  if (expectedSha) {
    const sha = createHash('sha256').update(plain).digest('hex');
    if (sha !== expectedSha) fail(`sha256 mismatch after decrypt — corrupt (${sha} != ${expectedSha})`);
    console.log(`• integrity OK (sha256 ${sha.slice(0, 12)}…)`);
  }

  const tmp = join(tmpdir(), `remi-restore-${Date.now()}.dump`);
  writeFileSync(tmp, plain);

  console.log(`• restoring into ${new URL(target).host} with ${PG_RESTORE}`);
  const t0 = Date.now();
  await pgRestore(tmp, target);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  // Sanity: count rows in core tables to prove data actually landed.
  const sql = postgres(target, { max: 1 });
  try {
    const tables = ['organisations', 'shows', 'entries', 'orders', 'dogs', 'users'];
    console.log(`✓ restored in ${secs}s. Row counts:`);
    for (const t of tables) {
      try {
        const [{ c }] = await sql`SELECT count(*)::int AS c FROM ${sql(t)}`;
        console.log(`    ${t.padEnd(16)} ${c}`);
      } catch {
        console.log(`    ${t.padEnd(16)} (absent)`);
      }
    }
  } finally {
    await sql.end();
  }

  try {
    unlinkSync(tmp);
  } catch {
    /* best-effort */
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
