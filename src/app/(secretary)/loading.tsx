/**
 * Secretary route group loading skeleton.
 * Matches the SecretaryShell layout: sidebar (desktop) + header + content area.
 * Self-contained — no shared component imports.
 */
export default function SecretaryLoading() {
  return (
    <div className="flex min-h-screen overflow-x-hidden">
      {/* Desktop sidebar skeleton */}
      <aside className="hidden w-64 shrink-0 border-r bg-sidebar md:flex md:flex-col">
        {/* Logo area */}
        <div className="flex h-[4.5rem] items-center border-b px-5">
          <div className="h-7 w-16 animate-pulse rounded bg-muted" />
        </div>
        {/* User info area */}
        <div className="border-b px-5 py-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-3 w-32 animate-pulse rounded bg-muted" />
            </div>
          </div>
        </div>
        {/* Nav items */}
        <div className="flex-1 space-y-1 p-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-3">
              <div className="size-5 animate-pulse rounded bg-muted" />
              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Desktop header skeleton */}
        <header className="hidden h-[4.5rem] items-center border-b px-6 md:flex">
          <div className="flex items-center gap-2">
            <div className="h-4 w-12 animate-pulse rounded bg-muted" />
            <div className="h-4 w-4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          </div>
        </header>

        {/* Mobile header skeleton */}
        <header className="flex h-16 items-center justify-between border-b px-3 sm:px-4 md:hidden">
          <div className="h-6 w-14 animate-pulse rounded bg-muted" />
          <div className="flex items-center gap-1.5">
            <div className="size-9 animate-pulse rounded bg-muted" />
            <div className="size-9 animate-pulse rounded bg-muted" />
          </div>
        </header>

        {/* Content skeleton */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-2 py-4 pb-28 sm:px-4 sm:py-6 sm:pb-28 md:pb-8 lg:px-8">
            {/* Page title */}
            <div className="h-8 w-48 animate-pulse rounded bg-muted" />
            {/* Content blocks */}
            <div className="mt-6 space-y-4">
              <div className="h-32 animate-pulse rounded-xl bg-muted" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="h-24 animate-pulse rounded-xl bg-muted" />
                <div className="h-24 animate-pulse rounded-xl bg-muted" />
              </div>
              <div className="h-48 animate-pulse rounded-xl bg-muted" />
            </div>
          </div>
        </main>

        {/* Mobile bottom bar skeleton */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-1 flex-col items-center justify-center gap-1 min-h-[48px] py-2">
              <div className="size-5 animate-pulse rounded bg-muted" />
              <div className="h-3 w-8 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </nav>
      </div>
    </div>
  );
}
