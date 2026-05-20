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
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: itemListJsonLd }}
      />
      {/* Hero header */}
      <div className="relative overflow-hidden border-b bg-gradient-to-b from-primary/[0.04] to-transparent">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-32 -top-32 h-80 w-80 rounded-full bg-primary/[0.06] blur-3xl" />
          <div className="absolute -left-20 bottom-0 h-60 w-60 rounded-full bg-gold/[0.04] blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-12 sm:px-6 sm:pb-12 sm:pt-16">
          <p className="mb-2 text-sm font-medium tracking-widest text-primary/70 uppercase">
            Discover
          </p>
          <h1 className="font-serif text-4xl font-bold tracking-tight sm:text-5xl">
            Find a Show
          </h1>
          <p className="mt-4 max-w-lg text-lg leading-relaxed text-muted-foreground">
            Browse championship, open, and companion shows across the country.
            Find your next ring and enter online.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <ShowsList />
      </div>
    </div>
  );
}
