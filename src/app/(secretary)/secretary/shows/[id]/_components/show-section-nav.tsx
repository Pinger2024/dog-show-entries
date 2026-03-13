'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BookOpen,
  CalendarDays,
  ChevronDown,
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
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

type Section = {
  path: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  hasBadge?: boolean;
};

const sections: Section[] = [
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

// Grouped for the mobile sheet
const sectionGroups = [
  {
    label: 'Show Day',
    items: ['', '/checklist', '/entries', '/results'],
  },
  {
    label: 'Finance & Print',
    items: ['/financial', '/catalogue', '/reports', '/print-shop'],
  },
  {
    label: 'Setup',
    items: ['/schedule', '/people', '/sponsors', '/documents'],
  },
];

const sectionMap = new Map(sections.map((s) => [s.path, s]));

function isActive(section: Section, pathname: string, basePath: string): boolean {
  if (section.exact) {
    return pathname === basePath || pathname === `${basePath}/`;
  }
  return pathname.startsWith(`${basePath}${section.path}`);
}

export function ShowSectionNav({ showId }: { showId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const basePath = `/secretary/shows/${showId}`;
  const [open, setOpen] = useState(false);

  // Check for pending actions (accepted judges needing confirmation)
  const { data: judgeSummary } = trpc.secretary.getChecklistJudgeSummary.useQuery(
    { showId },
    { staleTime: 30_000 }
  );

  const pendingActions = (judgeSummary?.summary.accepted ?? 0) + (judgeSummary?.summary.declined ?? 0);

  // Find the currently active section
  const currentSection = sections.find((s) => isActive(s, pathname, basePath)) ?? sections[0];
  const CurrentIcon = currentSection.icon;

  return (
    <>
      {/* ─── Mobile: section picker button + bottom sheet ─── */}
      <div className="md:hidden">
        <button
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left transition-colors active:bg-muted"
        >
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CurrentIcon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{currentSection.label}</p>
            <p className="text-xs text-muted-foreground">Tap to switch section</p>
          </div>
          <ChevronDown className="size-4 text-muted-foreground" />
          {currentSection.path !== '/checklist' && pendingActions > 0 && (
            <span className="flex size-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
              {pendingActions > 9 ? '9+' : pendingActions}
            </span>
          )}
        </button>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" showCloseButton={false} className="rounded-t-2xl pb-[env(safe-area-inset-bottom)]">
            <SheetHeader className="pb-2">
              <SheetTitle className="text-base">Show Sections</SheetTitle>
            </SheetHeader>
            <div className="max-h-[60vh] space-y-4 overflow-y-auto px-4 pb-4">
              {sectionGroups.map((group) => (
                <div key={group.label}>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {group.items.map((path) => {
                      const section = sectionMap.get(path);
                      if (!section) return null;
                      const Icon = section.icon;
                      const active = isActive(section, pathname, basePath);
                      const showBadge = section.hasBadge && pendingActions > 0 && !active;

                      return (
                        <button
                          key={path}
                          onClick={() => {
                            setOpen(false);
                            router.push(`${basePath}${path}`);
                          }}
                          className={cn(
                            'relative flex items-center gap-2.5 rounded-xl border px-3 py-3 text-left text-sm font-medium transition-colors min-h-[2.75rem]',
                            active
                              ? 'border-primary/30 bg-primary/10 text-primary'
                              : 'border-transparent bg-muted/50 text-foreground active:bg-muted'
                          )}
                        >
                          <Icon className="size-4 shrink-0" />
                          <span className="truncate">{section.label}</span>
                          {showBadge && (
                            <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                              {pendingActions > 9 ? '9+' : pendingActions}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* ─── Desktop: wrapping pill nav ─── */}
      <nav className="hidden gap-1 md:flex md:flex-wrap">
        {sections.map((section) => {
          const href = `${basePath}${section.path}`;
          const active = isActive(section, pathname, basePath);
          const Icon = section.icon;
          const showBadge = section.hasBadge && pendingActions > 0 && !active;

          return (
            <Link
              key={section.path}
              href={href}
              className={cn(
                'relative inline-flex items-center gap-1.5 rounded-full px-3 py-2 min-h-[2.75rem] text-sm font-medium whitespace-nowrap transition-colors',
                active
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
    </>
  );
}
