import type { Metadata } from 'next';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import { dogs, dogPhotos } from '@/server/db/schema';
import { DogProfileClient } from './dog-profile-client';

const BASE_URL = 'https://remishowmanager.co.uk';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  const dog = await db?.query.dogs.findFirst({
    where: and(eq(dogs.id, id), isNull(dogs.deletedAt)),
    with: {
      breed: true,
    },
  });

  if (!dog) {
    return { title: 'Dog Not Found' };
  }

  const breedName = dog.breed?.name ?? 'Dog';
  const title = dog.registeredName;
  const description = `${breedName} — View profile, show history, and results on Remi.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'profile',
      url: `${BASE_URL}/dog/${id}`,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function DogProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DogProfileClient id={id} />;
}
