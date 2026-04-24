import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { db } from '@/server/db';
import { eq } from 'drizzle-orm';
import { shows } from '@/server/db/schema';
import { ShowPreviewClient } from './preview/show-preview';
import { buildShowJsonLd } from '@/lib/show-json-ld';
import { isUuid } from '@/lib/slugify';

const SHOW_TYPE_LABELS: Record<string, string> = {
  companion: 'Companion Show',
  primary: 'Primary Show',
  limited: 'Limited Show',
  open: 'Open Show',
  premier_open: 'Premier Open Show',
  championship: 'Championship Show',
};

/** Resolve a show by UUID or slug */
async function resolveShow(idOrSlug: string) {
  if (!db) return null;
  return db.query.shows.findFirst({
    where: isUuid(idOrSlug) ? eq(shows.id, idOrSlug) : eq(shows.slug, idOrSlug),
    with: {
      organisation: true,
      venue: true,
      judgeAssignments: {
        with: { judge: true },
      },
      showSponsors: {
        with: {
          sponsor: {
            columns: { name: true, website: true, logoUrl: true },
          },
        },
      },
    },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  const show = await resolveShow(id);

  if (!show) {
    return { title: 'Show Not Found' };
  }

  const showDate = new Date(show.startDate).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const showType = SHOW_TYPE_LABELS[show.showType] ?? show.showType;
  const venue = show.venue?.name;
  const org = show.organisation?.name;

  const title = org ? `${show.name} — ${org}` : `${show.name} — ${showType}`;
  const description = [
    showDate,
    venue,
    org,
    show.status === 'entries_open' ? 'Now accepting entries on Remi.' : undefined,
  ]
    .filter(Boolean)
    .join(' · ');

  const canonical = `https://remishowmanager.co.uk/shows/${show.slug ?? show.id}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: 'Remi Show Manager',
      url: canonical,
      // Images are automatically set by the opengraph-image.tsx file convention
      // Do NOT set images explicitly here — it overrides the auto-generated URL
      // which includes a hash suffix (e.g. opengraph-image-12azfe)
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      // Twitter images are also set automatically by opengraph-image.tsx
    },
  };
}

export default async function ShowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Redirect UUID URLs to clean slug URLs (301)
  if (isUuid(id)) {
    const show = await db?.query.shows.findFirst({
      where: eq(shows.id, id),
      columns: { slug: true },
    });
    if (show?.slug) {
      redirect(`/shows/${show.slug}`);
    }
  }

  const show = await resolveShow(id);

  const showUrl = `https://remishowmanager.co.uk/shows/${show?.slug ?? id}`;

  // JSON-LD is safe here: content is from our own database and
  // JSON.stringify escapes all special characters, preventing XSS.
  const jsonLd = show
    ? JSON.stringify(buildShowJsonLd(show, showUrl, show.showSponsors))
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd }}
        />
      )}
      <ShowPreviewClient />
    </>
  );
}
