import Link from 'next/link';
import {
  Search,
  PenTool,
  Trophy,
  Users,
  FileEdit,
  ClipboardList,
  ArrowRight,
  CheckCircle2,
  Dog,
  CalendarDays,
  Shield,
  Zap,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { AnimateIn } from '@/components/animate-in';

const steps = [
  {
    icon: Search,
    title: 'Find a Show',
    description:
      'Browse championship, open, and companion shows by breed, location, or date. All RKC-licensed.',
  },
  {
    icon: PenTool,
    title: 'Enter Online',
    description:
      'Select your classes and pay securely. Enter one dog or all of them in a single checkout.',
  },
  {
    icon: Trophy,
    title: 'Show Day',
    description:
      'Your entry confirmation is ready. Manage your entries, amend classes, or withdraw — all in one place.',
  },
];

const features = [
  {
    icon: Sparkles,
    title: 'Smart Class Eligibility',
    description:
      'We show you exactly which classes your dog qualifies for — no guesswork, no mistakes.',
  },
  {
    icon: Users,
    title: 'Multi-Dog Entries',
    description:
      'Enter all your dogs in one checkout. One payment, one confirmation for the whole team.',
  },
  {
    icon: FileEdit,
    title: 'Amend Your Entries',
    description:
      'Change your classes or withdraw without a phone call, right up until entries close.',
  },
];

const secretaryFeatures = [
  {
    icon: ClipboardList,
    title: 'Manage Entries',
    description: 'All entries in one place with real-time status updates.',
  },
  {
    icon: CalendarDays,
    title: 'Generate Catalogues',
    description: 'Automatic catalogue numbering and four PDF formats.',
  },
  {
    icon: Shield,
    title: 'Financial Reports',
    description: 'Track revenue, payments, and refunds at a glance.',
  },
];

async function getStats() {
  try {
    const { db } = await import('@/server/db');
    const { sql } = await import('drizzle-orm');
    if (!db) return { shows: 0, breeds: 0, entries: 0 };
    const [showCount] = await db.execute(sql`SELECT count(*) as cnt FROM shows WHERE status NOT IN ('draft', 'cancelled')`);
    const [breedCount] = await db.execute(sql`SELECT count(*) as cnt FROM breeds`);
    const [entryCount] = await db.execute(sql`SELECT count(*) as cnt FROM entries WHERE status = 'confirmed'`);
    return {
      shows: Number((showCount as Record<string, unknown>).cnt) || 0,
      breeds: Number((breedCount as Record<string, unknown>).cnt) || 0,
      entries: Number((entryCount as Record<string, unknown>).cnt) || 0,
    };
  } catch {
    return { shows: 0, breeds: 0, entries: 0 };
  }
}

const BASE_URL = 'https://remishowmanager.co.uk';

// JSON-LD content is fully static and built from string literals — no user input.
const homepageJsonLd = JSON.stringify([
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Remi Show Manager',
    alternateName: 'Remi',
    url: BASE_URL,
    logo: `${BASE_URL}/icon-512.png`,
    description:
      'Online entry management for UK Royal Kennel Club (RKC) dog shows. Enter shows, manage dogs, and run shows from one platform.',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Remi Show Manager',
    url: BASE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${BASE_URL}/shows?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  },
]);

