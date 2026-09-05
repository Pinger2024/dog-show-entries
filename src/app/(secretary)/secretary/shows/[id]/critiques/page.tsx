'use client';

import { useState } from 'react';
import { Copy, Loader2, Mail, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useShowId } from '../_lib/show-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CritiqueSecretaryReview } from './_components/critique-secretary-review';

type DocStatus = 'invited' | 'submitted' | 'published' | null;

function StatusChip({ status }: { status: DocStatus }) {
  switch (status) {
    case 'published':
      return <Badge className="border-se-fresh-line bg-se-fresh-soft text-se-fresh-deep">Published</Badge>;
    case 'submitted':
      return <Badge className="border-se-honey-line bg-se-honey-soft text-se-honey-deep">Submitted</Badge>;
    case 'invited':
      return <Badge variant="secondary">Invited</Badge>;
    default:
      return <Badge variant="outline">Not invited</Badge>;
  }
}

export default function SecretaryCritiquesPage() {
  const showId = useShowId();
  const utils = trpc.useUtils();
  const { data: judgeRows, isLoading } = trpc.critiques.listForShow.useQuery({ showId });
  const inviteMutation = trpc.critiques.invite.useMutation();

  const [selectedJudgeId, setSelectedJudgeId] = useState<string | null>(null);
  const [inviteFor, setInviteFor] = useState<{ judgeId: string; judgeName: string } | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');

  async function handleInvite() {
    if (!inviteFor) return;
    if (!inviteEmail.trim()) {
      toast.error('Please enter an email address');
      return;
    }
    try {
      const result = await inviteMutation.mutateAsync({
        showId,
        judgeId: inviteFor.judgeId,
        email: inviteEmail.trim(),
      });
      await utils.critiques.listForShow.invalidate({ showId });
      setInviteFor(null);
      if (result.emailSent) {
        toast.success(`Invite sent to ${inviteFor.judgeName}`);
      } else {
        toast.error("Couldn't send the email — copy the link instead and send it another way.", {
          duration: 8000,
        });
      }
    } catch (err) {
      toast.error('Could not invite this judge', { description: (err as Error).message });
    }
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy the link');
    }
  }

  if (selectedJudgeId) {
    return (
      <CritiqueSecretaryReview
        showId={showId}
        judgeId={selectedJudgeId}
        onBack={() => setSelectedJudgeId(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-lg font-semibold sm:text-xl">Judge Critiques</h2>
        <p className="text-sm text-muted-foreground">
          Invite the judge to send their critiques, check them, and publish to the results page.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-8 animate-spin text-primary/40" />
        </div>
      ) : !judgeRows || judgeRows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No judges assigned to this show yet — add judges under People first.
        </p>
      ) : (
        <div className="space-y-2">
          {judgeRows.map((j) => (
            <div
              key={j.judgeId}
              className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{j.judgeName}</p>
                  <StatusChip status={j.document?.status ?? null} />
                </div>
                {j.document?.submittedAt && (
                  <p className="text-xs text-muted-foreground">
                    Sent {new Date(j.document.submittedAt).toLocaleDateString('en-GB')}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {j.document?.status !== 'published' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-[2.75rem]"
                    onClick={() => {
                      setInviteFor({ judgeId: j.judgeId, judgeName: j.judgeName });
                      setInviteEmail(j.document?.invitedEmail ?? j.contactEmail ?? '');
                    }}
                  >
                    <Mail className="size-4" />
                    {j.document ? 'Re-invite' : 'Invite'}
                  </Button>
                )}
                {j.document && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-[2.75rem]"
                    onClick={() => copyLink(j.document!.link)}
                  >
                    <Copy className="size-4" />
                    Copy Link
                  </Button>
                )}
                {(j.document?.hasUpload || j.document?.status === 'published') && (
                  <Button size="sm" className="min-h-[2.75rem]" onClick={() => setSelectedJudgeId(j.judgeId)}>
                    <MessageSquare className="size-4" />
                    {j.document.status === 'published' ? 'View' : 'Review'}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!inviteFor} onOpenChange={(open) => !open && setInviteFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite {inviteFor?.judgeName}</DialogTitle>
            <DialogDescription>
              We&apos;ll email them a link to send their critiques — no login needed. You can also copy
              the link afterwards and send it another way, e.g. WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="critique-invite-email">Email address</Label>
            <Input
              id="critique-invite-email"
              type="email"
              className="min-h-[2.75rem]"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="judge@example.com"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setInviteFor(null)}>
              Cancel
            </Button>
            <Button className="min-h-[2.75rem]" onClick={handleInvite} disabled={inviteMutation.isPending}>
              {inviteMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Send Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
