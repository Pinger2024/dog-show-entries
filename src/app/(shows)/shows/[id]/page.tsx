import type { Metadata } from 'next';
import { db } from '@/server/db';
import { eq } from 'drizzle-orm';
import { shows } from '@/server/db/schema';
import { ShowDetailClient } from './show-detail';

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
    where: eq(shows.id, id),
    with: {
      venue: true,
      organisation: true,
    },
  });

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

  const title = `${show.name} — ${showType}`;
  const description = [
    showDate,
    venue,
    org,
    show.status === 'entries_open' ? 'Now accepting entries on Remi.' : undefined,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

export default function ShowDetailPage() {
  return <ShowDetailClient />;
}
