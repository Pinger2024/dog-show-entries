'use client';

import Link from 'next/link';
import { Trophy, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RoleSwitcherProps {
  /** Which view is currently active */
  activeView: 'exhibitor' | 'secretary';
}

export function RoleSwitcher({ activeView }: RoleSwitcherProps) {
  return (
    <div className="rounded-xl border bg-muted/40 p-1">
      <div className="grid grid-cols-2 gap-1">
        <Link
          href="/dashboard"
          className={cn(
            'group relative flex flex-col items-center gap-1 rounded-lg px-3 py-2.5 text-center transition-all',
            activeView === 'exhibitor'
              ? 'bg-primary text-primary-foreground shadow-md'
              : 'hover:bg-muted'
          )}
        >
          <Trophy className={cn(
            'size-4 transition-transform group-hover:scale-110',
            activeView === 'exhibitor' ? 'text-primary-foreground' : 'text-muted-foreground'
          )} />
          <span className="text-xs font-semibold leading-none">Exhibitor</span>
          <span className={cn(
            'text-[10px] leading-none',
            activeView === 'exhibitor' ? 'text-primary-foreground/70' : 'text-muted-foreground'
          )}>
            Enter shows
          </span>
        </Link>
        <Link
          href="/secretary"
          className={cn(
            'group relative flex flex-col items-center gap-1 rounded-lg px-3 py-2.5 text-center transition-all',
            activeView === 'secretary'
              ? 'bg-primary text-primary-foreground shadow-md'
              : 'hover:bg-muted'
          )}
        >
          <ClipboardList className={cn(
            'size-4 transition-transform group-hover:scale-110',
            activeView === 'secretary' ? 'text-primary-foreground' : 'text-muted-foreground'
          )} />
          <span className="text-xs font-semibold leading-none">Secretary</span>
          <span className={cn(
            'text-[10px] leading-none',
            activeView === 'secretary' ? 'text-primary-foreground/70' : 'text-muted-foreground'
          )}>
            Run shows
          </span>
        </Link>
      </div>
    </div>
  );
}

/** Compact version for mobile headers */
export function RoleSwitcherCompact({ activeView }: RoleSwitcherProps) {
  const targetView = activeView === 'exhibitor' ? 'secretary' : 'exhibitor';
  const targetHref = targetView === 'secretary' ? '/secretary' : '/dashboard';
  const TargetIcon = targetView === 'secretary' ? ClipboardList : Trophy;
  const label = targetView === 'secretary' ? 'Secretary' : 'Exhibitor';

  return (
    <Link
      href={targetHref}
      className="flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary shadow-sm transition-colors hover:bg-primary/10"
    >
      <TargetIcon className="size-3.5" />
      {label}
    </Link>
  );
}
