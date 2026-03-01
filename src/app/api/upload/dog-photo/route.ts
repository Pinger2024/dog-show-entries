import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { validateUpload, uploadToR2, getPublicUrl } from '@/server/services/storage';
import { db } from '@/server/db';
import { dogs, dogPhotos } from '@/server/db/schema';

const MAX_PHOTOS_PER_DOG = 20;

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const dogId = formData.get('dogId') as string | null;
    const isPrimary = formData.get('isPrimary') === 'true';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!dogId) {
      return NextResponse.json({ error: 'dogId is required' }, { status: 400 });
    }

    // Validate file type and size
    const validation = validateUpload(file.type, file.size);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Only allow image types
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 });
    }

    // Verify the user owns this dog
    const dog = await db.query.dogs.findFirst({
      where: and(
        eq(dogs.id, dogId),
        eq(dogs.ownerId, session.user.id),
        isNull(dogs.deletedAt)
      ),
    });

    if (!dog) {
      return NextResponse.json({ error: 'Dog not found' }, { status: 404 });
    }

    // Check photo limit
    const existingPhotos = await db.query.dogPhotos.findMany({
      where: eq(dogPhotos.dogId, dogId),
    });

    if (existingPhotos.length >= MAX_PHOTOS_PER_DOG) {
      return NextResponse.json(
        { error: `Maximum ${MAX_PHOTOS_PER_DOG} photos per dog` },
        { status: 400 }
      );
    }

    // Upload to R2
    const ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp';
    const key = `dogs/${dogId}/${randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadToR2(key, buffer, file.type);

    const url = getPublicUrl(key);

    // If setting as primary, clear existing primary
    if (isPrimary) {
      await db
        .update(dogPhotos)
        .set({ isPrimary: false })
        .where(and(eq(dogPhotos.dogId, dogId), eq(dogPhotos.isPrimary, true)));
    }

    // If this is the first photo, make it primary automatically
    const shouldBePrimary = isPrimary || existingPhotos.length === 0;

    // Create DB record
    const [photo] = await db
      .insert(dogPhotos)
      .values({
        dogId,
        storageKey: key,
        url,
        isPrimary: shouldBePrimary,
        sortOrder: existingPhotos.length,
      })
      .returning();

    return NextResponse.json({ photo });
  } catch (err) {
    console.error('Dog photo upload error:', err);
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
