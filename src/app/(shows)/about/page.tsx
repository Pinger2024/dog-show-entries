import Link from 'next/link';
import {
  Smartphone,
  CreditCard,
  Radio,
  BookOpen,
  LayoutDashboard,
  Trophy,
  Clock,
  ShieldCheck,
  Users,
  PawPrint,
  ArrowRight,
  CheckCircle2,
  Zap,
  Star,
} from 'lucide-react';
import { AnimateIn } from '@/components/animate-in';

export const metadata = {
  title: 'About Remi — Modern Dog Show Management',
  description:
    'The trusted platform for entering KC-licensed dog shows. Online entries, secure payments, live results, and automatic catalogues — built for exhibitors and show secretaries.',
};

const FEATURES = [
  {
    icon: Smartphone,
    title: 'Enter from Anywhere',
    description:
      'Browse upcoming shows, enter all your dogs, and manage entries from your phone, tablet, or desktop. No more posting paper forms and waiting weeks for confirmation.',
    colour: 'bg-blue-50 text-blue-600',
  },
  {
    icon: CreditCard,
    title: 'Secure Instant Payments',
    description:
      'Pay your entry fees securely through Stripe. You get an instant email confirmation, and your entry is locked in immediately — no cheques, no delays.',
    colour: 'bg-green-50 text-green-600',
  },
  {
    icon: Radio,
    title: 'Live Show Day Results',
    description:
      'Follow results in real time on your phone as classes are judged. Placements, Best of Breed, Challenge Certificates, and Best in Show — updated live.',
    colour: 'bg-purple-50 text-purple-600',
  },
  {
    icon: BookOpen,
    title: 'Automatic Catalogues',
    description:
      'Professional print-ready catalogues generated in seconds — standard, by-class, alphabetical, and absentee formats. Complete with KC registration numbers, pedigree details, and proper breed group ordering.',
    colour: 'bg-amber-50 text-amber-600',
  },
  {
    icon: LayoutDashboard,
    title: 'Secretary Dashboard',
    description:
      'Create shows, manage entries, assign catalogue numbers, generate financial reports, and handle day-of operations — all from one dashboard. Hours of work, done in minutes.',
    colour: 'bg-rose-50 text-rose-600',
  },
  {
    icon: Trophy,
    title: 'Championship Awards',
    description:
      'Full support for Championship shows — CCs, Reserve CCs, Best of Breed, Best Puppy, Best Veteran, and all the specialised awards your breed needs. All recorded and tracked.',
    colour: 'bg-cyan-50 text-cyan-600',
  },
];

const EXHIBITOR_BENEFITS = [
  'Enter multiple dogs across multiple classes in minutes',
  'Instant email confirmation with full entry details',
  'Edit entries and manage handlers before close of entries',
  'Track your entries and results across all shows',
  'No account setup required — sign in with Google or email',
];

const SECRETARY_BENEFITS = [
  'Publish shows with custom classes, fees, and eligibility rules',
  'Accept online entries with automatic payment reconciliation',
  'Assign catalogue numbers in canonical KC breed group order',
  'Generate four catalogue PDF formats at the click of a button',
  'Financial reports: income by class, VAT summary, refund tracking',
  'Manage stewards and ringside judging on show day',
];

const STATS = [
  { value: '4', label: 'Catalogue formats', icon: BookOpen },
  { value: '24/7', label: 'Entry submission', icon: Clock },
  { value: '10s', label: 'Result updates', icon: Zap },
  { value: '100%', label: 'Secure payments', icon: ShieldCheck },
];

