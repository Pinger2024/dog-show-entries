import * as React from 'react';

import { cn } from '@/lib/utils';

/** Unified page header — consistent title, optional subtitle, optional actions. */
function PageHeader({
  className,
  children,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** Page title — always serif, consistent sizing across the app.
 *  Carries the Show Experience heading recipe (SE_H in
 *  show-experience/kit.tsx: font-extrabold + tight tracking) baked in —
 *  inlined here rather than imported to keep ui/ from depending on the
 *  'use client' show-experience/kit module. Call sites that previously
 *  passed `className={SE_H}` no longer need to; cn/twMerge dedupes any
 *  that still do. */
function PageTitle({
  className,
  ...props
}: React.ComponentProps<'h1'>) {
  return (
    <h1
      className={cn(
        'font-serif text-2xl font-extrabold tracking-[-0.015em] sm:text-3xl',
        className
      )}
      {...props}
    />
  );
}

/** Subtitle text below the page title. */
function PageDescription({
  className,
  ...props
}: React.ComponentProps<'p'>) {
  return (
    <p
      className={cn('mt-1.5 text-muted-foreground', className)}
      {...props}
    />
  );
}

/** Container for action buttons beside the title (right-aligned on desktop). */
function PageActions({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex shrink-0 items-center gap-2', className)}
      {...props}
    />
  );
}

export { PageHeader, PageTitle, PageDescription, PageActions };
