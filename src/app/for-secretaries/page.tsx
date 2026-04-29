import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Phone,
  FileText,
  Moon,
  Pencil,
  Sparkles,
  Calendar,
  BookOpen,
  Printer,
  PoundSterling,
  CheckCircle2,
  ArrowRight,
  Clock,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { AnimateIn } from '@/components/animate-in';

export const metadata: Metadata = {
  title: 'Run Your Show with Remi — For Show Secretaries',
  description:
    'A modern, mobile-first alternative to the established show entry systems. Online entries, auto-generated catalogues, integrated payments — and your club keeps 100% of entry fees.',
  openGraph: {
    title: 'Run Your Show with Remi — For Show Secretaries',
    description:
      'No more typing entries. No more chasing print proofs. No more midnight catalogues. Designed with working show secretaries.',
    images: [
      {
        url: '/promo/poster.png',
        width: 1080,
        height: 1920,
        alt: 'Remi — modern show management',
      },
    ],
    type: 'website',
  },
};

const DEMO_MAILTO =
  'mailto:michael@prometheus-it.com,hundarkgsd@gmail.com' +
  '?subject=' +
  encodeURIComponent('Remi demo request') +
  '&body=' +
  encodeURIComponent(
    [
      'Hi Michael & Amanda,',
      '',
      'I’d like to see Remi in action.',
      '',
      'Club: ',
      'My role: ',
      'Our next show: ',
      'Phone (so you can call me back): ',
      '',
      'Thanks,',
    ].join('\n'),
  );

const noMore = [
  { icon: Phone, label: 'No more phone calls to add a dog' },
  { icon: FileText, label: 'No more chasing print proofs' },
  { icon: Moon, label: 'No more midnight catalogues' },
  { icon: Pencil, label: 'No more typing entries by hand' },
];

const sevenMinSteps = [
  'Pick your show type and dates',
  'Add classes — auto-filled from the RKC breed list',
  'Set fees and payment options',
  'Open entries — exhibitors can pay online instantly',
];

const automationCards = [
  {
    icon: Calendar,
    title: 'Schedule',
    body: 'Generated as you build the show. Download a finished PDF or share a live link — exhibitors always see the latest version.',
  },
  {
    icon: BookOpen,
    title: 'Catalogue',
    body: 'Numbered, formatted, and ready to print at any point. Four formats including judges’ books and ringside lists.',
  },
  {
    icon: Printer,
    title: 'Printing',
    body: 'Order prize cards, ring numbers, and catalogues from the dashboard. Quotes pulled live from our print partner.',
  },
];

const includedItems = [
  'Online entry system',
  'Live entry list',
  'Auto-generated schedule',
  'Auto-generated catalogue (4 formats)',
  'Online results portal',
  'Self-serve entry amendments',
  'Card payments — exhibitor pays the processing',
  'Refund handling',
];

const priceRows = [
  {
    item: 'Card processing',
    others: 'Club pays 1.95% + 10p per entry',
    remi: 'Exhibitor pays — your club keeps 100%',
  },
  {
    item: 'A5 prize cards',
    others: 'from 24p each',
    remi: '23p each',
  },
  {
    item: 'Printed catalogues',
    others: 'from £2.16 / copy',
    remi: 'from £1.57 / copy',
  },
  {
    item: 'Online results portal',
    others: '£30 – £50 per show',
    remi: 'Included',
  },
  {
    item: 'Add a dog after closing',
    others: 'Phone call to support',
    remi: 'Self-serve in the app',
  },
];

