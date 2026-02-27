import Link from 'next/link';
import {
  ClipboardList,
  Settings,
  Globe,
  HelpCircle,
  ArrowRight,
  Mail,
  PoundSterling,
  CreditCard,
  CalendarDays,
  FileText,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PricingCards } from './pricing-cards';

export const metadata = {
  title: 'Pricing - Remi',
  description:
    'Simple, transparent pricing for dog show clubs. Choose DIY or let us manage everything. Single breed and multi breed club plans available.',
};

const steps = [
  {
    icon: ClipboardList,
    number: 1,
    title: 'Choose Your Plan',
    description:
      'Pick the plan that fits your club. DIY if you want full control, or Managed if you want us to handle the admin.',
  },
  {
    icon: Settings,
    number: 2,
    title: 'Set Up Your Show',
    description:
      'Create your show, add your classes, and upload your schedule. We handle the rest, from entries to payments.',
  },
  {
    icon: Globe,
    number: 3,
    title: 'Open for Entries',
    description:
      'Exhibitors enter online and pay securely. You get real-time entry reports and a finished catalogue.',
  },
];

const faqs = [
  {
    question: 'What counts as a "show"?',
    answer:
      'Each show is a single event — for example, an Open Show or a Championship Show. If you run a double-header weekend with two separate shows, that counts as two shows.',
  },
  {
    question: 'When do we get charged the per-entry fee?',
    answer:
      'The per-entry fee (£1.50) is deducted automatically from each entry payment before funds are transferred to your Stripe account. You never need to pay it separately.',
  },
  {
    question: 'Can we switch from DIY to Managed?',
    answer:
      'Absolutely. You can upgrade to the Managed plan at any time and we will pro-rate the difference. You can also downgrade at your next renewal.',
  },
  {
    question: 'Is there a contract or minimum term?',
    answer:
      'No. Plans renew annually but you can cancel at any time. If you cancel mid-year, you keep access until the end of your billing period.',
  },
  {
    question: 'What payment methods do exhibitors use?',
    answer:
      'Exhibitors pay by credit or debit card via Stripe at the point of entry. Payments are processed securely and funds are transferred directly to your club\'s bank account.',
  },
  {
    question: 'Do you support Championship shows?',
    answer:
      'Yes. Remi supports all KC-licensed show types including Companion, Primary, Limited, Open, Premier Open, and Championship shows.',
  },
  {
    question: 'What does "Exhibitor query handling" mean on the Managed plan?',
    answer:
      'We respond to exhibitor questions on your behalf — things like class eligibility queries, entry amendments, and payment issues. You stay in the loop but we handle the day-to-day.',
  },
  {
    question: 'Can multiple people manage our shows?',
    answer:
      'Yes. You can add other committee members as show secretaries so they can manage entries, view reports, and help run the show.',
  },
];

