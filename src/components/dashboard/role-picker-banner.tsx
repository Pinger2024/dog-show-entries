'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ClipboardList, Radio, Trophy, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const SESSION_KEY = 'remi-role-picker-shown';

const roleViews = [
  {
    id: 'secretary',
    label: 'Secretary',
    subtitle: 'Manage your shows',
    href: '/secretary',
    icon: ClipboardList,
    colour: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
  },
  {
    id: 'steward',
    label: 'Steward',
    subtitle: 'Show day ringside',
    href: '/steward',
    icon: Radio,
    colour: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
  },
];

/**
 * Shows a "Quick switch" banner for users with multiple roles.
 * Only appears once per session — dismissed via sessionStorage.
 */
export function RolePickerBanner() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show for secretary/steward/admin roles (they can switch to other views)
    if (!role || role === 'exhibitor') return;
    if (sessionStorage.getItem(SESSION_KEY) === 'true') return;
    setVisible(true);
  }, [role]);

  if (!visible) return null;

  // Admin and secretary can see all views; steward sees secretary if applicable
  const availableViews = role === 'admin'
    ? roleViews
    : role === 'secretary'
      ? roleViews
      : roleViews.filter((v) => v.id === 'secretary'); // steward role doesn't have steward separate

  // For steward role, show steward view
  const views = role === 'steward'
    ? roleViews.filter((v) => v.id === 'steward')
    : availableViews;

  if (views.length === 0) return null;

  function dismiss() {
    sessionStorage.setItem(SESSION_KEY, 'true');
    setVisible(false);
  }

  return (
    <div className="rounded-xl border bg-card p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Trophy className="size-4 text-primary" />
          <p className="text-sm font-medium">Quick switch</p>
        </div>
        <button
          onClick={dismiss}
          className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className={cn('grid gap-2', views.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
        {views.map((view) => (
          <Link
            key={view.id}
            href={view.href}
            onClick={dismiss}
            className={cn(
              'flex items-center gap-3 rounded-lg border px-3 py-3 transition-colors min-h-[2.75rem]',
              view.colour
            )}
          >
            <view.icon className="size-5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{view.label}</p>
              <p className="text-[11px] opacity-70">{view.subtitle}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
