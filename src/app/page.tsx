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
  Lock,
  Star,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';

const steps = [
  {
    icon: Search,
    title: 'Find a Show',
    description:
      'Browse championship, open, and companion shows by breed, location, or date. All KC-licensed.',
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
    description: 'Automatic catalogue numbering and PDF generation.',
  },
  {
    icon: Shield,
    title: 'Financial Reports',
    description: 'Track revenue, payments, and refunds at a glance.',
  },
];

const testimonials = [
  {
    quote:
      'Finally, a show entry system that actually understands how dog shows work. I entered three dogs for an open show in under five minutes.',
    name: 'Margaret H.',
    detail: 'Showing Border Collies for 28 years',
  },
  {
    quote:
      'As a show secretary, Remi has saved me hours of manual data entry. The catalogue generation alone is worth its weight in gold.',
    name: 'David P.',
    detail: 'Secretary, Midlands Canine Society',
  },
  {
    quote:
      'I was nervous about entering online but Remi made it so straightforward. The confirmation email came through right away.',
    name: 'Sarah T.',
    detail: 'Junior Handler, age 16',
  },
];

const stats = [
  { label: 'Show Types Supported', value: '6', icon: CalendarDays },
  { label: 'KC Recognised Breeds', value: '220+', icon: Dog },
  { label: 'Secure Payments', value: 'Stripe', icon: Lock },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          {/* Warm background decoration */}
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute -top-40 right-0 h-[600px] w-[600px] rounded-full bg-primary/[0.04] blur-3xl" />
            <div className="absolute -bottom-40 left-0 h-[500px] w-[500px] rounded-full bg-gold/[0.06] blur-3xl" />
          </div>

          <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40">
            <div className="mx-auto max-w-3xl text-center">
              <div className="mb-8 inline-flex animate-fade-in items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-5 py-2 text-[0.9375rem] font-medium text-primary">
                <CheckCircle2 className="size-4" />
                KC-Licensed Shows — Now Open for Entry
              </div>
              <h1 className="animate-fade-in-up font-serif text-[2.5rem] font-bold leading-[1.15] tracking-tight sm:text-5xl lg:text-[3.5rem]">
                Enter Dog Shows{' '}
                <span className="text-primary">
                  with Confidence
                </span>
              </h1>
              <p className="gold-rule-center mx-auto mt-6 max-w-2xl animate-fade-in-up text-lg leading-relaxed text-muted-foreground [animation-delay:100ms] sm:text-xl">
                Find upcoming KC-licensed shows, enter all your dogs in one
                place, and manage your entries from home or ringside. Trusted by
                exhibitors and show secretaries across the country.
              </p>
              <div className="mt-10 flex animate-fade-in-up flex-col items-center justify-center gap-4 [animation-delay:200ms] sm:flex-row">
                <Button
                  size="lg"
                  className="h-13 px-8 text-base shadow-lg shadow-primary/15 transition-all hover:shadow-xl hover:shadow-primary/20"
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
                  className="h-13 px-8 text-base"
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
          <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
            <div className="grid grid-cols-3 gap-8">
              {stats.map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-primary/10">
                    <stat.icon className="size-5 text-primary" />
                  </div>
                  <p className="text-2xl font-bold tracking-tight sm:text-3xl">
                    {stat.value}
                  </p>
                  <p className="mt-1 text-sm font-medium text-muted-foreground sm:text-[0.9375rem]">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section>
          <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="gold-rule-center font-serif text-3xl font-bold tracking-tight sm:text-4xl">
                Three Steps to Your Next Entry
              </h2>
              <p className="mt-5 text-lg text-muted-foreground">
                From finding a show to confirmed entry — simple, quick, and
                secure.
              </p>
            </div>
            <div className="mx-auto mt-20 grid max-w-5xl gap-10 sm:grid-cols-3">
              {steps.map((step, i) => (
                <div key={step.title} className="relative text-center">
                  {i < steps.length - 1 && (
                    <div className="absolute left-1/2 top-10 hidden h-px w-full bg-border sm:block" />
                  )}
                  <div className="relative mx-auto mb-6 flex size-20 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                    <span className="absolute -right-1.5 -top-1.5 flex size-7 items-center justify-center rounded-full bg-gold text-xs font-bold text-gold-foreground shadow">
                      {i + 1}
                    </span>
                    <step.icon className="size-8" strokeWidth={1.5} />
                  </div>
                  <h3 className="font-serif text-xl font-bold">{step.title}</h3>
                  <p className="mt-2 leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="border-t bg-card">
          <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="gold-rule-center font-serif text-3xl font-bold tracking-tight sm:text-4xl">
                Built for the Show Ring
              </h2>
              <p className="mt-5 text-lg text-muted-foreground">
                Every feature designed with exhibitors in mind — because we
                understand what matters at a dog show.
              </p>
            </div>
            <div className="mx-auto mt-16 grid max-w-5xl gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className="group rounded-xl border bg-background p-7 transition-all hover:border-primary/20 hover:shadow-md hover:shadow-primary/5"
                >
                  <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <feature.icon className="size-6" strokeWidth={1.5} />
                  </div>
                  <h3 className="font-serif text-lg font-bold">{feature.title}</h3>
                  <p className="mt-2 leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="border-t">
          <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="gold-rule-center font-serif text-3xl font-bold tracking-tight sm:text-4xl">
                Trusted by Exhibitors
              </h2>
              <p className="mt-5 text-lg text-muted-foreground">
                Hear from the people who use Remi every week.
              </p>
            </div>
            <div className="mx-auto mt-16 grid max-w-5xl gap-8 sm:grid-cols-3">
              {testimonials.map((t) => (
                <div
                  key={t.name}
                  className="relative rounded-xl border bg-card p-7"
                >
                  <div className="mb-4 flex gap-1">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className="size-4 fill-gold text-gold"
                      />
                    ))}
                  </div>
                  <blockquote className="leading-relaxed text-foreground/90">
                    &ldquo;{t.quote}&rdquo;
                  </blockquote>
                  <div className="mt-5 border-t pt-4">
                    <p className="font-semibold">{t.name}</p>
                    <p className="text-sm text-muted-foreground">{t.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Secretary callout */}
        <section className="border-t bg-card">
          <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl border bg-background p-8 sm:p-12">
              <div className="flex flex-col gap-10 sm:flex-row sm:items-start">
                <div className="flex-1">
                  <Badge
                    variant="secondary"
                    className="mb-4 border-gold/30 bg-gold/10 text-gold"
                  >
                    For Show Secretaries
                  </Badge>
                  <h3 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">
                    Run Your Show with Remi
                  </h3>
                  <p className="mt-4 leading-relaxed text-muted-foreground">
                    Manage entries, generate catalogues, track payments, and
                    communicate with exhibitors — all from one dashboard.
                    No more spreadsheets, no more chasing paper forms.
                  </p>
                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
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
                  <div className="mt-8 flex flex-wrap gap-3">
                    <Button className="h-12 px-6 text-[0.9375rem]" asChild>
                      <Link href="/login">
                        Get Started
                        <ArrowRight className="ml-1 size-4" />
                      </Link>
                    </Button>
                    <Button variant="outline" className="h-12 px-6 text-[0.9375rem]" asChild>
                      <Link href="/about">Learn More</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t">
          <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden rounded-2xl bg-primary px-6 py-20 text-center shadow-xl shadow-primary/15 sm:px-16">
              <div className="pointer-events-none absolute inset-0 -z-0">
                <div className="absolute -right-20 -top-20 size-72 rounded-full bg-white/10 blur-3xl" />
                <div className="absolute -bottom-20 -left-20 size-72 rounded-full bg-gold/15 blur-3xl" />
              </div>
              <div className="relative z-10">
                <h2 className="font-serif text-3xl font-bold tracking-tight text-primary-foreground sm:text-4xl">
                  Ready to Enter Your Next Show?
                </h2>
                <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-primary-foreground/80">
                  Join exhibitors and show secretaries who are already using Remi
                  to make dog show entries simple, secure, and reliable.
                </p>
                <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                  <Button
                    size="lg"
                    variant="secondary"
                    className="h-13 px-8 text-base font-semibold"
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
                    className="h-13 px-8 text-base text-primary-foreground hover:bg-white/10 hover:text-primary-foreground"
                    asChild
                  >
                    <Link href="/shows">Find a Show</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
