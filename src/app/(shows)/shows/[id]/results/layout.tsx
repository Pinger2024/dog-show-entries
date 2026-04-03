import type { Metadata } from 'next';
import { db } from '@/server/db';
import { eq } from 'drizzle-orm';
import { shows } from '@/server/db/schema';
import { isUuid } from '@/lib/slugify';

const SHOW_TYPE_LABELS: Record<string, string> = {
  companion: 'Companion Show',
  primary: 'Primary Show',
  limited: 'Limited Show',
  open: 'Open Show',
  premier_open: 'Premier Open Show',
  championship: 'Championship Show',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  const show = await db?.query.shows.findFirst({
    where: isUuid(id) ? eq(shows.id, id) : eq(shows.slug, id),
    with: { venue: true, organisation: true },
  });

  if (!show) {
    return { title: 'Results Not Found' };
  }

  const showDate = new Date(show.startDate).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const showType = SHOW_TYPE_LABELS[show.showType] ?? show.showType;
  const title = `Results — ${show.name}`;
  const description = `${showType} results from ${showDate}${show.venue?.name ? ` at ${show.venue.name}` : ''}${show.organisation?.name ? `, hosted by ${show.organisation.name}` : ''}. View placements, critiques, and awards.`;

  const canonical = `https://remishowmanager.co.uk/shows/${show.slug ?? show.id}/results`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'website',
      siteName: 'Remi — Dog Show Manager',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default function ResultsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
