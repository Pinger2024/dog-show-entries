import type { MetadataRoute } from 'next';
import { db } from '@/server/db';
import { shows } from '@/server/db/schema';
import { ne } from 'drizzle-orm';
import { listDogsWithPublicHistory } from '@/server/services/public-dog-summary';

const BASE_URL = 'https://remishowmanager.co.uk';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE_URL}/shows`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/dog`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/pricing`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/help`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/about`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/features`, changeFrequency: 'monthly', priority: 0.6 },
  ];

  // Live shows only — drafts are excluded (cancelled shows stay so Google sees the
  // status update in the JSON-LD before deindexing).
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

  // Only dogs the public has something to see for — every other profile is
  // thin content. "Has a confirmed entry" used to be the test, which listed
  // dogs whose only entries were upcoming shows (Mandy, 1 Oct 2026).
  const dogsWithHistory = await listDogsWithPublicHistory(db);

  const dogPages: MetadataRoute.Sitemap = dogsWithHistory.map((dog) => ({
    url: `${BASE_URL}/dog/${dog.id}`,
    lastModified: dog.updatedAt ?? undefined,
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));

  return [...staticPages, ...showPages, ...dogPages];
}
