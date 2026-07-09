import { Suspense } from 'react';
import { Hanken_Grotesk } from 'next/font/google';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';

// Show Experience (green) theme font. Loaded here (not root layout) so it's
// scoped to the (shows) route group only. Exposes --font-hanken as a CSS
// variable — it does NOT change the group's default font-family, which
// stays Inter (inherited from root layout) until a page opts in via the
// `.show-exp` wrapper class defined in globals.css.
const hankenGrotesk = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-hanken',
});

export default function ShowsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${hankenGrotesk.variable} flex min-h-screen flex-col overflow-x-hidden`}>
      <Suspense fallback={null}>
        <Header />
      </Suspense>
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
