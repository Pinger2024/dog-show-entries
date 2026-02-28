'use client';

import { useState } from 'react';
import { signIn, useSession } from 'next-auth/react';
import {
  Users,
  Shield,
  User,
  ClipboardList,
  Gavel,
  Eye,
  ChevronUp,
  ChevronDown,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

const ROLE_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; colour: string }
> = {
  admin: { label: 'Admin', icon: Shield, colour: 'bg-red-100 text-red-700' },
  secretary: {
    label: 'Secretary',
    icon: ClipboardList,
    colour: 'bg-amber-100 text-amber-700',
  },
  exhibitor: {
    label: 'Exhibitor',
    icon: User,
    colour: 'bg-emerald-100 text-emerald-700',
  },
  steward: { label: 'Steward', icon: Eye, colour: 'bg-blue-100 text-blue-700' },
  judge: { label: 'Judge', icon: Gavel, colour: 'bg-purple-100 text-purple-700' },
};

const ROLES = ['admin', 'secretary', 'exhibitor', 'steward', 'judge'] as const;

export function AccountSwitcher() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [changingRole, setChangingRole] = useState<string | null>(null);

  const { data: allUsers, refetch } = trpc.dev.listUsers.useQuery(undefined, {
    enabled: !!session?.user,
  });

  const setRoleMutation = trpc.dev.setRole.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  if (!session?.user) return null;

  const currentUser = session.user;
  const currentRoleConfig = ROLE_CONFIG[currentUser.role] ?? ROLE_CONFIG.exhibitor!;
  const CurrentIcon = currentRoleConfig.icon;

  async function switchToUser(email: string) {
    setSwitching(email);
    await signIn('demo', {
      email,
      callbackUrl: window.location.pathname,
    });
  }

  async function changeRole(userId: string, role: string) {
    setChangingRole(`${userId}-${role}`);
    try {
      await setRoleMutation.mutateAsync({
        userId,
        role: role as (typeof ROLES)[number],
      });
      // If changing own role, re-sign-in to refresh JWT
      if (userId === currentUser.id) {
        await signIn('demo', {
          email: currentUser.email!,
          callbackUrl: window.location.pathname,
        });
      }
    } finally {
      setChangingRole(null);
    }
  }

  return (
    <div className="fixed bottom-20 right-3 z-[9999] md:bottom-4 md:right-4">
      {/* Expanded panel */}
      {open && (
        <div className="mb-2 w-80 rounded-xl border bg-white shadow-2xl">
          {/* Header */}
          <div className="border-b px-4 py-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-900">
                Account Switcher
              </h3>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                Dev Tool
              </span>
            </div>
            <p className="mt-0.5 text-xs text-neutral-500">
              Switch accounts and roles for testing
            </p>
          </div>

          {/* Current user */}
          <div className="border-b bg-neutral-50 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
              Signed in as
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-sm font-semibold text-neutral-900">
                {currentUser.name ?? currentUser.email}
              </span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-bold',
                  currentRoleConfig.colour
                )}
              >
                {currentRoleConfig.label}
              </span>
            </div>
            <p className="text-xs text-neutral-500">{currentUser.email}</p>
          </div>

          {/* User list */}
          <div className="max-h-72 overflow-y-auto px-2 py-2">
            {allUsers?.map((u) => {
              const isCurrent = u.id === currentUser.id;
              const roleConf = ROLE_CONFIG[u.role] ?? ROLE_CONFIG.exhibitor!;
              const RoleIcon = roleConf.icon;

              return (
                <div
                  key={u.id}
                  className={cn(
                    'rounded-lg px-3 py-2.5',
                    isCurrent && 'bg-primary/5'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-100">
                      <RoleIcon className="size-4 text-neutral-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-neutral-900">
                          {u.name ?? 'Unnamed'}
                        </span>
                        <span
                          className={cn(
                            'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                            roleConf.colour
                          )}
                        >
                          {roleConf.label}
                        </span>
                      </div>
                      <p className="truncate text-xs text-neutral-500">
                        {u.email}
                      </p>
                    </div>
                    {!isCurrent && (
                      <button
                        onClick={() => switchToUser(u.email!)}
                        disabled={switching !== null}
                        className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
                      >
                        {switching === u.email ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          'Switch'
                        )}
                      </button>
                    )}
                  </div>

                  {/* Role changer */}
                  <div className="mt-2 flex flex-wrap gap-1 pl-10">
                    {ROLES.map((role) => {
                      const rc = ROLE_CONFIG[role]!;
                      const isActive = u.role === role;
                      const isChanging = changingRole === `${u.id}-${role}`;

                      return (
                        <button
                          key={role}
                          onClick={() => !isActive && changeRole(u.id, role)}
                          disabled={isActive || changingRole !== null}
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all',
                            isActive
                              ? cn(rc.colour, 'ring-1 ring-current')
                              : 'bg-neutral-100 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600',
                            'disabled:cursor-default'
                          )}
                        >
                          {isChanging ? (
                            <Loader2 className="inline size-2.5 animate-spin" />
                          ) : (
                            rc.label
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {(!allUsers || allUsers.length === 0) && (
              <p className="py-4 text-center text-xs text-neutral-400">
                No users found
              </p>
            )}
          </div>

          {/* Footer hint */}
          <div className="border-t px-4 py-2">
            <p className="text-[10px] text-neutral-400">
              Changing role updates the database. Switching account refreshes
              your session with the new role.
            </p>
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 rounded-full border bg-white px-4 py-2.5 shadow-lg transition-all hover:shadow-xl',
          open && 'ring-2 ring-primary/20'
        )}
      >
        <div className="flex size-6 items-center justify-center rounded-full bg-primary/10">
          <CurrentIcon className="size-3.5 text-primary" />
        </div>
        <span className="text-xs font-semibold text-neutral-700">
          {currentUser.name?.split(' ')[0] ?? 'User'}
        </span>
        <span
          className={cn(
            'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
            currentRoleConfig.colour
          )}
        >
          {currentRoleConfig.label}
        </span>
        {open ? (
          <ChevronDown className="size-3.5 text-neutral-400" />
        ) : (
          <ChevronUp className="size-3.5 text-neutral-400" />
        )}
      </button>
    </div>
  );
}
