'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  FileText,
  LayoutDashboard,
  ListChecks,
  PoundSterling,
  Ticket,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const sections = [
  { path: '', label: 'Overview', icon: LayoutDashboard, exact: true },
  { path: '/requirements', label: 'Requirements', icon: ListChecks },
  { path: '/entries', label: 'Entries', icon: Ticket },
  { path: '/financial', label: 'Financial', icon: PoundSterling },
  { path: '/catalogue', label: 'Catalogue', icon: BookOpen },
  { path: '/reports', label: 'Reports', icon: FileText },
  { path: '/people', label: 'People', icon: Users },
];

export function ShowSectionNav({ showId }: { showId: string }) {
  const pathname = usePathname();
  const basePath = `/secretary/shows/${showId}`;

  return (
    <nav className="overflow-x-auto scrollbar-hide -mx-3 sm:mx-0">
      <div className="flex gap-1 px-3 sm:px-0 sm:flex-wrap">
        {sections.map((section) => {
          const href = `${basePath}${section.path}`;
          const isActive = section.exact
            ? pathname === basePath || pathname === `${basePath}/`
            : pathname.startsWith(href);
          const Icon = section.icon;

          return (
            <Link
              key={section.path}
              href={href}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="size-3.5" />
              {section.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
