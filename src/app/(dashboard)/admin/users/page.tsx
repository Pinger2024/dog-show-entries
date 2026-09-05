'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Eye, Search, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { PageHeader, PageTitle, PageDescription } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

  const { data: users, refetch } = trpc.dev.listUsers.useQuery();
  const setRoleMutation = trpc.dev.setRole.useMutation({
    onSuccess: () => refetch(),
  });

  const filteredUsers = users?.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (u.name?.toLowerCase() ?? '').includes(q) ||
      (u.email?.toLowerCase() ?? '').includes(q)
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

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search users by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

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
                        <div>
                          <p className="font-medium">
                            {u.name ?? 'Unnamed'}
                            {isCurrentUser && (
                              <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
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
