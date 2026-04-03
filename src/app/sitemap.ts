import type { MetadataRoute } from 'next';
import { db } from '@/server/db';
import { shows, dogs } from '@/server/db/schema';
import { and, isNull, ne } from 'drizzle-orm';

const BASE_URL = 'https://remishowmanager.co.uk';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE_URL}/shows`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/pricing`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/help`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/about`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/features`, changeFrequency: 'monthly', priority: 0.6 },
  ];

  // All non-draft shows (published, entries_open, entries_closed, completed, etc.)
  const allShows = await db
    .select({ id: shows.id, slug: shows.slug, updatedAt: shows.updatedAt })
    .from(shows)
    .where(ne(shows.status, 'draft'));

  const showPages: MetadataRoute.Sitemap = allShows.flatMap((show) => {
    const showUrl = `${BASE_URL}/shows/${show.slug ?? show.id}`;
    return [
      {
        url: showUrl,
        lastModified: show.updatedAt ?? undefined,
        changeFrequency: 'daily' as const,
        priority: 0.8,
      },
      {
        url: `${showUrl}/results`,
        lastModified: show.updatedAt ?? undefined,
        changeFrequency: 'daily' as const,
        priority: 0.7,
      },
    ];
  });

  // Public dog profiles (dogs with at least a registered name)
  const allDogs = await db
    .select({ id: dogs.id, updatedAt: dogs.updatedAt })
    .from(dogs)
    .where(isNull(dogs.deletedAt));

  const dogPages: MetadataRoute.Sitemap = allDogs.map((dog) => ({
    url: `${BASE_URL}/dog/${dog.id}`,
    lastModified: dog.updatedAt ?? undefined,
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));

  return [...staticPages, ...showPages, ...dogPages];
}
