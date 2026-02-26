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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-background px-4 py-1.5 text-sm font-medium text-muted-foreground shadow-sm">
                <CheckCircle2 className="size-4 text-primary" />
                Now accepting entries
              </div>
              <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
                Enter Dog Shows.{' '}
                <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                  The Modern Way.
                </span>
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                One platform for finding shows, entering your dogs, and tracking
                your results. No phone calls. No paper forms. Just beautiful,
                simple entries.
              </p>
              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Button size="lg" className="h-12 px-8 text-base" asChild>
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
                  <Link href="/register">Create Account</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="border-y bg-muted/30">
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
        <section>
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
                    <Link href="/register">
                      Create Free Account
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
