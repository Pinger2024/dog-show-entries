import * as React from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardDescription } from './card';

interface StatCardProps extends React.ComponentProps<typeof Card> {
  /** Short label (e.g. "Total Entries"). */
  label: string;
  /** The stat value to display prominently. */
  value: React.ReactNode;
  /** Optional Lucide icon. */
  icon?: LucideIcon;
  /** Background + foreground color pair for the icon badge. Defaults to primary. */
  iconColor?: {
    bg: string;
    fg: string;
  };
  /** Optional trend or subtext below the value. */
  subtext?: React.ReactNode;
}

/**
 * Unified stat card — consistent KPI display across dashboards.
 *
 * Renders as a Card with label + icon in header, large value in content,
 * and optional subtext. Mobile-first with responsive sizing.
 */
function StatCard({
  label,
  value,
  icon: Icon,
  iconColor,
  subtext,
  className,
  ...props
}: StatCardProps) {
  const bg = iconColor?.bg ?? 'bg-primary/10';
  const fg = iconColor?.fg ?? 'text-primary';

  return (
    <Card
      className={cn(
        'rounded-2xl border-border/60 shadow-[0_1px_0_rgba(255,255,255,0.5)_inset,0_12px_30px_-26px_rgba(20,60,40,0.4)]',
        'transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_1px_0_rgba(255,255,255,0.5)_inset,0_22px_40px_-26px_rgba(20,60,40,0.5)]',
        className
      )}
      {...props}
    >
      <CardHeader className="flex flex-row items-center justify-between p-3 pb-2 sm:p-4 sm:pb-2">
        <CardDescription className="text-xs font-medium sm:text-sm">
          {label}
        </CardDescription>
        {Icon && (
          <div
            className={cn(
              'flex size-8 items-center justify-center rounded-xl ring-1 ring-inset ring-black/[0.04] sm:size-9',
              bg
            )}
          >
            <Icon className={cn('size-4 sm:size-[1.125rem]', fg)} />
          </div>
        )}
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0 sm:px-4 sm:pb-4">
        <p className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">{value}</p>
        {subtext && (
          <div className="mt-1 text-xs text-muted-foreground">{subtext}</div>
        )}
      </CardContent>
    </Card>
  );
}

export { StatCard };
export type { StatCardProps };