export default async function HomePage() {
  const liveStats = await getStats();
  return (
    <div className="flex min-h-screen flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: homepageJsonLd }}
      />
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          {/* Warm background decoration */}
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute -top-40 right-0 h-[600px] w-[600px] rounded-full bg-primary/[0.04] blur-3xl" />
            <div className="absolute -bottom-40 left-0 h-[500px] w-[500px] rounded-full bg-gold/[0.06] blur-3xl" />
          </div>

          <div className="mx-auto max-w-7xl px-3 py-16 sm:px-4 sm:py-24 lg:px-6 lg:py-40">
            <div className="mx-auto max-w-3xl text-center">
              <div className="mb-6 sm:mb-8 inline-flex animate-fade-in items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 sm:px-5 py-2 text-xs sm:text-[0.9375rem] font-medium text-primary">
                <CheckCircle2 className="size-3.5 sm:size-4" />
                RKC-Licensed Shows — Now Open for Entry
              </div>
              <h1 className="animate-fade-in-up font-serif text-3xl font-bold leading-[1.15] tracking-tight sm:text-4xl lg:text-5xl">
                Enter Dog Shows{' '}
                <span className="text-primary">
                  with Confidence
                </span>
              </h1>
              <p className="gold-rule-center mx-auto mt-4 sm:mt-6 max-w-2xl animate-fade-in-up text-sm sm:text-lg leading-relaxed text-muted-foreground [animation-delay:100ms] lg:text-xl">
                Find upcoming RKC-licensed shows, enter all your dogs in one
                place, and manage your entries from home or ringside. Built
                mobile-first with UK show secretaries.
              </p>
              <div className="mt-8 sm:mt-10 flex animate-fade-in-up flex-col items-center justify-center gap-3 sm:gap-4 [animation-delay:200ms] sm:flex-row">
                <Button
                  size="lg"
                  className="h-11 sm:h-13 px-6 sm:px-8 text-sm sm:text-base shadow-lg shadow-primary/15 transition-all hover:shadow-xl hover:shadow-primary/20 w-full sm:w-auto"
                  asChild
                >
                  <Link href="/shows">
                    Find a Show
                    <ArrowRight className="ml-1 size-4" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-11 sm:h-13 px-6 sm:px-8 text-sm sm:text-base w-full sm:w-auto"
                  asChild
                >
                  <Link href="/register">Create Your Free Account</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Trust bar */}
        <section className="border-y bg-card">
          <div className="mx-auto max-w-5xl px-3 py-8 sm:px-4 sm:py-10 lg:px-6">
            <div className="grid grid-cols-3 gap-4 sm:gap-8">
              {[
                { label: 'Shows Listed', value: liveStats.shows > 0 ? String(liveStats.shows) : '—', icon: CalendarDays },
                { label: 'RKC Breeds', value: liveStats.breeds > 0 ? `${liveStats.breeds}+` : '—', icon: Dog },
                { label: 'Entries Processed', value: liveStats.entries > 0 ? liveStats.entries.toLocaleString() : '—', icon: Zap },
              ].map((stat, i) => (
                <AnimateIn key={stat.label} delay={i * 80} className="text-center">
                  <div className="mx-auto mb-2 sm:mb-3 flex size-8 sm:size-10 items-center justify-center rounded-full bg-primary/10">
                    <stat.icon className="size-4 sm:size-5 text-primary" />
                  </div>
                  <p className="text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">
                    {stat.value}
                  </p>
                  <p className="mt-1 text-xs font-medium text-muted-foreground sm:text-sm lg:text-[0.9375rem]">
                    {stat.label}
                  </p>
                </AnimateIn>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section>
          <div className="mx-auto max-w-7xl px-3 py-16 sm:px-4 sm:py-24 lg:px-6">
            <AnimateIn className="mx-auto max-w-2xl text-center">
              <h2 className="gold-rule-center font-serif text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
                Three Steps to Your Next Entry
              </h2>
              <p className="mt-3 sm:mt-5 text-sm sm:text-lg text-muted-foreground">
                From finding a show to confirmed entry — simple, quick, and
                secure.
              </p>
            </AnimateIn>
            <div className="mx-auto mt-10 sm:mt-20 grid max-w-5xl gap-8 sm:gap-10 sm:grid-cols-3">
              {steps.map((step, i) => (
                <AnimateIn key={step.title} delay={i * 120} className="relative text-center">
                  {i < steps.length - 1 && (
                    <div className="absolute left-1/2 top-10 hidden h-px w-full bg-border sm:block" />
                  )}
                  <div className="relative mx-auto mb-4 sm:mb-6 flex size-16 sm:size-20 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                    <span className="absolute -right-1.5 -top-1.5 flex size-6 sm:size-7 items-center justify-center rounded-full bg-gold text-xs font-bold text-gold-foreground shadow">
                      {i + 1}
                    </span>
                    <step.icon className="size-6 sm:size-8" strokeWidth={1.5} />
                  </div>
                  <h3 className="font-serif text-lg sm:text-xl font-bold">{step.title}</h3>
                  <p className="mt-2 text-sm sm:text-base leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </AnimateIn>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="border-t bg-card">
          <div className="mx-auto max-w-7xl px-3 py-16 sm:px-4 sm:py-24 lg:px-6">
            <AnimateIn className="mx-auto max-w-2xl text-center">
              <h2 className="gold-rule-center font-serif text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
                Built for the Show Ring
              </h2>
              <p className="mt-3 sm:mt-5 text-sm sm:text-lg text-muted-foreground">
                Every feature designed with exhibitors in mind — because we
                understand what matters at a dog show.
              </p>
            </AnimateIn>
            <div className="mx-auto mt-10 sm:mt-16 grid max-w-5xl gap-4 sm:gap-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature, i) => (
                <AnimateIn key={feature.title} delay={i * 80}>
                  <div className="group rounded-xl border bg-background p-4 sm:p-7 transition-all hover:border-primary/20 hover:shadow-md hover:shadow-primary/5">
                    <div className="mb-3 sm:mb-5 flex size-10 sm:size-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <feature.icon className="size-5 sm:size-6" strokeWidth={1.5} />
                    </div>
                    <h3 className="font-serif text-base sm:text-lg font-bold">{feature.title}</h3>
                    <p className="mt-2 text-sm sm:text-base leading-relaxed text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>
                </AnimateIn>
              ))}
            </div>
          </div>
        </section>

        {/* Secretary callout */}
        <section className="border-t bg-card">
          <div className="mx-auto max-w-7xl px-3 py-16 sm:px-4 sm:py-24 lg:px-6">
            <AnimateIn>
              <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl border bg-background p-4 sm:p-8 lg:p-12">
                <div className="flex flex-col gap-6 sm:gap-10 sm:flex-row sm:items-start">
                  <div className="flex-1">
                    <Badge
                      variant="secondary"
                      className="mb-3 sm:mb-4 border-gold/30 bg-gold/10 text-gold"
                    >
                      For Show Secretaries
                    </Badge>
                    <h3 className="font-serif text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">
                      Run Your Show with Remi
                    </h3>
                    <p className="mt-3 sm:mt-4 text-sm sm:text-base leading-relaxed text-muted-foreground">
                      Manage entries, generate catalogues, track payments, and
                      communicate with exhibitors — all from one dashboard.
                      No more spreadsheets, no more chasing paper forms.
                    </p>
                    <div className="mt-4 sm:mt-6 grid gap-3 grid-cols-1 sm:grid-cols-3">
                      {secretaryFeatures.map((f) => (
                        <div key={f.title} className="flex items-start gap-2">
                          <f.icon className="mt-0.5 size-4 shrink-0 text-primary" />
                          <div>
                            <p className="text-sm font-semibold">{f.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {f.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-6 sm:mt-8 flex flex-wrap gap-3">
                      <Button className="h-11 sm:h-12 px-5 sm:px-6 text-sm sm:text-[0.9375rem]" asChild>
                        <Link href="/pricing">
                          View Pricing
                          <ArrowRight className="ml-1 size-4" />
                        </Link>
                      </Button>
                      <Button variant="outline" className="h-11 sm:h-12 px-5 sm:px-6 text-sm sm:text-[0.9375rem]" asChild>
                        <Link href="/register">Get Started Free</Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </AnimateIn>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t">
          <div className="mx-auto max-w-7xl px-3 py-16 sm:px-4 sm:py-24 lg:px-6">
            <AnimateIn>
              <div className="relative overflow-hidden rounded-2xl bg-primary px-4 py-14 text-center shadow-xl shadow-primary/15 sm:px-16 sm:py-20">
                <div className="pointer-events-none absolute inset-0 -z-0">
                  <div className="absolute -right-20 -top-20 size-72 rounded-full bg-white/10 blur-3xl" />
                  <div className="absolute -bottom-20 -left-20 size-72 rounded-full bg-gold/15 blur-3xl" />
                </div>
                <div className="relative z-10">
                  <h2 className="font-serif text-2xl font-bold tracking-tight text-primary-foreground sm:text-3xl lg:text-4xl">
                    Ready to Enter Your Next Show?
                  </h2>
                  <p className="mx-auto mt-3 sm:mt-5 max-w-xl text-sm sm:text-lg leading-relaxed text-primary-foreground/80">
                    Join exhibitors and show secretaries who are already using Remi
                    to make dog show entries simple, secure, and reliable.
                  </p>
                  <div className="mt-8 sm:mt-10 flex flex-col items-center justify-center gap-3 sm:gap-4 sm:flex-row">
                    <Button
                      size="lg"
                      variant="secondary"
                      className="h-11 sm:h-13 px-6 sm:px-8 text-sm sm:text-base font-semibold w-full sm:w-auto"
                      asChild
                    >
                      <Link href="/register">
                        Create Your Free Account
                        <ArrowRight className="ml-1 size-4" />
                      </Link>
                    </Button>
                    <Button
                      size="lg"
                      variant="ghost"
                      className="h-11 sm:h-13 px-6 sm:px-8 text-sm sm:text-base text-primary-foreground hover:bg-white/10 hover:text-primary-foreground w-full sm:w-auto"
                      asChild
                    >
                      <Link href="/shows">Find a Show</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </AnimateIn>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
