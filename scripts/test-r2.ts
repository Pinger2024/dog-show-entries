import 'dotenv/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

async function main() {
  const key = `test-connectivity-${Date.now()}.txt`;

  await client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: 'hello from remi',
    ContentType: 'text/plain',
  }));
  console.log('Upload: OK');

  const res = await fetch(`${process.env.R2_PUBLIC_URL}/${key}`);
  console.log(`Public read: ${res.status} ${res.statusText}`);
  const body = await res.text();
  console.log(`Content: ${body}`);

  await client.send(new DeleteObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
  }));
  console.log('Cleanup: OK');
}

main().catch(e => console.error('FAILED:', e.message));