export default function AboutPage() {
  return (
    <div>
      {/* ── Hero ────────────────────────────────── */}
      <section className="relative overflow-hidden border-b bg-gradient-to-b from-primary/[0.04] via-transparent to-transparent">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <AnimateIn>
              <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-primary/10">
                <PawPrint className="size-8 text-primary" />
              </div>
            </AnimateIn>
            <AnimateIn delay={100}>
              <h1 className="font-serif text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                The future of{' '}
                <span className="text-primary">dog show management</span>
              </h1>
            </AnimateIn>
            <AnimateIn delay={200}>
              <p className="gold-rule-center mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                Remi is the trusted platform for the UK Royal Kennel Club circuit.
                Online entries, secure payments, live results, and automatic
                catalogues — everything exhibitors and secretaries need, in
                one place.
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

      {/* ── Stats bar ───────────────────────────── */}
      <section className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4 sm:gap-8">
            {STATS.map((stat, i) => (
              <AnimateIn key={stat.label} delay={i * 80} className="text-center">
                <stat.icon className="mx-auto mb-2 size-5 text-primary/60" />
                <p className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">
                  {stat.value}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {stat.label}
                </p>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features grid ───────────────────────── */}
      <section className="border-b">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <AnimateIn className="mx-auto max-w-2xl text-center">
            <h2 className="gold-rule-center font-serif text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
              Everything you need, nothing you don&apos;t
            </h2>
            <p className="mt-5 text-lg text-muted-foreground">
              Built with input from exhibitors and secretaries to solve real
              problems in the dog show world.
            </p>
          </AnimateIn>

          <div className="mx-auto mt-14 grid max-w-5xl gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, i) => (
              <AnimateIn key={feature.title} delay={i * 80}>
                <div className="group relative rounded-2xl border bg-card p-6 transition-all hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5">
                  <div className={`mb-4 inline-flex rounded-xl p-3 ${feature.colour}`}>
                    <feature.icon className="size-6" />
                  </div>
                  <h3 className="font-serif text-lg font-bold">
                    {feature.title}
                  </h3>
                  <p className="mt-2 leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── For Exhibitors / For Secretaries ────── */}
      <section className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
            {/* Exhibitors */}
            <AnimateIn>
              <div className="rounded-2xl border bg-background p-8 sm:p-10">
                <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-1.5 text-sm font-medium text-blue-700">
                  <PawPrint className="size-4" />
                  For Exhibitors
                </div>
                <h3 className="font-serif text-xl font-bold sm:text-2xl">
                  Enter shows in minutes, not days
                </h3>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  No more printing entry forms, writing cheques, and waiting
                  for postal confirmation. Find a show, select your classes,
                  pay online, and you&apos;re confirmed instantly.
                </p>
                <ul className="mt-6 space-y-3">
                  {EXHIBITOR_BENEFITS.map((benefit) => (
                    <li key={benefit} className="flex items-start gap-3 text-sm">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </AnimateIn>

            {/* Secretaries */}
            <AnimateIn delay={120}>
              <div className="rounded-2xl border bg-background p-8 sm:p-10">
                <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-amber-50 px-4 py-1.5 text-sm font-medium text-amber-700">
                  <Users className="size-4" />
                  For Show Secretaries
                </div>
                <h3 className="font-serif text-xl font-bold sm:text-2xl">
                  Run your show from one dashboard
                </h3>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  Set up your show schedule, classes, and fees. Entries
                  come in online with payments already reconciled. Generate
                  catalogues and reports at the click of a button.
                </p>
                <ul className="mt-6 space-y-3">
                  {SECRETARY_BENEFITS.map((benefit) => (
                    <li key={benefit} className="flex items-start gap-3 text-sm">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </AnimateIn>
          </div>
        </div>
      </section>

      {/* ── Social proof ────────────────────────── */}
      <section className="border-b">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <AnimateIn className="mx-auto max-w-3xl text-center">
            <div className="mb-6 flex justify-center gap-1">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="size-5 fill-amber-400 text-amber-400" />
              ))}
            </div>
            <blockquote className="font-serif text-xl leading-relaxed sm:text-2xl">
              &ldquo;Remi has completely transformed how we manage our shows.
              What used to take weeks of admin now happens automatically.
              The exhibitors love it too — they can enter from their phones
              and get confirmation straight away.&rdquo;
            </blockquote>
            <div className="mt-6">
              <p className="font-semibold">Amanda Sheridan</p>
              <p className="text-sm text-muted-foreground">
                Show Secretary, Clyde Valley GSD Club
              </p>
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
              Whether you&apos;re an exhibitor looking for your next entry or
              a secretary ready to take your club online, Remi is here for you.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/shows"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90"
              >
                Find a show
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-full border px-8 py-3.5 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
              >
                Club pricing
              </Link>
            </div>
            <p className="mt-8 text-sm text-muted-foreground">
              Questions?{' '}
              <a
                href="mailto:hello@remishow.co.uk"
                className="text-primary hover:underline"
              >
                hello@remishow.co.uk
              </a>
            </p>
          </AnimateIn>
        </div>
      </section>
    </div>
  );
}
