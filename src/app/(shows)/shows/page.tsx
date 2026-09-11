import type { Metadata } from 'next';
import { and, gte, inArray, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import { shows } from '@/server/db/schema';
import { buildShowJsonLd } from '@/lib/show-json-ld';
import ShowsList from '@/components/shows/shows-list';

export const dynamic = 'force-dynamic';

const BASE_URL = 'https://remishowmanager.co.uk';
const LISTING_URL = `${BASE_URL}/shows`;
const LISTING_TITLE = 'Find UK Dog Shows — RKC Open & Championship Shows | Remi';
const LISTING_DESCRIPTION =
  'Browse upcoming RKC-licensed dog shows across the UK. Open, championship, companion, and breed shows — find your next ring and enter online with Remi.';

export const metadata: Metadata = {
  title: LISTING_TITLE,
  description: LISTING_DESCRIPTION,
  alternates: { canonical: LISTING_URL },
  openGraph: {
    title: LISTING_TITLE,
    description: LISTING_DESCRIPTION,
    url: LISTING_URL,
    type: 'website',
    siteName: 'Remi Show Manager',
  },
  twitter: {
    card: 'summary_large_image',
    title: LISTING_TITLE,
    description: LISTING_DESCRIPTION,
  },
};

async function getUpcomingShowsForJsonLd() {
  if (!db) return [];
  const today = new Date().toISOString().slice(0, 10);
  return db.query.shows.findMany({
    where: and(
      inArray(shows.status, ['published', 'entries_open', 'entries_closed', 'in_progress']),
      gte(shows.startDate, today),
    ),
    with: {
      organisation: { columns: { name: true, website: true, logoUrl: true } },
      venue: true,
      judgeAssignments: { with: { judge: { columns: { name: true } } } },
    },
    orderBy: (s, { asc }) => [asc(s.startDate)],
    limit: 50,
  });
}

function buildItemListJsonLd(upcoming: Awaited<ReturnType<typeof getUpcomingShowsForJsonLd>>) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Upcoming UK Dog Shows',
    url: LISTING_URL,
    numberOfItems: upcoming.length,
    itemListElement: upcoming.map((show, idx) => {
      const showUrl = `${BASE_URL}/shows/${show.slug ?? show.id}`;
      return {
        '@type': 'ListItem',
        position: idx + 1,
        url: showUrl,
        item: buildShowJsonLd(show, showUrl),
      };
    }),
  });
}

export default async function ShowsPage() {
  const upcoming = await getUpcomingShowsForJsonLd();
  const itemListJsonLd = buildItemListJsonLd(upcoming);

  return (
    <div className="show-exp min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: itemListJsonLd }}
      />
      {/* Content — ShowsList renders its own reactive header (subline
          reflects Near Me state) since that state lives client-side. */}
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <ShowsList />
      </div>
    </div>
  );
}
