'use client';

import Link from 'next/link';
import { Trophy, Megaphone } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RoleSwitcherProps {
  /** Which view is currently active */
  activeView: 'exhibitor' | 'secretary';
}

export function RoleSwitcher({ activeView }: RoleSwitcherProps) {
  return (
    <div className="flex gap-1 rounded-lg bg-muted/80 p-1">
      <Link
        href="/dashboard"
        className={cn(
          'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-all',
          activeView === 'exhibitor'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <Trophy className="size-3.5" />
        Exhibitor
      </Link>
      <Link
        href="/secretary"
        className={cn(
          'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-all',
          activeView === 'secretary'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <Megaphone className="size-3.5" />
        Secretary
      </Link>
    </div>
  );
}

/** Compact version for mobile headers */
export function RoleSwitcherCompact({ activeView }: RoleSwitcherProps) {
  const targetView = activeView === 'exhibitor' ? 'secretary' : 'exhibitor';
  const targetHref = targetView === 'secretary' ? '/secretary' : '/dashboard';
  const TargetIcon = targetView === 'secretary' ? Megaphone : Trophy;
  const label = targetView === 'secretary' ? 'Secretary' : 'Exhibitor';

  return (
    <Link
      href={targetHref}
      className="flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-sm transition-colors hover:text-foreground"
    >
      <TargetIcon className="size-3.5" />
      {label}
    </Link>
  );
}
