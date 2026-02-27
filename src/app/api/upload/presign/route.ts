import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { validateUpload, generatePresignedPutUrl, getPublicUrl } from '@/server/services/storage';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { fileName, contentType, sizeBytes } = body as {
    fileName: string;
    contentType: string;
    sizeBytes: number;
  };

  if (!fileName || !contentType || !sizeBytes) {
    return NextResponse.json(
      { error: 'fileName, contentType, and sizeBytes are required' },
      { status: 400 }
    );
  }

  const validation = validateUpload(contentType, sizeBytes);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  // Generate a unique key with folder structure
  const ext = fileName.split('.').pop() ?? '';
  const key = `uploads/${session.user.id}/${randomUUID()}.${ext}`;

  const presignedUrl = await generatePresignedPutUrl(key, contentType);
  const publicUrl = getPublicUrl(key);

  return NextResponse.json({
    presignedUrl,
    publicUrl,
    key,
  });
}
