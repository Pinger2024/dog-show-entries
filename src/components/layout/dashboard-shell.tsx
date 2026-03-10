'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  LayoutDashboard,
  Dog,
  Ticket,
  CalendarDays,
  Inbox,
  UserPlus,
  Users,
  Database,
  ClipboardCheck,
  Sparkles,
  Settings,
  LogOut,
  ChevronRight,
  Activity,
  ListTodo,
  Rss,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { RoleSwitcher, RoleSwitcherCompact } from '@/components/layout/role-switcher';

interface DashboardShellProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role?: string;
  };
  children: React.ReactNode;
}

const personalNavItems = [
  { href: '/dashboard', label: 'Dashboard', mobileLabel: 'Home', icon: LayoutDashboard },
  { href: '/dogs', label: 'My Dogs', mobileLabel: 'Dogs', icon: Dog },
  { href: '/entries', label: 'My Entries', mobileLabel: 'Entries', icon: Ticket },
  { href: '/browse', label: 'Find a Show', mobileLabel: 'Shows', icon: CalendarDays },
  { href: '/feed', label: 'My Feed', mobileLabel: 'Feed', icon: Rss },
];

const adminNavItems = [
  { href: '/admin', label: 'Overview', mobileLabel: 'Admin', icon: Activity },
  { href: '/admin/users', label: 'Users', mobileLabel: 'Users', icon: Users },
  { href: '/feedback', label: 'Feedback', mobileLabel: 'Feedback', icon: Inbox },
  { href: '/backlog', label: 'Backlog', mobileLabel: 'Backlog', icon: ListTodo },
  { href: '/admin/applications', label: 'Applications', mobileLabel: 'Apps', icon: ClipboardCheck },
  { href: '/admin/invitations', label: 'Invitations', mobileLabel: 'Invites', icon: UserPlus },
  { href: '/admin/reference-data', label: 'Reference Data', mobileLabel: 'Ref Data', icon: Database },
];

/** Mobile bottom bar: admin gets admin-focused tabs, others get personal tabs */
const adminMobileItems = [
  { href: '/admin', label: 'Overview', mobileLabel: 'Overview', icon: Activity },
  { href: '/feedback', label: 'Feedback', mobileLabel: 'Feedback', icon: Inbox },
  { href: '/backlog', label: 'Backlog', mobileLabel: 'Backlog', icon: ListTodo },
  { href: '/admin/users', label: 'Users', mobileLabel: 'Users', icon: Users },
  { href: '/admin/applications', label: 'Applications', mobileLabel: 'Apps', icon: ClipboardCheck },
];

function getInitials(name?: string | null, email?: string | null) {
  if (name) {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
  if (email) return email[0].toUpperCase();
  return '?';
}

function getBreadcrumbs(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  return segments.map((segment, i) => ({
    label: segment.charAt(0).toUpperCase() + segment.slice(1),
    href: '/' + segments.slice(0, i + 1).join('/'),
    isLast: i === segments.length - 1,
  }));
}

export function DashboardShell({ user, children }: DashboardShellProps) {
  const pathname = usePathname();
  const breadcrumbs = getBreadcrumbs(pathname);

  return (
    <div className="flex min-h-screen overflow-x-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r bg-sidebar md:flex md:flex-col sticky top-0 h-screen overflow-y-auto">
        {/* Sidebar header */}
        <div className="flex h-[4.5rem] items-center gap-3 border-b px-5">
          <Link href="/" className="font-serif text-[1.375rem] font-bold tracking-tight text-primary">
            Remi
          </Link>
        </div>

        {/* User info + role switcher */}
        <div className="border-b px-5 py-4 space-y-3">
          <div className="flex items-center gap-3">
            <Avatar size="sm">
              <AvatarImage src={user.image ?? undefined} />
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                {getInitials(user.name, user.email)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.9375rem] font-medium">{user.name ?? 'User'}</p>
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>
          {user.role === 'secretary' && (
            <RoleSwitcher activeView="exhibitor" />
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 p-3">
          {user.role === 'admin' ? (
            adminNavItems.map((item) => {
              const isActive =
                item.href === '/admin'
                  ? pathname === '/admin'
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-3 text-[0.9375rem] font-medium transition-colors',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-primary'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                  )}
                >
                  <item.icon className="size-5" />
                  {item.label}
                </Link>
              );
            })
          ) : (
            <>
              {personalNavItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/dashboard' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-3 text-[0.9375rem] font-medium transition-colors',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-primary'
                        : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                    )}
                  >
                    <item.icon className="size-5" />
                    {item.label}
                  </Link>
                );
              })}
              {user.role === 'exhibitor' && (
                <>
                  <Separator className="my-2" />
                  <Link
                    href="/apply"
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-3 text-[0.9375rem] font-medium transition-colors',
                      pathname === '/apply'
                        ? 'bg-sidebar-accent text-sidebar-primary'
                        : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                    )}
                  >
                    <Sparkles className="size-5" />
                    Run Shows
                  </Link>
                </>
              )}
            </>
          )}
        </nav>

        {/* Sidebar footer */}
        <div className="border-t p-3">
          <Link
            href="/settings"
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-3 text-[0.9375rem] font-medium transition-colors',
              pathname === '/settings'
                ? 'bg-sidebar-accent text-sidebar-primary'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
            )}
          >
            <Settings className="size-5" />
            Settings
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-[0.9375rem] font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LogOut className="size-5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        {/* Top bar with breadcrumbs (desktop) */}
        <header className="hidden h-[4.5rem] items-center border-b px-6 md:flex">
          <nav className="flex items-center gap-1.5 text-[0.9375rem] text-muted-foreground">
            <Link href="/" className="hover:text-foreground">
              Home
            </Link>
            {breadcrumbs.map((crumb) => (
              <span key={crumb.href} className="flex items-center gap-1.5">
                <ChevronRight className="size-4" />
                {crumb.isLast ? (
                  <span className="font-medium text-foreground">
                    {crumb.label}
                  </span>
                ) : (
                  <Link href={crumb.href} className="hover:text-foreground">
                    {crumb.label}
                  </Link>
                )}
              </span>
            ))}
          </nav>
        </header>

        {/* Mobile header */}
        <header className="flex h-16 items-center justify-between border-b px-3 sm:px-4 md:hidden">
          <Link href="/" className="font-serif text-xl font-bold tracking-tight text-primary">
            Remi
          </Link>
          <div className="flex items-center gap-1.5">
            {user.role === 'secretary' && (
              <RoleSwitcherCompact activeView="exhibitor" />
            )}
            <Button variant="ghost" size="sm" className="size-11" asChild>
              <Link href="/settings">
                <Settings className="size-5" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-1.5 px-2.5 text-xs text-muted-foreground"
              onClick={() => signOut({ callbackUrl: '/' })}
            >
              <LogOut className="size-4" />
              <span className="sr-only sm:not-sr-only">Sign Out</span>
            </Button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-3 py-4 pb-28 sm:py-6 sm:px-4 md:pb-8 lg:px-8">
            {children}
          </div>
        </main>

        {/* Mobile bottom tab bar */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
          {(user.role === 'admin' ? adminMobileItems : personalNavItems).map((item) => {
            const isActive =
              item.href === '/admin'
                ? pathname === '/admin'
                : pathname === item.href ||
                  (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[48px] py-2 text-[10px] sm:text-xs font-medium transition-colors',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <item.icon className="size-5" />
                <span className="truncate max-w-full">{item.mobileLabel}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
