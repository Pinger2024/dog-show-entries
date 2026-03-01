import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let _s3: S3Client | null = null;

function getS3Client(): S3Client {
  if (!_s3) {
    const accountId = process.env.R2_ACCOUNT_ID;
    if (!accountId) {
      throw new Error('R2_ACCOUNT_ID is not configured');
    }
    _s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
      },
    });
  }
  return _s3;
}

const BUCKET = process.env.R2_BUCKET_NAME ?? 'remi-uploads';
const PUBLIC_URL = process.env.R2_PUBLIC_URL ?? '';

const ALLOWED_MIME_TYPES: Record<string, { maxSizeBytes: number }> = {
  'application/pdf': { maxSizeBytes: 10 * 1024 * 1024 }, // 10 MB
  'image/jpeg': { maxSizeBytes: 2 * 1024 * 1024 }, // 2 MB
  'image/png': { maxSizeBytes: 2 * 1024 * 1024 },
  'image/webp': { maxSizeBytes: 2 * 1024 * 1024 },
};

export function validateUpload(mimeType: string, sizeBytes: number) {
  const allowed = ALLOWED_MIME_TYPES[mimeType];
  if (!allowed) {
    return { valid: false, error: `File type ${mimeType} is not supported` };
  }
  if (sizeBytes > allowed.maxSizeBytes) {
    const maxMB = (allowed.maxSizeBytes / 1024 / 1024).toFixed(0);
    return { valid: false, error: `File must be under ${maxMB}MB` };
  }
  return { valid: true, error: null };
}

export async function generatePresignedPutUrl(
  key: string,
  contentType: string,
  expiresIn = 600 // 10 minutes
): Promise<string> {
  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(client, command, { expiresIn });
}

export function getPublicUrl(key: string): string {
  if (PUBLIC_URL) {
    return `${PUBLIC_URL}/${key}`;
  }
  return `https://${BUCKET}.r2.dev/${key}`;
}

/**
 * Upload a file directly to R2 from the server (avoids CORS issues).
 */
export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<void> {
  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  await client.send(command);
}
