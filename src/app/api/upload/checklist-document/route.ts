import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { auth } from '@/lib/auth';
import { validateUpload, uploadToR2, getPublicUrl } from '@/server/services/storage';
import { db } from '@/server/db';
import { fileUploads } from '@/server/db/schema';

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

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

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Allowed file types: PDF, JPEG, PNG, Word documents' },
        { status: 400 }
      );
    }

    const validation = validateUpload(file.type, file.size);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Upload to R2
    const ext = file.name.split('.').pop() ?? 'bin';
    const key = `checklist-docs/${session.user.id}/${randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadToR2(key, buffer, file.type);

    const publicUrl = getPublicUrl(key);

    // Create file_uploads record
    const [record] = await db
      .insert(fileUploads)
      .values({
        uploadedBy: session.user.id,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        storageKey: key,
        publicUrl,
      })
      .returning();

    return NextResponse.json({ id: record!.id, publicUrl, fileName: file.name });
  } catch (err) {
    console.error('Checklist document upload error:', err);
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
