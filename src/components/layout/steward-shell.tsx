'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  Eye,
  LogOut,
  LayoutDashboard,
  ClipboardList,
  ChevronLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { isUuid } from '@/lib/slugify';
import { Button } from '@/components/ui/button';

interface StewardShellProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role?: string;
  };
  children: React.ReactNode;
}

const navItems = [
  { href: '/steward', label: 'My Shows', icon: Eye },
];

// Steward routes: /steward → /steward/shows/[uuid] → /steward/shows/[uuid]/classes/[uuid]
// Note: /steward/shows and /steward/shows/[uuid]/classes don't exist as pages
function getParentPath(pathname: string): string | null {
  if (pathname === '/steward') return null;
  const segments = pathname.split('/').filter(Boolean);
  // /steward/shows/[uuid] → /steward
  if (segments.length === 3 && segments[1] === 'shows') {
    return '/steward';
  }
  // /steward/shows/[uuid]/classes/[uuid] → /steward/shows/[uuid]
  if (segments.length >= 5 && segments[3] === 'classes') {
    return `/steward/shows/${segments[2]}`;
  }
  // Fallback
  return '/steward';
}

function getMobileTitle(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length <= 1) return null;
  // /steward/shows/[uuid]/classes/[uuid] → "Class"
  if (segments.length >= 5 && segments[3] === 'classes') {
    return 'Class';
  }
  const last = segments[segments.length - 1];
  if (isUuid(last)) return null;
  if (last === 'new') return 'Add New';
  if (last === 'edit') return 'Edit';
  return last.charAt(0).toUpperCase() + last.slice(1).replace(/-/g, ' ');
}

export function StewardShell({ user, children }: StewardShellProps) {
  const pathname = usePathname() ?? '/steward';
  const parentPath = getParentPath(pathname);
  const mobileTitle = getMobileTitle(pathname);
  const canAccessSecretary =
    user.role === 'secretary' || user.role === 'admin';

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden">
      {/* Top header */}
      <header className="flex h-14 items-center justify-between border-b px-3 sm:px-4">
        <div className="flex items-center gap-2 min-w-0">
          {parentPath ? (
            <>
              <Link
                href={parentPath}
                className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <ChevronLeft className="size-5" />
              </Link>
              {mobileTitle && (
                <span className="truncate text-[0.9375rem] font-medium">
                  {mobileTitle}
                </span>
              )}
            </>
          ) : (
            <>
              <Link
                href="/"
                className="font-serif text-xl font-bold tracking-tight text-primary"
              >
                Remi
              </Link>
              <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                Steward
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canAccessSecretary && (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/secretary">
                <ClipboardList className="mr-1 size-4" />
                <span className="hidden sm:inline">Secretary</span>
              </Link>
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard">
              <LayoutDashboard className="mr-1 size-4" />
              <span className="hidden sm:inline">Exhibitor</span>
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 px-2.5 text-xs text-muted-foreground"
            onClick={() => signOut({ callbackUrl: '/' })}
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </Button>
        </div>
      </header>

      {/* Main content — full width for phone-first */}
      <main className="min-w-0 flex-1 overflow-y-auto pb-24 md:pb-8">
        <div className="mx-auto max-w-2xl px-2 py-6 sm:px-4">
          {children}
        </div>
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[48px] py-2 text-xs sm:text-xs font-medium transition-colors',
                isActive
                  ? 'text-blue-600'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <item.icon className="size-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
