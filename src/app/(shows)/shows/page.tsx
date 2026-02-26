import ShowsList from './shows-list';

export const dynamic = 'force-dynamic';

export default function ShowsPage() {
  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Discover Shows</h1>
        <p className="mt-1 text-muted-foreground">
          Browse upcoming dog shows and enter online
        </p>
      </div>
      <ShowsList />
    </div>
  );
}
