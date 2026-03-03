'use client';

import ShowsList from '@/components/shows/shows-list';

export default function BrowseShowsPage() {
  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">
          Find a Show
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse upcoming shows and enter your dog online.
        </p>
      </div>
      <ShowsList />
    </div>
  );
}