export default function PricingPage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-40 right-0 h-[600px] w-[600px] rounded-full bg-primary/[0.04] blur-3xl" />
          <div className="absolute -bottom-40 left-0 h-[500px] w-[500px] rounded-full bg-gold/[0.06] blur-3xl" />
        </div>

        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="animate-fade-in-up font-serif text-[2.5rem] font-bold leading-[1.15] tracking-tight sm:text-5xl">
              Simple, transparent pricing{' '}
              <span className="text-primary">for your club</span>
            </h1>
            <p className="gold-rule-center mx-auto mt-6 max-w-2xl animate-fade-in-up text-lg leading-relaxed text-muted-foreground [animation-delay:100ms] sm:text-xl">
              The first self-service dog show management platform in the UK.
              Choose DIY or let us handle everything.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing section */}
      <section className="border-t bg-card">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <PricingCards />
        </div>
      </section>

      {/* How it works */}
      <section className="border-t">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="gold-rule-center font-serif text-3xl font-bold tracking-tight sm:text-4xl">
              How It Works
            </h2>
            <p className="mt-5 text-lg text-muted-foreground">
              From sign-up to live entries in three straightforward steps.
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
                    {step.number}
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

      {/* What&apos;s included breakdown */}
      <section className="border-t bg-card">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="gold-rule-center font-serif text-3xl font-bold tracking-tight sm:text-4xl">
              Everything Your Club Needs
            </h2>
            <p className="mt-5 text-lg text-muted-foreground">
              Both plans include a complete set of tools purpose-built for
              running KC-licensed dog shows.
            </p>
          </div>
          <div className="mx-auto mt-16 grid max-w-5xl gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Globe,
                title: 'Online Entries',
                description:
                  'Exhibitors enter and pay online. No more paper forms, no more chasing cheques.',
              },
              {
                icon: CreditCard,
                title: 'Secure Payments',
                description:
                  'Stripe handles all payments. Funds go straight to your club account, minus the platform fee.',
              },
              {
                icon: FileText,
                title: 'Catalogue Generation',
                description:
                  'Automatic catalogue numbering and layout. Export a print-ready PDF with one click.',
              },
              {
                icon: CalendarDays,
                title: 'Show Management',
                description:
                  'Create shows, configure classes, set entry fees, and manage your schedule from one dashboard.',
              },
              {
                icon: Users,
                title: 'Exhibitor Communications',
                description:
                  'Automatic confirmation emails, entry receipts, and show-day reminders to every exhibitor.',
              },
              {
                icon: PoundSterling,
                title: 'Financial Reports',
                description:
                  'Track entries, revenue, and payments in real time. Export reports for your committee.',
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="group rounded-xl border bg-background p-7 transition-all hover:border-primary/20 hover:shadow-md hover:shadow-primary/5"
              >
                <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <feature.icon className="size-6" strokeWidth={1.5} />
                </div>
                <h3 className="font-serif text-lg font-bold">
                  {feature.title}
                </h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t">
        <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
          <div className="text-center">
            <h2 className="gold-rule-center font-serif text-3xl font-bold tracking-tight sm:text-4xl">
              Frequently Asked Questions
            </h2>
            <p className="mt-5 text-lg text-muted-foreground">
              Common questions about our pricing and plans.
            </p>
          </div>
          <div className="mt-14 space-y-6">
            {faqs.map((faq) => (
              <div
                key={faq.question}
                className="rounded-xl border bg-card p-6 transition-all hover:border-primary/20 hover:shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <HelpCircle className="size-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-serif text-lg font-bold leading-snug">
                      {faq.question}
                    </h3>
                    <p className="mt-2 leading-relaxed text-muted-foreground">
                      {faq.answer}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t bg-card">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-2xl bg-primary px-6 py-20 text-center shadow-xl shadow-primary/15 sm:px-16">
            <div className="pointer-events-none absolute inset-0 -z-0">
              <div className="absolute -right-20 -top-20 size-72 rounded-full bg-white/10 blur-3xl" />
              <div className="absolute -bottom-20 -left-20 size-72 rounded-full bg-gold/15 blur-3xl" />
            </div>
            <div className="relative z-10">
              <h2 className="font-serif text-3xl font-bold tracking-tight text-primary-foreground sm:text-4xl">
                Ready to Get Started?
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-primary-foreground/80">
                Join the clubs already using Remi to run their shows. Sign up
                today or get in touch to discuss which plan is right for your
                club.
              </p>
              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Button
                  size="lg"
                  variant="secondary"
                  className="h-13 px-8 text-base font-semibold"
                  asChild
                >
                  <Link href="/register">
                    Create Your Account
                    <ArrowRight className="ml-1 size-4" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  className="h-13 px-8 text-base text-primary-foreground hover:bg-white/10 hover:text-primary-foreground"
                  asChild
                >
                  <Link href="mailto:hello@remishow.co.uk">
                    <Mail className="mr-1 size-4" />
                    Contact Us
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