export default function ForSecretariesPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute -top-40 right-0 h-[600px] w-[600px] rounded-full bg-primary/[0.05] blur-3xl" />
            <div className="absolute -bottom-40 left-0 h-[500px] w-[500px] rounded-full bg-gold/[0.07] blur-3xl" />
          </div>

          <div className="mx-auto max-w-7xl px-3 py-14 sm:px-4 sm:py-20 lg:px-6 lg:py-28">
            <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
              <div>
                <Badge
                  variant="secondary"
                  className="mb-5 border-gold/30 bg-gold/10 text-gold"
                >
                  For Show Secretaries
                </Badge>
                <h1 className="font-serif text-3xl font-bold leading-[1.1] tracking-tight sm:text-4xl lg:text-5xl">
                  Run a show without{' '}
                  <span className="text-primary">losing a Saturday.</span>
                </h1>
                <p className="gold-rule mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                  A modern, mobile-first show platform for UK clubs. Online
                  entries, automatic catalogues, integrated payments — and your
                  club keeps 100% of every entry fee.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Button
                    size="lg"
                    className="h-12 px-7 text-base shadow-lg shadow-primary/15 sm:h-13"
                    asChild
                  >
                    <a href={DEMO_MAILTO}>
                      Book a 15-min demo
                      <ArrowRight className="ml-1 size-4" />
                    </a>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-12 px-7 text-base sm:h-13"
                    asChild
                  >
                    <Link href="#how">See how it works</Link>
                  </Button>
                </div>
                <p className="mt-4 text-sm text-muted-foreground">
                  Or get going on your own —{' '}
                  <Link
                    href="/register"
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    create a free account
                  </Link>
                  .
                </p>
              </div>

              <AnimateIn className="relative">
                <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-3xl border bg-card shadow-2xl shadow-primary/10">
                  <div className="flex items-center gap-3 bg-primary px-5 py-4 text-primary-foreground">
                    <div className="size-2 animate-pulse rounded-full bg-gold" />
                    <p className="font-serif text-sm font-bold tracking-wide">
                      North-West Open Show
                    </p>
                    <span className="ml-auto rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
                      Live
                    </span>
                  </div>
                  <div className="space-y-5 p-6">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        Today’s entries
                      </p>
                      <p className="mt-1 font-serif text-5xl font-bold tracking-tight">
                        147
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        132 paid · 8 NFC · 7 JH
                      </p>
                    </div>
                    <hr />
                    <ul className="space-y-3 text-sm">
                      {[
                        ['Schedule', 'Generated'],
                        ['Catalogue', 'Ready'],
                        ['Payments', 'Open'],
                        ['Results portal', 'Live'],
                      ].map(([label, value]) => (
                        <li key={label} className="flex items-center justify-between">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="inline-flex items-center gap-1.5 font-semibold">
                            <CheckCircle2 className="size-3.5 text-primary" />
                            {value}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="pointer-events-none absolute -bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full border bg-background/95 px-4 py-2 text-xs font-medium shadow-md backdrop-blur">
                  Run your show from the phone in your pocket
                </div>
              </AnimateIn>
            </div>
          </div>
        </section>

        {/* No-more strip */}
        <section className="border-y bg-card">
          <div className="mx-auto max-w-7xl px-3 py-12 sm:px-4 sm:py-16 lg:px-6">
            <AnimateIn className="mx-auto max-w-2xl text-center">
              <h2 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">
                Stop doing the things you hate.
              </h2>
              <p className="mt-3 text-sm text-muted-foreground sm:text-base">
                Every secretary we’ve spoken to has the same list. So we built
                Remi to take it off them.
              </p>
            </AnimateIn>
            <div className="mx-auto mt-10 grid max-w-5xl gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {noMore.map((item, i) => (
                <AnimateIn key={item.label} delay={i * 80}>
                  <div className="flex h-full flex-col gap-3 rounded-xl border bg-background p-5">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <item.icon className="size-5" strokeWidth={1.5} />
                    </div>
                    <p className="font-serif text-base font-bold leading-tight sm:text-lg">
                      {item.label}
                    </p>
                  </div>
                </AnimateIn>
              ))}
            </div>
          </div>
        </section>

        {/* 7-minute show creation */}
        <section id="how">
          <div className="mx-auto max-w-7xl px-3 py-16 sm:px-4 sm:py-24 lg:px-6">
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
              <AnimateIn>
                <Badge
                  variant="secondary"
                  className="mb-4 border-primary/20 bg-primary/5 text-primary"
                >
                  <Clock className="mr-1 size-3.5" />
                  Seven minutes, start to finish
                </Badge>
                <h2 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
                  Create your show in the time it takes to make a cup of tea.
                </h2>
                <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
                  No spreadsheets. No emails to printers. No data input fee. You
                  fill in the basics, Remi handles the rest.
                </p>
                <ul className="mt-6 space-y-3">
                  {sevenMinSteps.map((step, i) => (
                    <li key={step} className="flex items-start gap-3">
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        {i + 1}
                      </span>
                      <span className="text-base text-foreground sm:text-[1.0625rem]">
                        {step}
                      </span>
                    </li>
                  ))}
                </ul>
              </AnimateIn>

              <AnimateIn delay={120}>
                <div className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/5 via-card to-gold/5 p-6 shadow-xl shadow-primary/5 sm:p-10">
                  <div className="flex items-center gap-3">
                    <Sparkles className="size-5 text-gold" />
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Live timer
                    </p>
                  </div>
                  <p className="mt-4 font-serif text-6xl font-bold tabular-nums tracking-tight sm:text-7xl">
                    7:00
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    average show set-up time
                  </p>
                  <div className="mt-8 space-y-3 border-t pt-6">
                    <Row label="Schedule" value="Generated" />
                    <Row label="Catalogue" value="Generated" />
                    <Row label="Entries page" value="Live" />
                    <Row label="Payments" value="Open" />
                  </div>
                </div>
              </AnimateIn>
            </div>
          </div>
        </section>

        {/* Automation triple */}
        <section className="border-t bg-card">
          <div className="mx-auto max-w-7xl px-3 py-16 sm:px-4 sm:py-24 lg:px-6">
            <AnimateIn className="mx-auto max-w-2xl text-center">
              <h2 className="gold-rule-center font-serif text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
                Schedule. Catalogue. Print. Automatic.
              </h2>
              <p className="mt-4 text-sm text-muted-foreground sm:text-base">
                The three jobs that eat your evenings — done by Remi, the
                second they’re needed.
              </p>
            </AnimateIn>
            <div className="mx-auto mt-12 grid max-w-5xl gap-5 grid-cols-1 sm:gap-6 md:grid-cols-3">
              {automationCards.map((card, i) => (
                <AnimateIn key={card.title} delay={i * 100}>
                  <div className="group h-full rounded-2xl border bg-background p-6 transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 sm:p-8">
                    <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <card.icon className="size-6" strokeWidth={1.5} />
                    </div>
                    <h3 className="font-serif text-lg font-bold sm:text-xl">
                      {card.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                      {card.body}
                    </p>
                  </div>
                </AnimateIn>
              ))}
            </div>
          </div>
        </section>

        {/* Exhibitor benefits — happy exhibitors = more entries */}
        <section className="border-t">
          <div className="mx-auto max-w-7xl px-3 py-16 sm:px-4 sm:py-24 lg:px-6">
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
              <AnimateIn>
                <Badge
                  variant="secondary"
                  className="mb-4 border-primary/20 bg-primary/5 text-primary"
                >
                  For your exhibitors
                </Badge>
                <h2 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
                  Their entries are easier too.
                </h2>
                <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
                  Frustrated exhibitors enter fewer shows. Remi was built
                  mobile-first for someone entering a dog from the school
                  gate, not someone sitting at a desktop computer.
                </p>
                <ul className="mt-6 space-y-3">
                  {[
                    'Sign up and add a dog in minutes — no paperwork',
                    'Enter all their dogs in one checkout, one payment',
                    'Amend or withdraw without phoning anyone',
                    'Class eligibility is checked automatically — no maths',
                    'Confirmations, ring numbers, and passes on their phone',
                  ].map((benefit) => (
                    <li key={benefit} className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
                      <span className="text-base sm:text-[1.0625rem]">
                        {benefit}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-6 text-sm italic text-muted-foreground">
                  Happier exhibitors enter more shows. That’s more entries,
                  more revenue, and fewer support calls for you.
                </p>
              </AnimateIn>

              <AnimateIn delay={120}>
                <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-3xl border bg-card shadow-xl shadow-primary/10">
                  <div className="border-b bg-primary/5 px-5 py-4">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Your entry
                    </p>
                    <p className="mt-1 font-serif text-base font-bold">
                      Mira at Clyde Valley GSD Open Show
                    </p>
                  </div>
                  <div className="space-y-4 p-5">
                    <Row label="Sign-up" value="2 min" />
                    <Row label="Add dog" value="1 min" />
                    <Row label="Pick classes" value="30 sec" />
                    <Row label="Pay" value="20 sec" />
                    <hr />
                    <div className="rounded-lg bg-primary/5 p-3 text-center">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Confirmed
                      </p>
                      <p className="mt-1 font-serif text-2xl font-bold text-primary">
                        Under 5 minutes
                      </p>
                    </div>
                  </div>
                </div>
              </AnimateIn>
            </div>
          </div>
        </section>

        {/* Pricing — what's included + side-by-side */}
        <section>
          <div className="mx-auto max-w-7xl px-3 py-16 sm:px-4 sm:py-24 lg:px-6">
            <AnimateIn className="mx-auto max-w-2xl text-center">
              <Badge
                variant="secondary"
                className="mb-4 border-gold/30 bg-gold/10 text-gold"
              >
                <PoundSterling className="mr-1 size-3.5" />
                One package. No surprise extras.
              </Badge>
              <h2 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
                Everything’s included.
              </h2>
              <p className="mt-4 text-sm text-muted-foreground sm:text-base">
                With Remi there’s no setup fee, no online portal fee, no
                per-entry data charge. The platform’s included — you only pay
                for physical print materials at trade prices.
              </p>
            </AnimateIn>

            {/* What's included */}
            <div className="mx-auto mt-10 max-w-4xl rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
              <p className="mb-5 font-serif text-lg font-bold sm:text-xl">
                Included with your Remi show
              </p>
              <ul className="grid gap-3 sm:grid-cols-2">
                {includedItems.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm sm:text-[0.9375rem]">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Side-by-side */}
            <AnimateIn className="mx-auto mt-12 max-w-4xl">
              <p className="mb-5 text-center font-serif text-lg font-bold sm:text-xl">
                What other systems charge for separately
              </p>
              <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-2 border-b bg-muted/40 px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground sm:px-6 sm:text-sm">
                  <div>Item</div>
                  <div className="text-center">Other systems</div>
                  <div className="text-center font-semibold text-primary">Remi</div>
                </div>
                {priceRows.map((row, i) => (
                  <div
                    key={row.item}
                    className={`grid grid-cols-[1.4fr_1fr_1fr] items-center gap-2 px-4 py-4 text-sm sm:px-6 sm:text-[0.9375rem] ${
                      i < priceRows.length - 1 ? 'border-b' : ''
                    }`}
                  >
                    <div className="font-medium">{row.item}</div>
                    <div className="text-center text-muted-foreground line-through decoration-muted-foreground/40 decoration-1">
                      {row.others}
                    </div>
                    <div className="text-center font-semibold text-primary">
                      {row.remi}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-center text-xs text-muted-foreground">
                Comparison figures sourced from established UK show systems’
                published 2026 price lists. Remi figures from current print
                partner quotes and our standard fee model.
              </p>
            </AnimateIn>
          </div>
        </section>

        {/* Social proof */}
        <section className="border-t bg-card">
          <div className="mx-auto max-w-7xl px-3 py-16 sm:px-4 sm:py-24 lg:px-6">
            <AnimateIn className="mx-auto max-w-3xl text-center">
              <Users className="mx-auto mb-4 size-8 text-gold" strokeWidth={1.5} />
              <h2 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">
                Designed with working secretaries.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
                Every screen was shaped with show secretaries actually running
                shows — not designers guessing what running a show is like.
                Single-breed club secretaries have tested Remi end-to-end, and
                the consistent feedback has been about how simple it is to use,
                even if you’re not confident with computers.
              </p>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
                If you’d like to speak to a secretary already using Remi, ask
                on your demo call — we’ll happily put you in touch.
              </p>
            </AnimateIn>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t">
          <div className="mx-auto max-w-7xl px-3 py-16 sm:px-4 sm:py-24 lg:px-6">
            <AnimateIn>
              <div className="relative overflow-hidden rounded-3xl bg-primary px-4 py-14 text-center shadow-xl shadow-primary/15 sm:px-16 sm:py-20">
                <div className="pointer-events-none absolute inset-0">
                  <div className="absolute -right-20 -top-20 size-72 rounded-full bg-white/10 blur-3xl" />
                  <div className="absolute -bottom-20 -left-20 size-72 rounded-full bg-gold/15 blur-3xl" />
                </div>
                <div className="relative z-10">
                  <h2 className="font-serif text-2xl font-bold tracking-tight text-primary-foreground sm:text-3xl lg:text-4xl">
                    Run your next show with Remi.
                  </h2>
                  <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-primary-foreground/85 sm:text-lg">
                    A 15-minute demo and we’ll set up your first show on the
                    call. No commitment, no pressure.
                  </p>
                  <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
                    <Button
                      size="lg"
                      variant="secondary"
                      className="h-12 w-full px-7 text-base font-semibold sm:h-13 sm:w-auto"
                      asChild
                    >
                      <a href={DEMO_MAILTO}>
                        Book a 15-min demo
                        <ArrowRight className="ml-1 size-4" />
                      </a>
                    </Button>
                    <Button
                      size="lg"
                      variant="ghost"
                      className="h-12 w-full px-7 text-base text-primary-foreground hover:bg-white/10 hover:text-primary-foreground sm:h-13 sm:w-auto"
                      asChild
                    >
                      <Link href="/register">Or sign up free</Link>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="inline-flex items-center gap-1.5 font-semibold">
        <CheckCircle2 className="size-3.5 text-primary" />
        {value}
      </span>
    </div>
  );
}
