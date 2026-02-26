import ShowsList from './shows-list';

export const dynamic = 'force-dynamic';

export default function ShowsPage() {
  return (
    <div className="min-h-screen">
      {/* Hero header */}
      <div className="relative overflow-hidden border-b bg-gradient-to-b from-primary/[0.04] to-transparent">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-32 -top-32 h-80 w-80 rounded-full bg-primary/[0.06] blur-3xl" />
          <div className="absolute -left-20 bottom-0 h-60 w-60 rounded-full bg-primary/[0.04] blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 pb-8 pt-10 sm:px-6 sm:pb-10 sm:pt-14">
          <p className="mb-2 text-sm font-medium tracking-widest text-primary/70 uppercase">
            Discover
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            Upcoming Shows
          </h1>
          <p className="mt-3 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
            Browse championship, open, and companion shows across the country.
            Find your next ring.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <ShowsList />
      </div>
    </div>
  );
}
