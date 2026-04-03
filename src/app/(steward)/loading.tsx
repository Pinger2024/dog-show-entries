/**
 * Steward route group loading skeleton.
 * Matches the StewardShell layout: top header + content area (no sidebar).
 * Self-contained — no shared component imports.
 */
export default function StewardLoading() {
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden">
      {/* Top header skeleton */}
      <header className="flex h-14 items-center justify-between border-b px-3 sm:px-4">
        <div className="flex items-center gap-2">
          <div className="h-6 w-14 animate-pulse rounded bg-muted" />
          <div className="h-5 w-16 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-16 animate-pulse rounded bg-muted" />
          <div className="h-8 w-16 animate-pulse rounded bg-muted" />
        </div>
      </header>

      {/* Content skeleton */}
      <main className="min-w-0 flex-1 overflow-y-auto pb-24 md:pb-8">
        <div className="mx-auto max-w-2xl px-2 py-6 sm:px-4">
          {/* Page title */}
          <div className="h-8 w-36 animate-pulse rounded bg-muted" />
          {/* Content blocks */}
          <div className="mt-6 space-y-4">
            <div className="h-24 animate-pulse rounded-xl bg-muted" />
            <div className="h-24 animate-pulse rounded-xl bg-muted" />
            <div className="h-24 animate-pulse rounded-xl bg-muted" />
          </div>
        </div>
      </main>

      {/* Mobile bottom bar skeleton */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="flex flex-1 flex-col items-center justify-center gap-1 min-h-[48px] py-2">
          <div className="size-5 animate-pulse rounded bg-muted" />
          <div className="h-3 w-12 animate-pulse rounded bg-muted" />
        </div>
      </nav>
    </div>
  );
}
