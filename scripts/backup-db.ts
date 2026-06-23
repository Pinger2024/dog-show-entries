/**
 * scripts/backup-db.ts
 *
 * Off-site, ENCRYPTED logical backup of the production Postgres database to
 * Cloudflare R2.
 *
 * Why this exists: Render's own daily backups live inside Render and share its
 * fate — a lost account, billing lapse, deleted database, or region incident
 * takes the database AND its backups together. This copy lives in a separate
 * provider (Cloudflare R2), so it survives losing Render entirely.
 *
 * Why encrypted: we reuse the app's existing R2 bucket (the only one our key
 * can write to), and that bucket is public. Each dump is encrypted with
 * AES-256-GCM before upload, so the object in the cloud is meaningless without
 * BACKUP_ENCRYPTION_KEY. (Bonus: encryption-at-rest for a file full of PII.)
 *
 * Encrypted blob layout:  [12-byte IV][16-byte GCM auth tag][ciphertext]
 *
 * Runs identically locally (pg_dump 18 from Homebrew) and from the nightly
 * launchd job. Self-contained: only needs @aws-sdk/client-s3 + a pg_dump 18.
 *
 * Env:
 *   BACKUP_DATABASE_URL | DATABASE_URL                     source DB (required)
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY  R2 creds (required)
 *   BACKUP_ENCRYPTION_KEY    64 hex chars / 32 bytes (required)
 *   BACKUP_R2_BUCKET         destination bucket (default: remi)
 *   BACKUP_R2_PREFIX         key prefix       (default: db-backups)
 *   BACKUP_RETENTION_DAYS    prune older dailies (default: 30; 0 = keep all)
 *   PG_DUMP_PATH             override pg_dump binary
 */
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

const connStr = process.env.BACKUP_DATABASE_URL || process.env.DATABASE_URL;
const accountId = process.env.R2_ACCOUNT_ID;
const bucket = process.env.BACKUP_R2_BUCKET || 'remi';
const prefix = (process.env.BACKUP_R2_PREFIX || 'db-backups').replace(/\/$/, '');
const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS ?? '30');
const encKeyHex = process.env.BACKUP_ENCRYPTION_KEY || '';

function fail(msg: string): never {
  console.error(`✗ backup failed: ${msg}`);
  process.exit(1);
}

const PG_DUMP =
  process.env.PG_DUMP_PATH ||
  (existsSync('/opt/homebrew/opt/postgresql@18/bin/pg_dump')
    ? '/opt/homebrew/opt/postgresql@18/bin/pg_dump'
    : 'pg_dump');

function pgDump(target: string, outFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const dumpArgs = [
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      '--compress=6',
      `--file=${outFile}`,
      target,
    ];
    const child = spawn(PG_DUMP, dumpArgs, { stdio: ['ignore', 'inherit', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`pg_dump exited ${code}: ${stderr.trim()}`)),
    );
  });
}

/** AES-256-GCM encrypt → [iv][tag][ciphertext]. */
function encrypt(plain: Buffer, keyHex: string): Buffer {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY must be 64 hex chars (32 bytes)');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

async function pruneOldBackups(s3: S3Client) {
  if (!retentionDays || retentionDays <= 0) return;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let removed = 0;
  let token: string | undefined;
  do {
    const page: ListObjectsV2Command['input'] = {
      Bucket: bucket,
      Prefix: `${prefix}/daily/`,
      ContinuationToken: token,
    };
    const res = await s3.send(new ListObjectsV2Command(page));
    for (const obj of res.Contents ?? []) {
      if (obj.Key && obj.LastModified && obj.LastModified.getTime() < cutoff) {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }));
        removed++;
      }
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  if (removed) console.log(`• pruned ${removed} backup(s) older than ${retentionDays} days`);
}

async function main() {
  if (!connStr) fail('BACKUP_DATABASE_URL or DATABASE_URL must be set');
  if (!accountId) fail('R2_ACCOUNT_ID must be set');
  if (!encKeyHex) fail('BACKUP_ENCRYPTION_KEY must be set');

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    },
  });

  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z'); // 20260623T091500Z
  const day = now.toISOString().slice(0, 10); // 2026-06-23
  const key = `${prefix}/daily/${day}/remi-prod-${stamp}.dump.enc`;
  const tmp = join(tmpdir(), `remi-backup-${stamp}.dump`);

  let host = 'unknown';
  try {
    host = new URL(connStr).host;
  } catch {
    /* leave as unknown */
  }

  console.log(`• dumping ${host} with ${PG_DUMP}`);
  await pgDump(connStr, tmp);

  const plain = readFileSync(tmp);
  const plainBytes = statSync(tmp).size;
  const sha256 = createHash('sha256').update(plain).digest('hex'); // of plaintext, for post-restore verify

  // A healthy custom-format dump is never this small; guard against uploading a
  // truncated/empty file that would masquerade as a good backup.
  if (plainBytes < 1024) fail(`dump suspiciously small (${plainBytes} bytes) — aborting upload`);

  const blob = encrypt(plain, encKeyHex);

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: blob,
      ContentType: 'application/octet-stream',
      Metadata: {
        sha256,
        'plain-bytes': String(plainBytes),
        'created-at': now.toISOString(),
        'source-host': host,
        enc: 'aes-256-gcm',
      },
    }),
  );

  // Pointer to the newest backup — read by restore-from-backup.ts's `latest`.
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `${prefix}/_meta/latest.json`,
      Body: JSON.stringify(
        { key, plainBytes, encBytes: blob.length, sha256, createdAt: now.toISOString(), sourceHost: host, enc: 'aes-256-gcm' },
        null,
        2,
      ),
      ContentType: 'application/json',
    }),
  );

  try {
    unlinkSync(tmp);
  } catch {
    /* temp cleanup is best-effort */
  }

  await pruneOldBackups(s3);

  const mb = (plainBytes / 1024 / 1024).toFixed(1);
  console.log(
    `✓ encrypted backup uploaded: s3://${bucket}/${key} (${mb} MB plaintext, sha256 ${sha256.slice(0, 12)}…)`,
  );
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
