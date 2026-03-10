import type { Metadata } from 'next';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { dogs, dogPhotos, dogTitles, entries, entryClasses, results } from '@/server/db/schema';
import { DogProfileClient } from './dog-profile-client';

const BASE_URL = 'https://remishowmanager.co.uk';

const titleLabels: Record<string, string> = {
  ch: 'Ch.', sh_ch: 'Sh. Ch.', ir_ch: 'Ir. Ch.', ir_sh_ch: 'Ir. Sh. Ch.',
  int_ch: 'Int. Ch.', ob_ch: 'Ob. Ch.', ft_ch: 'FT Ch.', wt_ch: 'WT Ch.',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  const [dog, primaryPhoto, titles, showCount] = await Promise.all([
    db?.query.dogs.findFirst({
      where: and(eq(dogs.id, id), isNull(dogs.deletedAt)),
      with: { breed: { with: { group: true } } },
    }),
    db?.query.dogPhotos.findFirst({
      where: and(eq(dogPhotos.dogId, id), eq(dogPhotos.isPrimary, true)),
      columns: { url: true },
    }),
    db?.select({ title: dogTitles.title })
      .from(dogTitles)
      .where(eq(dogTitles.dogId, id)),
    db?.select({ count: sql<number>`count(distinct ${entries.showId})` })
      .from(entries)
      .where(and(eq(entries.dogId, id), eq(entries.status, 'confirmed'), isNull(entries.deletedAt)))
      .then((r) => r?.[0]?.count ?? 0),
  ]);

  if (!dog) {
    return { title: 'Dog Not Found' };
  }

  const breedName = dog.breed?.name ?? 'Dog';
  const groupName = dog.breed?.group?.name;
  const titlePrefix = (titles ?? [])
    .map((t) => titleLabels[t.title] ?? t.title)
    .join(' ');
  const displayName = titlePrefix
    ? `${titlePrefix} ${dog.registeredName}`
    : dog.registeredName;

  // Build a rich description
  const parts: string[] = [];
  parts.push(`${dog.sex === 'dog' ? 'Male' : 'Female'} ${breedName}`);
  if (groupName) parts[0] += ` (${groupName})`;
  if (dog.breederName) parts.push(`Bred by ${dog.breederName}`);
  if ((showCount ?? 0) > 0) parts.push(`${showCount} show${showCount === 1 ? '' : 's'} entered`);
  if ((titles ?? []).length > 0) parts.push(`${titles!.length} title${titles!.length === 1 ? '' : 's'} held`);
  const description = parts.join(' · ') + ' — View full profile on Remi.';

  const ogImages = primaryPhoto?.url
    ? [{ url: primaryPhoto.url, width: 1200, height: 630 }]
    : [];

  return {
    title: displayName,
    description,
    openGraph: {
      title: displayName,
      description,
      type: 'profile',
      siteName: 'Remi Show Manager',
      url: `${BASE_URL}/dog/${id}`,
      ...(ogImages.length > 0 && { images: ogImages }),
    },
    twitter: {
      card: 'summary_large_image',
      title: displayName,
      description,
      ...(ogImages.length > 0 && { images: [primaryPhoto!.url] }),
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
