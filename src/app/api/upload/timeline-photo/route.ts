import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { validateUpload, uploadToR2, getPublicUrl } from '@/server/services/storage';
import { db } from '@/server/db';
import { dogs } from '@/server/db/schema';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const dogId = formData.get('dogId') as string | null;

    if (!file || !dogId) {
      return NextResponse.json(
        { error: 'File and dogId are required' },
        { status: 400 }
      );
    }

    // Only allow images
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Only images are supported (JPEG, PNG, WebP)' },
        { status: 400 }
      );
    }

    const validation = validateUpload(file.type, file.size);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Verify ownership
    const dog = await db.query.dogs.findFirst({
      where: and(eq(dogs.id, dogId), eq(dogs.ownerId, session.user.id), isNull(dogs.deletedAt)),
    });

    if (!dog) {
      return NextResponse.json({ error: 'Dog not found or not owned by you' }, { status: 403 });
    }

    const ext = file.name.split('.').pop() ?? 'jpg';
    const key = `timeline/${dogId}/${randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadToR2(key, buffer, file.type);

    const publicUrl = getPublicUrl(key);

    return NextResponse.json({ url: publicUrl, key, fileName: file.name });
  } catch (err) {
    console.error('Timeline photo upload error:', err);
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
