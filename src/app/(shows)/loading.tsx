/**
 * Public shows route group loading skeleton.
 * Simple centered layout matching the public pages.
 */
export default function ShowsLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8 lg:px-8">
      {/* Page title */}
      <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-4 w-72 animate-pulse rounded bg-muted" />

      {/* Content blocks */}
      <div className="mt-8 space-y-4">
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="h-48 animate-pulse rounded-xl bg-muted" />
          <div className="h-48 animate-pulse rounded-xl bg-muted" />
          <div className="h-48 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    </div>
  );
}
