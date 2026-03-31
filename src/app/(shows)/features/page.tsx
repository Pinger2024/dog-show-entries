import Link from 'next/link';
import type { Metadata } from 'next';
import {
  Smartphone,
  CreditCard,
  Radio,
  BookOpen,
  LayoutDashboard,
  Trophy,
  ShieldCheck,
  Users,
  PawPrint,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  FileEdit,
  ClipboardList,
  CalendarDays,
  Printer,
  FileText,
  BarChart3,
  ListChecks,
  Gavel,
  Map,
  Award,
  Dog,
  Clock,
  Mail,
  Lock,
  CreditCard as CardIcon,
  Building2,
  type LucideIcon,
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

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  colour: string;
}

const EXHIBITOR_FEATURES: Feature[] = [
  {
    icon: Smartphone,
    title: 'Online Entries from Any Device',
    description:
      'Browse upcoming RKC-licensed shows and enter from your phone, tablet, or desktop. No more printing paper entry forms, writing cheques, or waiting for postal confirmation.',
    colour: 'bg-blue-50 text-blue-600',
  },
  {
    icon: Dog,
    title: 'Dog Profiles with Full Pedigree Details',
    description:
      'Store your dogs\' RKC registration numbers, titles, parentage, breeder details, and ownership information once. Every future entry is pre-filled automatically.',
    colour: 'bg-amber-50 text-amber-600',
  },
  {
    icon: Sparkles,
    title: 'Smart Class Recommendations',
    description:
      'Remi knows which classes your dog qualifies for based on age, sex, previous wins, and RKC eligibility rules. No more guessing whether you belong in Limit or Open.',
    colour: 'bg-purple-50 text-purple-600',
  },
  {
    icon: Users,
    title: 'Multi-Dog Entries in One Checkout',
    description:
      'Entering several dogs? Select classes for each one and pay in a single transaction. One payment, one confirmation email, one receipt for your records.',
    colour: 'bg-teal-50 text-teal-600',
  },
  {
    icon: FileEdit,
    title: 'Entry Amendments Before Close',
    description:
      'Change your classes, update handler details, or withdraw an entry right up until entries close. No phone calls to the secretary, no chasing corrections.',
    colour: 'bg-rose-50 text-rose-600',
  },
  {
    icon: Mail,
    title: 'Instant Email Confirmations',
    description:
      'Receive a detailed confirmation email the moment your payment clears. Includes every class entered, fees paid, and your entry reference number.',
    colour: 'bg-green-50 text-green-600',
  },
  {
    icon: Radio,
    title: 'Live Show Day Results',
    description:
      'Follow results on your phone as classes are judged. Placements, Best of Breed, Challenge Certificates, Reserve CCs, and Best in Show — updated within seconds.',
    colour: 'bg-cyan-50 text-cyan-600',
  },
  {
    icon: Trophy,
    title: 'Title Progress Tracking',
    description:
      'Track your dogs\' championship progress across shows. See CCs won, reserve placings, and how close you are to making up your champion — all in one place.',
    colour: 'bg-orange-50 text-orange-600',
  },
];

const SECRETARY_FEATURES: Feature[] = [
  {
    icon: CalendarDays,
    title: 'Show Creation Wizard',
    description:
      'Set up your entire show in minutes with the guided wizard. Choose your show type, set dates, configure classes with eligibility rules, and publish — ready to accept entries immediately.',
    colour: 'bg-blue-50 text-blue-600',
  },
  {
    icon: ClipboardList,
    title: 'Class Management',
    description:
      'Create standard RKC classes or define custom ones. Set entry fees per class, configure eligibility criteria, and organise classes by sex with correct Dog-then-Bitch ordering.',
    colour: 'bg-indigo-50 text-indigo-600',
  },
  {
    icon: LayoutDashboard,
    title: 'Entry Dashboard',
    description:
      'View every entry in real time as they arrive. Filter by breed, class, or payment status. See at a glance how many entries you have, total income collected, and entries still pending.',
    colour: 'bg-emerald-50 text-emerald-600',
  },
  {
    icon: BookOpen,
    title: 'Automatic Catalogue Generation',
    description:
      'Generate professional print-ready A5 catalogues at the click of a button. Four formats available: standard by-breed, by-class, alphabetical, and absentee. Catalogue numbers assigned in canonical RKC breed group order.',
    colour: 'bg-amber-50 text-amber-600',
  },
  {
    icon: Gavel,
    title: 'Judge\'s Books',
    description:
      'Auto-generated judge\'s books with every class laid out for marking. Includes catalogue numbers, dog names, and space for placings and critiques — ready to hand to each judge on the day.',
    colour: 'bg-violet-50 text-violet-600',
  },
  {
    icon: Award,
    title: 'Prize Cards',
    description:
      'Generate prize cards for all placed dogs. Professionally formatted with show name, class, placing, dog details, and judge name. Print the batch and they\'re ready for the table.',
    colour: 'bg-rose-50 text-rose-600',
  },
  {
    icon: Map,
    title: 'Ring Plans',
    description:
      'Create and share ring plans so exhibitors know exactly which breed is in which ring, and at what time. Reduces confusion on show day and keeps the schedule running smoothly.',
    colour: 'bg-teal-50 text-teal-600',
  },
  {
    icon: BarChart3,
    title: 'Financial Reports',
    description:
      'Track every penny with detailed financial reporting. Income by class, payment reconciliation, VAT summary, refund tracking, and exportable reports for your club treasurer.',
    colour: 'bg-green-50 text-green-600',
  },
  {
    icon: ListChecks,
    title: 'Show Day Checklist',
    description:
      'A comprehensive pre-show checklist that tracks every task from catalogue printing to ring setup. Never arrive on show morning wondering if something was forgotten.',
    colour: 'bg-sky-50 text-sky-600',
  },
  {
    icon: FileText,
    title: 'Judge Contracts and Expenses',
    description:
      'Manage judge appointments with contract tracking, travel expense calculations, and payment records. Keep everything documented and auditable in one place.',
    colour: 'bg-purple-50 text-purple-600',
  },
  {
    icon: Printer,
    title: 'Show Schedule PDF',
    description:
      'Automatically generates a polished show schedule PDF with entry form, class definitions, fees, and all the information exhibitors need.',
    colour: 'bg-orange-50 text-orange-600',
  },
];

