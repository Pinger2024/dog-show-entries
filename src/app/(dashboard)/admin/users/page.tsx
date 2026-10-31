'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Eye, Search, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { PageHeader, PageTitle, PageDescription } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ROLE_STYLES: Record<string, { label: string; plural: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  admin: { label: 'Admin', plural: 'Admins', variant: 'destructive' },
  secretary: { label: 'Secretary', plural: 'Secretaries', variant: 'default' },
  exhibitor: { label: 'Exhibitor', plural: 'Exhibitors', variant: 'secondary' },
  steward: { label: 'Steward', plural: 'Stewards', variant: 'outline' },
  judge: { label: 'Judge', plural: 'Judges', variant: 'outline' },
};

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const [search, setSearch] = useState('');
  const [impersonating, setImpersonating] = useState<string | null>(null);

  const [clubFilter, setClubFilter] = useState('all');

  const { data: users, refetch } = trpc.dev.listUsers.useQuery();
  const setRoleMutation = trpc.dev.setRole.useMutation({
    onSuccess: () => refetch(),
  });

  // Every club that actually has a member, for the filter. Built from the rows
  // rather than a second query so the dropdown can never offer a club that
  // would filter to nothing.
  const clubOptions = Array.from(
    new Map(
      (users ?? []).flatMap((u) => u.clubs.map((c) => [c.id, c.name] as const))
    ).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const filteredUsers = users?.filter((u) => {
    if (clubFilter !== 'all' && !u.clubs.some((c) => c.id === clubFilter)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (u.name?.toLowerCase() ?? '').includes(q) ||
      (u.email?.toLowerCase() ?? '').includes(q) ||
      u.clubs.some((c) => c.name.toLowerCase().includes(q))
    );
  });

  async function handleImpersonate(userId: string) {
    setImpersonating(userId);
    try {
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to impersonate');
      }
      // Full reload — the tRPC/React Query client cache would otherwise keep
      // serving the admin's own queries to the impersonated session.
      window.location.href = '/';
    } finally {
      setImpersonating(null);
    }
  }

  async function handleRoleChange(userId: string, role: string) {
    await setRoleMutation.mutateAsync({
      userId,
      role: role as 'exhibitor' | 'secretary' | 'steward' | 'judge' | 'admin',
    });
  }

  // Only admin can access
  if (session?.user && (session.user as Record<string, unknown>).role !== 'admin') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Admin access required</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <PageHeader>
            <div>
              <PageTitle>Users</PageTitle>
              <PageDescription>Manage users and impersonate to see their view</PageDescription>
            </div>
          </PageHeader>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {['admin', 'secretary', 'exhibitor', 'steward'].map((role) => {
            const count = users?.filter((u) => u.role === role).length ?? 0;
            const style = ROLE_STYLES[role]!;
            return (
              <StatCard key={role} label={style.plural} value={count} />
            );
          })}
        </div>

        {/* Search + club filter. Stacked on a phone, side by side above sm. */}
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, email or club..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={clubFilter} onValueChange={setClubFilter}>
            <SelectTrigger className="h-10 w-full sm:w-[260px]">
              <SelectValue placeholder="All clubs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clubs</SelectItem>
              {clubOptions.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {clubFilter !== 'all' && (
          <p className="mb-3 text-sm text-muted-foreground">
            {filteredUsers?.length ?? 0}{' '}
            {filteredUsers?.length === 1 ? 'person is' : 'people are'} in{' '}
            <span className="font-medium text-foreground">
              {clubOptions.find(([id]) => id === clubFilter)?.[1]}
            </span>
          </p>
        )}

        {/* Users table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers?.map((u) => {
                  const isCurrentUser = u.id === session?.user?.id;

                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">
                            {u.name ?? 'Unnamed'}
                            {isCurrentUser && (
                              <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground break-all">{u.email}</p>

                          {/* Club membership — an ACTIVE one is what lets a
                              secretary into that club's shows, so it is the
                              thing you actually need when deciding who to
                              impersonate. Non-active is spelled out rather
                              than hidden: "pending" looks like access until
                              you try to use it. */}
                          {u.clubs.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {u.clubs.map((c) => (
                                <Badge
                                  key={c.id}
                                  variant={c.status === 'active' ? 'secondary' : 'outline'}
                                  className="font-normal"
                                >
                                  {c.name}
                                  {c.status !== 'active' && (
                                    <span className="ml-1 opacity-70">· {c.status}</span>
                                  )}
                                </Badge>
                              ))}
                            </div>
                          )}

                          <p className="text-xs text-muted-foreground">
                            {u.dogCount} {u.dogCount === 1 ? 'dog' : 'dogs'} ·{' '}
                            {u.entryCount} {u.entryCount === 1 ? 'entry' : 'entries'}
                            {u.clubs.length === 0 && ' · no club'}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={u.role}
                          onValueChange={(value) => handleRoleChange(u.id, value)}
                        >
                          <SelectTrigger className="w-[130px] h-10 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(ROLE_STYLES).map(([role, s]) => (
                              <SelectItem key={role} value={role}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        {!isCurrentUser && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleImpersonate(u.id)}
                            disabled={impersonating !== null}
                            title={`Impersonate ${u.name ?? u.email}`}
                          >
                            {impersonating === u.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Eye className="size-4" />
                            )}
                            <span className="ml-1.5 hidden sm:inline">Impersonate</span>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}

                {filteredUsers?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                      No users found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
