import { Suspense } from 'react';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';

// Hanken Grotesk (--font-hanken) is now loaded once at the root layout and
// aliased as the app-wide --font-sans/--font-serif — no per-group font load
// needed here anymore.

export default function ShowsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden">
      <Suspense fallback={null}>
        <Header />
      </Suspense>
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
