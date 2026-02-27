import Link from 'next/link';
import {
  Search,
  PenTool,
  Trophy,
  Sparkles,
  Users,
  FileEdit,
  Radio,
  BarChart3,
  ClipboardList,
  ArrowRight,
  CheckCircle2,
  Dog,
  CalendarDays,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';

const steps = [
  {
    icon: Search,
    title: 'Find a Show',
    description: 'Browse upcoming shows by breed, location, or date.',
  },
  {
    icon: PenTool,
    title: 'Enter Online',
    description:
      'Select your classes, pay securely, done in under 2 minutes.',
  },
  {
    icon: Trophy,
    title: 'Show Day',
    description:
      'Get your passes, check live results, track your career.',
  },
];

const features = [
  {
    icon: Sparkles,
    title: 'Smart Class Eligibility',
    description:
      'Know exactly which classes your dog can enter — no guesswork, no mistakes.',
  },
  {
    icon: Users,
    title: 'Multi-Dog Entries',
    description:
      'Enter all your dogs in one checkout. One payment, one confirmation.',
  },
  {
    icon: FileEdit,
    title: 'Self-Service Amendments',
    description:
      'Change your entries without a phone call. Swap classes, withdraw, or update handler details instantly.',
  },
  {
    icon: Radio,
    title: 'Live Results',
    description:
      'See placings as they happen at the show. Never miss a moment.',
  },
  {
    icon: BarChart3,
    title: 'Career Tracking',
    description:
      'CC progress, qualification status, and a complete show record for every dog.',
  },
  {
    icon: ClipboardList,
    title: 'Show Secretary Tools',
    description:
      'Set up shows, manage entries, and view financial dashboards — all in one place.',
  },
];

const stats = [
  { label: 'Show Types', value: '6', icon: CalendarDays },
  { label: 'KC Breeds', value: '220+', icon: Dog },
  { label: 'Secure Payments', value: 'Stripe', icon: Shield },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          {/* Background decoration */}
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute -top-40 right-0 h-[500px] w-[500px] rounded-full bg-primary/5 blur-3xl" />
            <div className="absolute -bottom-40 left-0 h-[400px] w-[400px] rounded-full bg-primary/5 blur-3xl" />
          </div>

          <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40">
            <div className="mx-auto max-w-3xl text-center">
              <div className="mb-6 inline-flex animate-fade-in items-center gap-2 rounded-full border bg-background px-4 py-1.5 text-sm font-medium text-muted-foreground shadow-sm">
                <CheckCircle2 className="size-4 text-primary" />
                Now accepting entries
              </div>
              <h1 className="animate-fade-in-up text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
                Enter Dog Shows.{' '}
                <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                  The Modern Way.
                </span>
              </h1>
              <p className="mx-auto mt-6 max-w-2xl animate-fade-in-up text-lg leading-relaxed text-muted-foreground [animation-delay:100ms] sm:text-xl">
                One platform for finding shows, entering your dogs, and tracking
                your results. No phone calls. No paper forms. Just beautiful,
                simple entries.
              </p>
              <div className="mt-10 flex animate-fade-in-up flex-col items-center justify-center gap-4 [animation-delay:200ms] sm:flex-row">
                <Button size="lg" className="h-12 px-8 text-base shadow-lg shadow-primary/20 transition-shadow hover:shadow-xl hover:shadow-primary/30" asChild>
                  <Link href="/shows">
                    Browse Shows
                    <ArrowRight className="ml-1 size-4" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 px-8 text-base"
                  asChild
                >
                  <Link href="/login">Sign In</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Stats bar */}
        <section className="border-y bg-muted/20">
          <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
            <div className="grid grid-cols-3 gap-8">
              {stats.map((stat) => (
                <div key={stat.label} className="text-center">
                  <stat.icon className="mx-auto mb-2 size-5 text-primary/70" />
                  <p className="text-2xl font-bold tracking-tight sm:text-3xl">
                    {stat.value}
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-muted-foreground sm:text-sm">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="bg-background">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                How It Works
              </h2>
              <p className="mt-3 text-lg text-muted-foreground">
                Three simple steps to your next show
              </p>
            </div>
            <div className="mx-auto mt-16 grid max-w-5xl gap-8 sm:grid-cols-3">
              {steps.map((step, i) => (
                <div key={step.title} className="relative text-center">
                  {i < steps.length - 1 && (
                    <div className="absolute left-1/2 top-8 hidden h-px w-full bg-border sm:block" />
                  )}
                  <div className="relative mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
                    <span className="absolute -right-1 -top-1 flex size-6 items-center justify-center rounded-full bg-background text-xs font-bold text-primary shadow ring-1 ring-border">
                      {i + 1}
                    </span>
                    <step.icon className="size-7" strokeWidth={1.5} />
                  </div>
                  <h3 className="text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="border-t bg-muted/30">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Everything You Need
              </h2>
              <p className="mt-3 text-lg text-muted-foreground">
                Built by exhibitors, for exhibitors
              </p>
            </div>
            <div className="mx-auto mt-16 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className="group rounded-xl border bg-card p-6 transition-all hover:border-primary/20 hover:shadow-md hover:shadow-primary/5"
                >
                  <div className="mb-4 flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <feature.icon className="size-5" strokeWidth={1.5} />
                  </div>
                  <h3 className="font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Secretary callout */}
        <section className="border-t">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl border bg-gradient-to-br from-card to-muted/30 p-8 sm:p-12">
              <div className="flex flex-col gap-8 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <Badge variant="secondary" className="mb-4 text-xs">
                    For Show Secretaries
                  </Badge>
                  <h3 className="text-2xl font-bold tracking-tight sm:text-3xl">
                    Run your show with Remi
                  </h3>
                  <p className="mt-3 text-muted-foreground leading-relaxed">
                    Set up your show, manage entries, assign rings and judges,
                    export catalogues, and track finances — all from one
                    dashboard. No more spreadsheets.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Button asChild>
                      <Link href="/login">
                        Get Started
                        <ArrowRight className="ml-1 size-4" />
                      </Link>
                    </Button>
                    <Button variant="outline" asChild>
                      <Link href="/about">Learn More</Link>
                    </Button>
                  </div>
                </div>
                <div className="hidden sm:block">
                  <div className="flex size-32 items-center justify-center rounded-2xl bg-primary/10">
                    <ClipboardList className="size-16 text-primary/60" strokeWidth={1} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden rounded-2xl bg-primary px-6 py-16 text-center shadow-xl shadow-primary/20 sm:px-16">
              <div className="pointer-events-none absolute inset-0 -z-0">
                <div className="absolute -right-20 -top-20 size-60 rounded-full bg-white/10 blur-2xl" />
                <div className="absolute -bottom-20 -left-20 size-60 rounded-full bg-white/10 blur-2xl" />
              </div>
              <div className="relative z-10">
                <h2 className="text-3xl font-bold tracking-tight text-primary-foreground sm:text-4xl">
                  Ready to modernise your dog show experience?
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-lg text-primary-foreground/80">
                  Join exhibitors and show secretaries who are already using Remi
                  to make dog shows simpler.
                </p>
                <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
                  <Button
                    size="lg"
                    variant="secondary"
                    className="h-12 px-8 text-base"
                    asChild
                  >
                    <Link href="/login">
                      Get Started Free
                      <ArrowRight className="ml-1 size-4" />
                    </Link>
                  </Button>
                  <Button
                    size="lg"
                    variant="ghost"
                    className="h-12 px-8 text-base text-primary-foreground hover:bg-white/10 hover:text-primary-foreground"
                    asChild
                  >
                    <Link href="/shows">Browse Shows</Link>
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
