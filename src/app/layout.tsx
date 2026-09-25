import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { Hanken_Grotesk } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { Providers } from '@/components/providers';
import { ImpersonationBannerWrapper } from '@/components/layout/impersonation-banner-wrapper';
import { ServiceWorkerRegistration } from '@/components/pwa/sw-registration';
import { InstallPrompt } from '@/components/pwa/install-prompt';
import { UpdateNotification } from '@/components/pwa/update-notification';
import { ReportProblemWidget } from '@/components/report-problem-widget';
import './globals.css';

// Show Experience (green) theme font — now the app-wide default. Loaded
// once at the root; globals.css aliases --font-sans/--font-serif to
// --font-hanken so every shadcn component and legacy `font-serif` heading
// picks it up automatically. Previously scoped to (shows) only.
const hankenGrotesk = Hanken_Grotesk({
  variable: '--font-hanken',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});


export const metadata: Metadata = {
  metadataBase: new URL('https://remishowmanager.co.uk'),
  title: {
    default: 'Remi — Enter Dog Shows with Confidence',
    template: '%s | Remi',
  },
  description:
    'Find upcoming RKC-licensed shows, enter all your dogs in one place, and manage your entries from home or ringside. Trusted by exhibitors and show secretaries.',
  manifest: '/manifest.json',
  keywords: [
    'dog shows',
    'dog show entries',
    'RKC shows',
    'royal kennel club',
    'conformation',
    'show entries online',
    'championship shows',
    'open shows',
  ],
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Remi',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#2f6b43',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={hankenGrotesk.variable}>
      <body
        className="antialiased"
      >
        <Providers>
          <Suspense fallback={null}>
            <ImpersonationBannerWrapper />
          </Suspense>
          {children}
          <Toaster richColors position="top-right" />
          <ReportProblemWidget />
          <ServiceWorkerRegistration />
          <InstallPrompt />
          <UpdateNotification />
        </Providers>
      </body>
    </html>
  );
}
