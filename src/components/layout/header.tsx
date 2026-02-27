import Link from 'next/link';
import { auth } from '@/lib/auth';
import { UserNav } from './user-nav';
import { MobileNav } from './mobile-nav';

export async function Header() {
  const session = await auth();
  const user = session?.user;
  const isSecretary = user?.role === 'secretary' || user?.role === 'admin';

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/85 backdrop-blur-lg supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
        >
          <span className="font-serif text-[1.625rem] font-bold tracking-tight text-primary">
            Remi
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-1 md:flex">
          <Link
            href="/shows"
            className="rounded-lg px-4 py-2.5 text-[0.9375rem] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Find a Show
          </Link>
          {user && (
            <>
              <Link
                href="/dogs"
                className="rounded-lg px-4 py-2.5 text-[0.9375rem] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                My Dogs
              </Link>
              <Link
                href="/entries"
                className="rounded-lg px-4 py-2.5 text-[0.9375rem] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                My Entries
              </Link>
              {isSecretary && (
                <Link
                  href="/secretary"
                  className="rounded-lg px-4 py-2.5 text-[0.9375rem] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Secretary
                </Link>
              )}
            </>
          )}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <div className="hidden md:block">
            <UserNav user={user ?? null} isSecretary={isSecretary} />
          </div>
          <MobileNav user={user ?? null} isSecretary={isSecretary} />
        </div>
      </div>
    </header>
  );
}
