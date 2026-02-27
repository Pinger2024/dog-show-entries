'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  LayoutDashboard,
  CalendarDays,
  PlusCircle,
  LogOut,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface SecretaryShellProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  children: React.ReactNode;
}

const navItems = [
  { href: '/secretary', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/secretary/shows', label: 'My Shows', icon: CalendarDays },
  { href: '/secretary/shows/new', label: 'Create Show', icon: PlusCircle },
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

export function SecretaryShell({ user, children }: SecretaryShellProps) {
  const pathname = usePathname();
  const breadcrumbs = getBreadcrumbs(pathname);

  return (
    <div className="flex min-h-screen">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r bg-sidebar md:flex md:flex-col">
        <div className="flex h-16 items-center gap-3 border-b px-5">
          <Link href="/" className="text-xl font-extrabold tracking-tight text-primary">
            Remi
          </Link>
          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            Secretary
          </span>
        </div>

        <div className="flex items-center gap-3 border-b px-5 py-4">
          <Avatar size="sm">
            <AvatarImage src={user.image ?? undefined} />
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {getInitials(user.name, user.email)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.name ?? 'Secretary'}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/secretary' &&
                pathname.startsWith(item.href) &&
                item.href !== '/secretary/shows/new');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-primary'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t p-3">
          <Link
            href="/dashboard"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LayoutDashboard className="size-4" />
            Exhibitor View
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LogOut className="size-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        <header className="hidden h-16 items-center border-b px-6 md:flex">
          <nav className="flex items-center gap-1 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground">
              Home
            </Link>
            {breadcrumbs.map((crumb) => (
              <span key={crumb.href} className="flex items-center gap-1">
                <ChevronRight className="size-3.5" />
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
        <header className="flex h-14 items-center justify-between border-b px-4 md:hidden">
          <div className="flex items-center gap-2">
            <Link href="/" className="text-xl font-extrabold tracking-tight text-primary">
              Remi
            </Link>
            <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              Secretary
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => signOut({ callbackUrl: '/' })}
          >
            <LogOut className="size-4" />
          </Button>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-4 py-6 pb-20 sm:px-6 md:pb-6 lg:px-8">
            {children}
          </div>
        </main>

        {/* Mobile bottom tab bar */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t bg-background md:hidden">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/secretary' &&
                pathname.startsWith(item.href) &&
                item.href !== '/secretary/shows/new');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors',
                  isActive
                    ? 'text-primary'
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
    </div>
  );
}
