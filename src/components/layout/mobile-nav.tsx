'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { Menu, Dog, Ticket, LayoutDashboard, LogOut, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';

interface MobileNavProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
}

export function MobileNav({ user }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="size-11 md:hidden">
          <Menu className="size-5" />
          <span className="sr-only">Open menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72 p-0">
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle className="text-left font-serif text-xl font-bold tracking-tight text-primary">
            Remi
          </SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1 p-4">
          <Link
            href="/shows"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-lg px-3 py-3 text-[0.9375rem] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Eye className="size-5" />
            Find a Show
          </Link>
          {user && (
            <>
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-3 text-[0.9375rem] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <LayoutDashboard className="size-5" />
                Dashboard
              </Link>
              <Link
                href="/dogs"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-3 text-[0.9375rem] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Dog className="size-5" />
                My Dogs
              </Link>
              <Link
                href="/entries"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-3 text-[0.9375rem] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Ticket className="size-5" />
                My Entries
              </Link>
            </>
          )}
          <Separator className="my-2" />
          {user ? (
            <>
              <div className="px-3 py-2">
                {user.name && (
                  <p className="text-[0.9375rem] font-medium">{user.name}</p>
                )}
                {user.email && (
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                )}
              </div>
              <button
                onClick={() => {
                  setOpen(false);
                  signOut({ callbackUrl: '/' });
                }}
                className="flex items-center gap-3 rounded-lg px-3 py-3 text-[0.9375rem] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <LogOut className="size-5" />
                Sign Out
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-2 px-3 pt-2">
              <Button asChild variant="outline" className="h-12 text-[0.9375rem]" onClick={() => setOpen(false)}>
                <Link href="/login">Sign In</Link>
              </Button>
              <Button asChild className="h-12 text-[0.9375rem]" onClick={() => setOpen(false)}>
                <Link href="/register">Create Free Account</Link>
              </Button>
            </div>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
