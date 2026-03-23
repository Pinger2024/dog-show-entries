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
        'transition-all hover:shadow-md hover:shadow-primary/5',
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
              'flex size-8 items-center justify-center rounded-lg sm:size-9',
              bg
            )}
          >
            <Icon className={cn('size-4 sm:size-[1.125rem]', fg)} />
          </div>
        )}
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0 sm:px-4 sm:pb-4">
        <p className="text-2xl font-bold sm:text-3xl">{value}</p>
        {subtext && (
          <div className="mt-1 text-xs text-muted-foreground">{subtext}</div>
        )}
      </CardContent>
    </Card>
  );
}

export { StatCard };
export type { StatCardProps };
