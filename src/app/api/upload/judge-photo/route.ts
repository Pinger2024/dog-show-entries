import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { auth } from '@/lib/auth';
import { validateUpload, uploadToR2, getPublicUrl } from '@/server/services/storage';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const validation = validateUpload(file.type, file.size);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 });
    }

    const ext = file.name.split('.').pop() ?? 'jpg';
    const key = `judge-photos/${randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await uploadToR2(key, buffer, file.type);
    const publicUrl = getPublicUrl(key);

    return NextResponse.json({ url: publicUrl, key });
  } catch (err) {
    console.error('Judge photo upload failed:', err);
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
