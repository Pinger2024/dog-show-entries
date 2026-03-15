import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { validateUpload, generatePresignedPutUrl, getPublicUrl } from '@/server/services/storage';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  try {
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

    // Derive extension from validated MIME type, not client-supplied filename
    const extByMime: Record<string, string> = {
      'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
      'image/svg+xml': 'svg', 'application/pdf': 'pdf',
    };
    const ext = extByMime[contentType] ?? 'bin';
    const key = `uploads/${session.user.id}/${randomUUID()}.${ext}`;

    const presignedUrl = await generatePresignedPutUrl(key, contentType);
    const publicUrl = getPublicUrl(key);

    return NextResponse.json({
      presignedUrl,
      publicUrl,
      key,
    });
  } catch (err) {
    console.error('Presign error:', err);
    const message =
      err instanceof Error ? err.message : 'Upload service error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
