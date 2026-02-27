'use client';

import Link from 'next/link';
import { signOut } from 'next-auth/react';
import {
  LayoutDashboard,
  Dog,
  Ticket,
  LogOut,
  ClipboardList,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface UserNavProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
  isSecretary?: boolean;
}

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

export function UserNav({ user, isSecretary }: UserNavProps) {
  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="ghost" className="h-11 px-5 text-[0.9375rem]" asChild>
          <Link href="/login">Sign In</Link>
        </Button>
        <Button className="h-11 px-5 text-[0.9375rem]" asChild>
          <Link href="/register">Create Free Account</Link>
        </Button>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative size-10 rounded-full"
        >
          <Avatar>
            <AvatarImage
              src={user.image ?? undefined}
              alt={user.name ?? 'User avatar'}
            />
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
              {getInitials(user.name, user.email)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            {user.name && (
              <p className="text-[0.9375rem] font-medium leading-none">{user.name}</p>
            )}
            {user.email && (
              <p className="text-sm leading-none text-muted-foreground">
                {user.email}
              </p>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/dashboard" className="text-[0.9375rem]">
              <LayoutDashboard />
              Dashboard
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/dogs" className="text-[0.9375rem]">
              <Dog />
              My Dogs
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/entries" className="text-[0.9375rem]">
              <Ticket />
              My Entries
            </Link>
          </DropdownMenuItem>
          {isSecretary && (
            <DropdownMenuItem asChild>
              <Link href="/secretary" className="text-[0.9375rem]">
                <ClipboardList />
                Secretary Dashboard
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => signOut({ callbackUrl: '/' })}
          className="text-[0.9375rem]"
        >
          <LogOut />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
