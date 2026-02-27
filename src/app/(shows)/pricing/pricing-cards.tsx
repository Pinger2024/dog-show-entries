'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Check,
  ArrowRight,
  Crown,
  Wrench,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

type ClubType = 'single' | 'multi';

const pricing = {
  single: {
    diy: { annual: 99, perShow: 15, perEntry: 1.5 },
    managed: { annual: 150, perShow: 20, perEntry: 1.5 },
  },
  multi: {
    diy: { annual: 149, perShow: 15, perEntry: 1.5 },
    managed: { annual: 199, perShow: 50, perEntry: 1.5 },
  },
} as const;

const diyFeatures = [
  'Unlimited show creation',
  'Online entry management',
  'Automatic catalogue generation',
  'Stripe payment processing',
  'Entry reports & analytics',
  'Email notifications to exhibitors',
];

const managedFeatures = [
  'Everything in DIY, plus:',
  'We set up your show & classes',
  'Schedule & catalogue layout',
  'Exhibitor query handling',
  'Priority support',
  'Pre-publication review',
];

export function PricingCards() {
  const [clubType, setClubType] = useState<ClubType>('single');

  const plans = pricing[clubType];

  return (
    <div>
      {/* Club type toggle */}
      <div className="mx-auto flex w-fit items-center rounded-xl border bg-card p-1.5 shadow-sm">
        <button
          onClick={() => setClubType('single')}
          className={cn(
            'rounded-lg px-5 py-2.5 text-[0.9375rem] font-medium transition-all',
            clubType === 'single'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Single Breed Club
        </button>
        <button
          onClick={() => setClubType('multi')}
          className={cn(
            'rounded-lg px-5 py-2.5 text-[0.9375rem] font-medium transition-all',
            clubType === 'multi'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Multi Breed Club
        </button>
      </div>

      {/* Pricing cards */}
      <div className="mx-auto mt-12 grid max-w-4xl gap-8 lg:grid-cols-2">
        {/* DIY Card */}
        <Card className="relative flex flex-col transition-all hover:shadow-lg hover:shadow-primary/5">
          <CardHeader>
            <div className="mb-2 flex size-12 items-center justify-center rounded-xl bg-primary/10">
              <Wrench className="size-6 text-primary" strokeWidth={1.5} />
            </div>
            <CardTitle className="font-serif text-2xl font-bold">
              DIY
            </CardTitle>
            <CardDescription className="text-[0.9375rem] leading-relaxed">
              Full control of your shows with all the tools you need to manage
              entries yourself.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="mb-6">
              <div className="flex items-baseline gap-1">
                <span className="font-serif text-4xl font-bold tracking-tight">
                  &pound;{plans.diy.annual}
                </span>
                <span className="text-muted-foreground">/year</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.9375rem] text-muted-foreground">
                <span>
                  + &pound;{plans.diy.perShow}/show
                </span>
                <span>
                  + &pound;{plans.diy.perEntry.toFixed(2)}/entry
                </span>
              </div>
            </div>
            <div className="border-t pt-6">
              <p className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                What&apos;s included
              </p>
              <ul className="space-y-3">
                {diyFeatures.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="text-[0.9375rem] leading-relaxed">
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              variant="outline"
              size="lg"
              className="h-12 w-full text-[0.9375rem] font-semibold"
              asChild
            >
              <Link href="/register">
                Get Started
                <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
          </CardFooter>
        </Card>

        {/* Managed Card */}
        <Card className="relative flex flex-col border-primary/30 shadow-lg shadow-primary/10 transition-all hover:shadow-xl hover:shadow-primary/15">
          {/* Recommended badge */}
          <div className="absolute -top-3 right-6">
            <Badge className="border-gold/30 bg-gold/15 px-3 py-1 text-gold">
              <Crown className="mr-1 size-3" />
              Recommended
            </Badge>
          </div>
          <CardHeader>
            <div className="mb-2 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Sparkles className="size-6" strokeWidth={1.5} />
            </div>
            <CardTitle className="font-serif text-2xl font-bold">
              Managed
            </CardTitle>
            <CardDescription className="text-[0.9375rem] leading-relaxed">
              Let us handle the admin. We&apos;ll set up your shows, manage
              queries, and make sure everything runs smoothly.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="mb-6">
              <div className="flex items-baseline gap-1">
                <span className="font-serif text-4xl font-bold tracking-tight">
                  &pound;{plans.managed.annual}
                </span>
                <span className="text-muted-foreground">/year</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.9375rem] text-muted-foreground">
                <span>
                  + &pound;{plans.managed.perShow}/show
                </span>
                <span>
                  + &pound;{plans.managed.perEntry.toFixed(2)}/entry
                </span>
              </div>
            </div>
            <div className="border-t pt-6">
              <p className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                What&apos;s included
              </p>
              <ul className="space-y-3">
                {managedFeatures.map((feature, i) => (
                  <li key={feature} className="flex items-start gap-3">
                    {i === 0 ? (
                      <Sparkles className="mt-0.5 size-4 shrink-0 text-gold" />
                    ) : (
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    )}
                    <span
                      className={cn(
                        'text-[0.9375rem] leading-relaxed',
                        i === 0 && 'font-semibold text-gold'
                      )}
                    >
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              size="lg"
              className="h-12 w-full text-[0.9375rem] font-semibold shadow-lg shadow-primary/15 transition-all hover:shadow-xl hover:shadow-primary/20"
              asChild
            >
              <Link href="/register">
                Get Started
                <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>

      {/* Entry fee note */}
      <p className="mx-auto mt-8 max-w-2xl text-center text-[0.9375rem] leading-relaxed text-muted-foreground">
        Entry fees are collected from exhibitors at the point of entry and passed
        directly to your club via Stripe, minus the per-entry platform fee.
        No hidden costs.
      </p>
    </div>
  );
}
