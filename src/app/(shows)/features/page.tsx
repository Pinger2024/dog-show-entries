import Link from 'next/link';
import type { Metadata } from 'next';
import {
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { AnimateIn } from '@/components/animate-in';
import { FeatureTabs } from '@/components/features/feature-tabs';

export const metadata: Metadata = {
  title: 'Features — Remi Dog Show Management Platform',
  description:
    'Explore every feature Remi offers for exhibitors and show secretaries. Online entries, smart class eligibility, automatic A5 catalogue generation, live results, judge\'s books, prize cards, ring plans, and more.',
  keywords: [
    'dog show entries online',
    'RKC dog show management',
    'dog show catalogue software',
    'show secretary software UK',
    'online dog show entry system',
    'kennel club show management',
    'dog show results live',
    'dog show entry platform',
    'automatic show catalogue',
    'dog show secretary dashboard',
  ],
  openGraph: {
    title: 'Features — Remi Dog Show Management Platform',
    description:
      'The complete platform for UK dog show entries and management. Online entries, automatic catalogues, live results, and everything secretaries need to run a professional show.',
    url: 'https://remishowmanager.co.uk/features',
  },
};

export default function FeaturesPage() {
  return (
    <div>
      {/* ── Hero ────────────────────────────────── */}
      <section className="relative overflow-hidden border-b bg-gradient-to-b from-primary/[0.04] via-transparent to-transparent">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <AnimateIn>
              <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-primary/10">
                <CheckCircle2 className="size-8 text-primary" />
              </div>
            </AnimateIn>
            <AnimateIn delay={100}>
              <h1 className="font-serif text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                Every feature your{' '}
                <span className="text-primary">show needs</span>
              </h1>
            </AnimateIn>
            <AnimateIn delay={200}>
              <p className="gold-rule-center mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                From online entries to printed catalogues, from smart class
                eligibility to live ringside results — Remi replaces
                spreadsheets, paper forms, and manual admin with one
                purpose-built platform for UK dog shows.
              </p>
            </AnimateIn>
            <AnimateIn delay={300}>
              <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <Link
                  href="/shows"
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-primary/30"
                >
                  Browse upcoming shows
                  <ArrowRight className="size-4" />
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-2 rounded-full border px-8 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                >
                  Club pricing
                </Link>
              </div>
            </AnimateIn>
          </div>
        </div>

        {/* Decorative gradient orbs */}
        <div className="pointer-events-none absolute -left-32 -top-32 size-64 rounded-full bg-primary/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-32 size-64 rounded-full bg-primary/5 blur-3xl" />
      </section>

      {/* ── Exhibitor Features ─────────────────── */}
      <FeatureTabs />

      {/* ── Comparison section ─────────────────── */}
      <section className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <AnimateIn className="mx-auto max-w-2xl text-center">
            <h2 className="gold-rule-center font-serif text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
              What makes Remi different
            </h2>
            <p className="mt-5 text-lg text-muted-foreground">
              Other systems digitise paper processes. Remi reimagines them.
            </p>
          </AnimateIn>

          <AnimateIn delay={100}>
            <div className="mx-auto mt-14 max-w-4xl">
              <div className="grid gap-6 sm:grid-cols-2">
                {[
                  {
                    old: 'Post paper entry forms and wait weeks for confirmation',
                    new: 'Enter online and get instant confirmation with payment receipt',
                  },
                  {
                    old: 'Phone the secretary to change a class or withdraw',
                    new: 'Amend or withdraw entries yourself, any time before close',
                  },
                  {
                    old: 'Manually number the catalogue in a spreadsheet',
                    new: 'Auto-assign catalogue numbers in RKC breed group order',
                  },
                  {
                    old: 'Spend days laying out the catalogue in Word or InDesign',
                    new: 'Generate four print-ready A5 catalogue PDFs in seconds',
                  },
                  {
                    old: 'Reconcile cheques against entry forms by hand',
                    new: 'Payments matched to entries automatically via Stripe',
                  },
                  {
                    old: 'Wait for results to be posted online days later',
                    new: 'Follow live results on your phone as each class is judged',
                  },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="rounded-xl border bg-background p-5 sm:p-6"
                  >
                    <p className="text-sm leading-relaxed text-muted-foreground line-through decoration-muted-foreground/40">
                      {item.old}
                    </p>
                    <p className="mt-3 flex items-start gap-2 text-sm font-medium leading-relaxed">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" />
                      {item.new}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────── */}
      <section className="bg-gradient-to-b from-primary/[0.04] to-transparent">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <AnimateIn className="mx-auto max-w-2xl text-center">
            <h2 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
              Ready to modernise your show?
            </h2>
            <p className="mt-5 text-lg text-muted-foreground">
              Whether you&apos;re an exhibitor looking for your next entry or a
              secretary ready to take your club online, Remi is here for you.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90"
              >
                Get Started Free
                <ArrowRight className="size-4" />
              </Link>
              <p className="text-sm text-muted-foreground">
                Are you a show secretary?{' '}
                <Link href="/apply" className="font-medium text-primary underline hover:no-underline">
                  Apply to run shows
                </Link>
              </p>
            </div>
            <p className="mt-8 text-sm text-muted-foreground">
              Questions?{' '}
              <a
                href="mailto:hello@remishowmanager.co.uk"
                className="text-primary hover:underline"
              >
                hello@remishowmanager.co.uk
              </a>
            </p>
          </AnimateIn>
        </div>
      </section>
    </div>
  );
}
