'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Check, Circle, X, User, Dog, Ticket } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const DISMISSED_KEY = 'remi-onboarding-checklist-dismissed';

export function OnboardingChecklist() {
  const { data: session } = useSession();
  const [dismissed, setDismissed] = useState(true); // Default hidden until loaded
  const isExhibitor = session?.user?.role === 'exhibitor';
  const { data: status, isLoading } = trpc.onboarding.getStatus.useQuery(
    undefined,
    { enabled: isExhibitor }
  );

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISSED_KEY) === 'true');
  }, []);

  // Only relevant for exhibitors — secretaries have a different workflow
  if (session?.user?.role !== 'exhibitor') return null;
  if (dismissed || isLoading || !status) return null;

  const items = [
    {
      label: 'Create your account',
      done: true,
      icon: Check,
      href: null,
    },
    {
      label: 'Complete your exhibitor profile',
      done: status.hasProfile,
      icon: User,
      href: '/onboarding',
    },
    {
      label: 'Add your first dog',
      done: status.hasDogs,
      icon: Dog,
      href: '/dogs/new',
    },
    {
      label: 'Enter your first show',
      done: status.hasEntries,
      icon: Ticket,
      href: '/shows',
    },
  ];

  const completedCount = items.filter((i) => i.done).length;
  const allDone = completedCount === items.length;

  // Auto-hide when all done
  if (allDone) return null;

  const progress = (completedCount / items.length) * 100;

  function handleDismiss() {
    setDismissed(true);
    localStorage.setItem(DISMISSED_KEY, 'true');
  }

  return (
    <Card className="border-primary/20 bg-primary/[0.02]">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="font-serif text-base sm:text-lg">
              Getting Started
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              {completedCount} of {items.length} steps complete
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={handleDismiss}
            aria-label="Dismiss checklist"
          >
            <X className="size-4" />
          </Button>
        </div>
        {/* Progress bar */}
        <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {items.map((item) => {
          const content = (
            <div
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                !item.done && item.href && 'hover:bg-accent/50 cursor-pointer',
                item.done && 'opacity-60'
              )}
            >
              {item.done ? (
                <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-3" />
                </div>
              ) : (
                <Circle className="size-5 shrink-0 text-muted-foreground/40" />
              )}
              <span
                className={cn(
                  'flex-1',
                  item.done && 'line-through'
                )}
              >
                {item.label}
              </span>
              {!item.done && item.href && (
                <item.icon className="size-4 shrink-0 text-muted-foreground" />
              )}
            </div>
          );

          if (!item.done && item.href) {
            return (
              <Link key={item.label} href={item.href}>
                {content}
              </Link>
            );
          }

          return <div key={item.label}>{content}</div>;
        })}
      </CardContent>
    </Card>
  );
}
