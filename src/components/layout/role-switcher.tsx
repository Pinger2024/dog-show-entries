'use client';

import Link from 'next/link';
import { Trophy, ClipboardList, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RoleSwitcherProps {
  /** Which view is currently active */
  activeView: 'exhibitor' | 'secretary' | 'steward';
  /** Whether to show the steward option */
  showSteward?: boolean;
}

const views = [
  { id: 'exhibitor' as const, href: '/dashboard', icon: Trophy, label: 'Exhibitor', subtitle: 'Enter shows' },
  { id: 'secretary' as const, href: '/secretary', icon: ClipboardList, label: 'Secretary', subtitle: 'Run shows' },
  { id: 'steward' as const, href: '/steward', icon: Radio, label: 'Steward', subtitle: 'Show day' },
];

export function RoleSwitcher({ activeView, showSteward }: RoleSwitcherProps) {
  const visibleViews = showSteward ? views : views.filter((v) => v.id !== 'steward');

  return (
    <div className="rounded-xl border bg-muted/40 p-1">
      <div className={cn('grid gap-1', visibleViews.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
        {visibleViews.map((view) => (
          <Link
            key={view.id}
            href={view.href}
            className={cn(
              'group relative flex flex-col items-center gap-1 rounded-lg px-3 py-2.5 text-center transition-all',
              activeView === view.id
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'hover:bg-muted'
            )}
          >
            <view.icon className={cn(
              'size-4 transition-transform group-hover:scale-110',
              activeView === view.id ? 'text-primary-foreground' : 'text-muted-foreground'
            )} />
            <span className="text-xs font-semibold leading-none">{view.label}</span>
            <span className={cn(
              'text-[10px] leading-none',
              activeView === view.id ? 'text-primary-foreground/70' : 'text-muted-foreground'
            )}>
              {view.subtitle}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Compact version for mobile headers — cycles to the next available view */
export function RoleSwitcherCompact({ activeView, showSteward }: RoleSwitcherProps) {
  // Show a link to the next logical context
  const targets = showSteward
    ? views.filter((v) => v.id !== activeView)
    : views.filter((v) => v.id !== activeView && v.id !== 'steward');

  if (targets.length === 0) return null;

  // Show the first non-active target (secretary if on exhibitor, exhibitor if on secretary)
  const target = targets[0];

  return (
    <Link
      href={target.href}
      className="flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary shadow-sm transition-colors hover:bg-primary/10"
    >
      <target.icon className="size-3.5" />
      {target.label}
    </Link>
  );
}
