import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { validateUpload, uploadToR2, getPublicUrl } from '@/server/services/storage';
import { randomUUID } from 'crypto';

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

    const ext = file.name.split('.').pop() ?? '';
    const key = `uploads/${session.user.id}/${randomUUID()}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadToR2(key, buffer, file.type);

    const publicUrl = getPublicUrl(key);

    return NextResponse.json({ publicUrl, key });
  } catch (err) {
    console.error('Upload error:', err);
    const message =
      err instanceof Error ? err.message : 'Upload service error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
