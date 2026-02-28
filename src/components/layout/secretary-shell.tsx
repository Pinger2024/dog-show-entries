'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  LayoutDashboard,
  CalendarDays,
  PlusCircle,
  CreditCard,
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

const sidebarNavItems = [
  { href: '/secretary', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/secretary/shows', label: 'My Shows', icon: CalendarDays },
  { href: '/secretary/shows/new', label: 'Create Show', icon: PlusCircle },
  { href: '/secretary/billing', label: 'Billing', icon: CreditCard },
];

const mobileNavItems = [
  { href: '/secretary', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/secretary/shows', label: 'My Shows', icon: CalendarDays },
  { href: '/secretary/billing', label: 'Billing', icon: CreditCard },
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
        <div className="flex h-[4.5rem] items-center gap-3 border-b px-5">
          <Link href="/" className="font-serif text-[1.375rem] font-bold tracking-tight text-primary">
            Remi
          </Link>
          <span className="rounded-md bg-gold/15 px-2 py-0.5 text-xs font-semibold text-gold">
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
            <p className="truncate text-[0.9375rem] font-medium">{user.name ?? 'Secretary'}</p>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {sidebarNavItems.map((item) => {
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
        </nav>

        <div className="border-t p-3">
          <Link
            href="/dashboard"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-[0.9375rem] font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LayoutDashboard className="size-5" />
            Exhibitor View
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
          <div className="flex items-center gap-2">
            <Link href="/" className="font-serif text-xl font-bold tracking-tight text-primary">
              Remi
            </Link>
            <span className="rounded-md bg-gold/15 px-2 py-0.5 text-xs font-semibold text-gold">
              Secretary
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="size-10"
            onClick={() => signOut({ callbackUrl: '/' })}
          >
            <LogOut className="size-5" />
          </Button>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-3 py-8 pb-24 sm:px-4 md:pb-8 lg:px-8">
            {children}
          </div>
        </main>

        {/* Mobile bottom tab bar */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t bg-background md:hidden">
          {mobileNavItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/secretary' &&
                pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] sm:text-xs font-medium transition-colors',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <item.icon className="size-5" />
                <span className="truncate max-w-[60px]">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
