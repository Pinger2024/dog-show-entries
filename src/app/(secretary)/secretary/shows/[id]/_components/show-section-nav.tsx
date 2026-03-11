'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  CalendarDays,
  FileText,
  FolderOpen,
  Handshake,
  LayoutDashboard,
  ListChecks,
  PoundSterling,
  Printer,
  Ticket,
  Trophy,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';

const sections = [
  { path: '', label: 'Overview', icon: LayoutDashboard, exact: true },
  { path: '/checklist', label: 'Show Checklist', icon: ListChecks, hasBadge: true },
  { path: '/entries', label: 'Entries', icon: Ticket },
  { path: '/financial', label: 'Financial', icon: PoundSterling },
  { path: '/catalogue', label: 'Catalogue', icon: BookOpen },
  { path: '/results', label: 'Results', icon: Trophy },
  { path: '/reports', label: 'Reports', icon: FileText },
  { path: '/people', label: 'People', icon: Users },
  { path: '/sponsors', label: 'Sponsors', icon: Handshake },
  { path: '/schedule', label: 'Schedule', icon: CalendarDays },
  { path: '/documents', label: 'Documents', icon: FolderOpen },
  { path: '/print-shop', label: 'Print Shop', icon: Printer },
];

export function ShowSectionNav({ showId }: { showId: string }) {
  const pathname = usePathname();
  const basePath = `/secretary/shows/${showId}`;

  // Check for pending actions (accepted judges needing confirmation)
  const { data: judgeSummary } = trpc.secretary.getChecklistJudgeSummary.useQuery(
    { showId },
    { staleTime: 30_000 } // Cache for 30s to avoid excessive queries
  );

  const pendingActions = (judgeSummary?.summary.accepted ?? 0) + (judgeSummary?.summary.declined ?? 0);

  return (
    <nav className="flex gap-1 overflow-x-auto pb-2 sm:flex-wrap sm:overflow-x-visible sm:pb-0 scrollbar-hide">
      {sections.map((section) => {
        const href = `${basePath}${section.path}`;
        const isActive = section.exact
          ? pathname === basePath || pathname === `${basePath}/`
          : pathname.startsWith(href);
        const Icon = section.icon;
        const showBadge = section.hasBadge && pendingActions > 0 && !isActive;

        return (
          <Link
            key={section.path}
            href={href}
            className={cn(
              'relative inline-flex items-center gap-1.5 rounded-full px-3 py-2 min-h-[2.75rem] text-sm font-medium whitespace-nowrap transition-colors shrink-0 sm:shrink',
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <Icon className="size-3.5" />
            {section.label}
            {showBadge && (
              <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                {pendingActions > 9 ? '9+' : pendingActions}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
