'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  Eye,
  LogOut,
  LayoutDashboard,
  ClipboardList,
} from 'lucide-react';
import { cn } from '@/lib/utils';
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

export function StewardShell({ user, children }: StewardShellProps) {
  const pathname = usePathname();
  const canAccessSecretary =
    user.role === 'secretary' || user.role === 'admin';

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden">
      {/* Top header */}
      <header className="flex h-14 items-center justify-between border-b px-3 sm:px-4">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="font-serif text-xl font-bold tracking-tight text-primary"
          >
            Remi
          </Link>
          <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
            Steward
          </span>
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
            size="icon"
            className="size-9"
            onClick={() => signOut({ callbackUrl: '/' })}
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      {/* Main content — full width for phone-first */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden pb-20 md:pb-8">
        <div className="mx-auto max-w-2xl px-3 py-6 sm:px-4">
          {children}
        </div>
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t bg-background md:hidden">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] sm:text-xs font-medium transition-colors',
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