const CLUB_FEATURES: Feature[] = [
  {
    icon: CreditCard,
    title: 'Stripe Payment Processing',
    description:
      'Accept entry fees securely through Stripe. Payments are reconciled automatically against entries — no manual matching, no lost cheques, no bank runs.',
    colour: 'bg-blue-50 text-blue-600',
  },
  {
    icon: Building2,
    title: 'Subscription Management',
    description:
      'Simple, transparent pricing for your club. Manage your subscription, view billing history, and upgrade or pause as your show calendar changes.',
    colour: 'bg-indigo-50 text-indigo-600',
  },
  {
    icon: Lock,
    title: 'Secure Data and GDPR Compliance',
    description:
      'All exhibitor data is encrypted and stored securely. Built with GDPR compliance from day one — proper consent management, data retention policies, and the right to be forgotten.',
    colour: 'bg-green-50 text-green-600',
  },
  {
    icon: ShieldCheck,
    title: 'Role-Based Access Control',
    description:
      'Control who can do what. Secretaries manage shows and entries, stewards handle ringside duties, and exhibitors see only their own data. Every action is logged.',
    colour: 'bg-amber-50 text-amber-600',
  },
  {
    icon: Clock,
    title: '24/7 Entry Acceptance',
    description:
      'Your show accepts entries around the clock. Exhibitors can enter at midnight on a Sunday — no office hours, no answerphone, no waiting until Monday.',
    colour: 'bg-cyan-50 text-cyan-600',
  },
];

function FeatureCard({ feature, index }: { feature: Feature; index: number }) {
  return (
    <AnimateIn delay={index * 60}>
      <div className="group relative h-full rounded-2xl border bg-card p-6 transition-all hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5">
        <div className={`mb-4 inline-flex rounded-xl p-3 ${feature.colour}`}>
          <feature.icon className="size-6" />
        </div>
        <h3 className="font-serif text-lg font-bold">{feature.title}</h3>
        <p className="mt-2 leading-relaxed text-muted-foreground">
          {feature.description}
        </p>
      </div>
    </AnimateIn>
  );
}

function FeatureSection({
  badge,
  badgeColour,
  badgeIcon: BadgeIcon,
  title,
  subtitle,
  features,
  backgroundClass,
}: {
  badge: string;
  badgeColour: string;
  badgeIcon: LucideIcon;
  title: string;
  subtitle: string;
  features: Feature[];
  backgroundClass?: string;
}) {
  return (
    <section className={`border-b ${backgroundClass ?? ''}`}>
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <AnimateIn className="mx-auto max-w-2xl text-center">
          <div
            className={`mb-5 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium ${badgeColour}`}
          >
            <BadgeIcon className="size-4" />
            {badge}
          </div>
          <h2 className="gold-rule-center font-serif text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            {title}
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">{subtitle}</p>
        </AnimateIn>

        <div className="mx-auto mt-14 grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => (
            <FeatureCard key={feature.title} feature={feature} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

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
      <FeatureTabs tabs={[
        {
          id: 'exhibitors',
          label: 'Exhibitors',
          icon: PawPrint,
          badgeColour: 'bg-blue-50 text-blue-700',
          title: 'Enter shows in minutes, not days',
          subtitle: 'Everything you need to find a show, enter your dogs, and follow results — from your phone or desktop.',
          features: EXHIBITOR_FEATURES,
        },
        {
          id: 'secretaries',
          label: 'Secretaries',
          icon: LayoutDashboard,
          badgeColour: 'bg-amber-50 text-amber-700',
          title: 'Run your show from one dashboard',
          subtitle: 'Create shows, manage entries, generate every document you need for show day, and track finances.',
          features: SECRETARY_FEATURES,
        },
        {
          id: 'clubs',
          label: 'Clubs',
          icon: Building2,
          badgeColour: 'bg-green-50 text-green-700',
          title: 'Secure, compliant, and always on',
          subtitle: 'Your club\'s data is protected, payments are handled professionally, and entries are accepted 24/7.',
          features: CLUB_FEATURES,
        },
      ]} />

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
