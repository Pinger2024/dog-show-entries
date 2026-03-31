'use client';

import { useState } from 'react';
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
  Dog,
  Clock,
  Mail,
  Lock,
  Building2,
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
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimateIn } from '@/components/animate-in';

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  colour: string;
}

interface Tab {
  id: string;
  label: string;
  icon: LucideIcon;
  badgeColour: string;
  title: string;
  subtitle: string;
  features: Feature[];
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

const TABS: Tab[] = [
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
];

export function FeatureTabs() {
  const [activeTab, setActiveTab] = useState(TABS[0]?.id ?? '');
  const active = TABS.find((t) => t.id === activeTab) ?? TABS[0];

  return (
    <section className="border-b">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-20 lg:px-8">
        {/* Tab bar — horizontal scroll on mobile */}
        <div className="-mx-4 mb-10 flex gap-1 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:justify-center sm:gap-2 sm:px-0">
          {TABS.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-all min-h-[2.75rem]',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <tab.icon className="size-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Active tab content */}
        {active && (
          <div key={active.id}>
            <div className="mx-auto max-w-2xl text-center mb-10">
              <h2 className="gold-rule-center font-serif text-2xl font-bold tracking-tight sm:text-3xl">
                {active.title}
              </h2>
              <p className="mt-4 text-base text-muted-foreground sm:text-lg">
                {active.subtitle}
              </p>
            </div>

            <div className="mx-auto grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-6">
              {active.features.map((feature, i) => (
                <AnimateIn key={feature.title} delay={i * 40}>
                  <div className="group relative h-full rounded-2xl border bg-card p-5 transition-all hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5 sm:p-6">
                    <div className={`mb-3 inline-flex rounded-xl p-2.5 ${feature.colour}`}>
                      <feature.icon className="size-5" />
                    </div>
                    <h3 className="font-serif text-base font-bold sm:text-lg">{feature.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>
                </AnimateIn>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
