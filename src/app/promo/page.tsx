import type { Metadata } from "next";
import Link from "next/link";

const BASE_URL = "https://remishowmanager.co.uk";

export const metadata: Metadata = {
  title: "Remi — The Future of Dog Show Management",
  description:
    "Enter shows, pay securely, get confirmed instantly. Built for exhibitors and secretaries on the UK Kennel Club circuit.",
  metadataBase: new URL(BASE_URL),
  openGraph: {
    title: "Remi — The Future of Dog Show Management",
    description:
      "Enter shows, pay securely, get confirmed instantly. Built for exhibitors and secretaries on the UK Kennel Club circuit.",
    images: [
      {
        url: `${BASE_URL}/promo/poster.png`,
        width: 1080,
        height: 1920,
        alt: "Remi — Modern dog show entry management",
      },
    ],
    type: "website",
    url: `${BASE_URL}/promo`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Remi — The Future of Dog Show Management",
    description:
      "Enter shows, pay securely, get confirmed instantly. Built for exhibitors and secretaries on the UK Kennel Club circuit.",
    images: [`${BASE_URL}/promo/poster.png`],
  },
};

export default function PromoPage() {
  return (
    <main className="min-h-dvh bg-[#0a1a14] text-[#f0ede6] flex flex-col items-center">
      {/* Video section */}
      <div className="w-full max-w-md mx-auto flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12">
        {/* Video container — phone-shaped */}
        <div className="w-full rounded-2xl overflow-hidden shadow-2xl shadow-black/50 mb-8">
          <video
            autoPlay
            muted
            loop
            playsInline
            poster="/promo/poster.png"
            className="w-full h-auto"
          >
            <source src="/promo/remi-promo.mp4" type="video/mp4" />
          </video>
        </div>

        {/* CTA section */}
        <div className="text-center space-y-5 w-full">
          <div className="flex items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2d6a4f] to-[#40916c] flex items-center justify-center">
              <span className="font-serif text-xl font-bold text-white leading-none">
                R
              </span>
            </div>
            <span className="font-serif text-2xl font-bold tracking-wide">
              Remi
            </span>
          </div>

          <p className="text-[#a8b5a0] text-sm leading-relaxed max-w-xs mx-auto">
            Modern show management for the Kennel Club circuit. Online entries,
            integrated payments, automatic catalogues.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/shows"
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#c8a45c] to-[#d4b87a] px-8 py-3 text-sm font-semibold text-[#0a1a14] hover:opacity-90 transition-opacity"
            >
              Browse upcoming shows
            </Link>
            <Link
              href="/about"
              className="inline-flex items-center justify-center rounded-full border border-[#2d6a4f] px-8 py-3 text-sm font-semibold text-[#a8b5a0] hover:border-[#40916c] hover:text-[#f0ede6] transition-colors"
            >
              Learn more
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="w-full text-center py-6 text-xs text-[#6b7f6b]">
        <div className="w-12 h-0.5 bg-gradient-to-r from-[#c8a45c] to-[#d4b87a] mx-auto mb-4 rounded-full" />
        The future of dog show management
      </div>
    </main>
  );
}
