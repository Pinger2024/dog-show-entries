import type { Metadata, Viewport } from 'next';
import { Inter, Libre_Baskerville } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { Providers } from '@/components/providers';
import { AccountSwitcher } from '@/components/dev/account-switcher';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

const libreBaskerville = Libre_Baskerville({
  variable: '--font-libre-baskerville',
  subsets: ['latin'],
  weight: ['400', '700'],
});

export const metadata: Metadata = {
  title: {
    default: 'Remi — Enter Dog Shows with Confidence',
    template: '%s | Remi',
  },
  description:
    'Find upcoming KC-licensed shows, enter all your dogs in one place, and manage your entries from home or ringside. Trusted by exhibitors and show secretaries.',
  manifest: '/manifest.json',
  keywords: [
    'dog shows',
    'dog show entries',
    'KC shows',
    'kennel club',
    'conformation',
    'show entries online',
    'championship shows',
    'open shows',
  ],
};

export const viewport: Viewport = {
  themeColor: '#2D5F3F',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${libreBaskerville.variable} antialiased`}
      >
        <Providers>
          {children}
          <Toaster richColors position="top-right" />
          <AccountSwitcher />
        </Providers>
      </body>
    </html>
  );
}
