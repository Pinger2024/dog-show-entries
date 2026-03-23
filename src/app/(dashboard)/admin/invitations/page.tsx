'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { format } from 'date-fns';
import {
  UserPlus,
  Loader2,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PageHeader, PageTitle, PageDescription } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-800', icon: Clock },
  accepted: { label: 'Accepted', color: 'bg-emerald-100 text-emerald-800', icon: CheckCircle2 },
  expired: { label: 'Expired', color: 'bg-gray-100 text-gray-600', icon: AlertTriangle },
  revoked: { label: 'Revoked', color: 'bg-red-100 text-red-800', icon: XCircle },
} as const;

export default function InvitationsPage() {
  const { data: session } = useSession();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'secretary' | 'steward' | 'judge'>('secretary');
  const [message, setMessage] = useState('');

  const utils = trpc.useUtils();
  const { data: invitationList, isLoading } = trpc.invitations.list.useQuery();

  const sendInvitation = trpc.invitations.send.useMutation({
    onSuccess: (data) => {
      if (data.status === 'accepted') {
        toast.success('Role assigned!', {
          description: `${email} already had an account — they've been made a ${role} and notified by email.`,
        });
      } else {
        toast.success('Invitation sent!', {
          description: `An email has been sent to ${email} with a link to accept.`,
        });
      }
      setEmail('');
      setMessage('');
      utils.invitations.list.invalidate();
    },
    onError: (err) => {
      toast.error('Failed to send invitation', { description: err.message });
    },
  });

  const revokeInvitation = trpc.invitations.revoke.useMutation({
    onSuccess: () => {
      toast.success('Invitation revoked');
      utils.invitations.list.invalidate();
    },
    onError: (err) => {
      toast.error('Failed to revoke', { description: err.message });
    },
  });

  const isAdmin = session?.user?.role === 'admin';

  if (!isAdmin && session?.user?.role !== 'secretary') {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">
          You don&apos;t have permission to view this page.
        </p>
      </div>
    );
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    sendInvitation.mutate({ email, role, message: message || undefined });
  }

  return (
    <div className="space-y-6 sm:space-y-8 pb-16 md:pb-0">
      <PageHeader>
        <div>
          <PageTitle>Invitations</PageTitle>
          <PageDescription>
            Invite people to join Remi with a specific role.
          </PageDescription>
        </div>
      </PageHeader>

      {/* Send invitation form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <UserPlus className="size-5" />
            Send Invitation
          </CardTitle>
          <CardDescription>
            If the person already has a Remi account, they&apos;ll be made a
            secretary immediately. Otherwise, they&apos;ll receive an invitation
            to sign up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSend} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="inv-email">Email address</Label>
                <Input
                  id="inv-email"
                  type="email"
                  inputMode="email"
                  placeholder="person@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-role">Role</Label>
                <Select
                  value={role}
                  onValueChange={(v) =>
                    setRole(v as 'secretary' | 'steward' | 'judge')
                  }
                >
                  <SelectTrigger id="inv-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="secretary">Secretary</SelectItem>
                    <SelectItem value="steward">Steward</SelectItem>
                    <SelectItem value="judge">Judge</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-message">
                Personal message{' '}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <Textarea
                id="inv-message"
                placeholder="Add a personal note to the invitation email..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
              />
            </div>
            <Button
              type="submit"
              disabled={sendInvitation.isPending || !email}
            >
              {sendInvitation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Send Invitation
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Invitation history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">
            Invitation History
          </CardTitle>
          <CardDescription>
            {isAdmin
              ? 'All invitations sent through Remi.'
              : 'Invitations you have sent.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : !invitationList || invitationList.length === 0 ? (
            <EmptyState
              icon={UserPlus}
              title="No invitations sent yet"
              description="Send an invitation above to get started."
              variant="dashed"
            />
          ) : (
            <div className="space-y-2 sm:space-y-3">
              {invitationList.map((inv) => {
                const config =
                  STATUS_CONFIG[inv.status as keyof typeof STATUS_CONFIG] ??
                  STATUS_CONFIG.pending;
                const isExpired =
                  inv.status === 'pending' &&
                  new Date() > new Date(inv.expiresAt);
                const displayConfig = isExpired
                  ? STATUS_CONFIG.expired
                  : config;

                return (
                  <div
                    key={inv.id}
                    className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm sm:text-[0.9375rem] font-medium truncate">
                          {inv.email}
                        </span>
                        <Badge
                          className={cn(
                            'text-xs shrink-0',
                            displayConfig.color
                          )}
                        >
                          {displayConfig.label}
                        </Badge>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {inv.role.charAt(0).toUpperCase() +
                            inv.role.slice(1)}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span>
                          Sent{' '}
                          {format(
                            new Date(inv.createdAt),
                            'd MMM yyyy'
                          )}
                        </span>
                        {inv.invitedBy && (
                          <span>by {inv.invitedBy.name}</span>
                        )}
                        {inv.acceptedBy && (
                          <span>
                            Accepted by {inv.acceptedBy.name} (
                            {inv.acceptedBy.email})
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {inv.status === 'pending' && !isExpired && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          onClick={() => {
                            const url = `${window.location.origin}/invite/${inv.token}`;
                            navigator.clipboard.writeText(url);
                            toast.success('Link copied to clipboard');
                          }}
                        >
                          <Copy className="size-3.5" />
                          Copy Link
                        </Button>
                      )}
                      {inv.status === 'pending' && !isExpired && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-destructive hover:text-destructive"
                          onClick={() =>
                            revokeInvitation.mutate({ id: inv.id })
                          }
                          disabled={revokeInvitation.isPending}
                        >
                          <XCircle className="size-3.5" />
                          Revoke
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
