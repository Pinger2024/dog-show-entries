import * as React from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

interface EmptyStateProps extends React.ComponentProps<'div'> {
  /** Lucide icon to display. */
  icon: LucideIcon;
  /** Main heading text. */
  title: string;
  /** Supporting description text. */
  description?: string;
  /** Render as dashed border (inline inside a card) or solid card (standalone). */
  variant?: 'dashed' | 'card' | 'centered';
  /** Optional CTA rendered below description. */
  action?: React.ReactNode;
}

/**
 * Unified empty state — consistent icon + heading + description pattern.
 *
 * Variants:
 * - `dashed` (default) — dashed border container, best inside existing Cards
 * - `card` — solid card wrapper, best as standalone page content
 * - `centered` — full-height centered block, best as the sole page content
 */
function EmptyState({
  icon: Icon,
  title,
  description,
  variant = 'dashed',
  action,
  className,
  ...props
}: EmptyStateProps) {
  const content = (
    <>
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-primary/10">
        <Icon className="size-7 text-primary" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && (
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </>
  );

  if (variant === 'centered') {
    return (
      <div
        className={cn(
          'flex min-h-[50vh] flex-col items-center justify-center text-center',
          className
        )}
        {...props}
      >
        {content}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-14 text-center',
        variant === 'dashed' && 'rounded-lg border border-dashed',
        variant === 'card' &&
          'rounded-xl border bg-card py-16 shadow-sm',
        className
      )}
      {...props}
    >
      {content}
    </div>
  );
}

export { EmptyState };
export type { EmptyStateProps };
