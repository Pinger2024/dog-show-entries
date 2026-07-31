'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, Send, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { CritiqueBlockCard, type BlockPatch } from '@/components/critiques/critique-block-card';
import type { CritiqueDisplayBlock } from '@/components/critiques/types';
import { publishGateStatus } from '@/lib/critique-publish-gate';

export function CritiqueSecretaryReview({
  showId,
  judgeId,
  onBack,
}: {
  showId: string;
  judgeId: string;
  onBack: () => void;
}) {
  const utils = trpc.useUtils();
  const { data, isLoading, refetch } = trpc.critiques.getForSecretary.useQuery({ showId, judgeId });
  const updateMutation = trpc.critiques.updateBlocks.useMutation();
  const publishMutation = trpc.critiques.publish.useMutation();
  const unpublishMutation = trpc.critiques.unpublish.useMutation();

  // Seeded once per judge, then edited purely locally — a background
  // refetch must never clobber the secretary's in-progress edits. Both
  // adjustments happen during render (React's documented pattern), not in
  // an effect: switching judges resets `blocks` to null, which then makes
  // the seed check fire on the very next render — each guard is a no-op
  // once satisfied, so neither can loop.
  const [blocks, setBlocks] = useState<CritiqueDisplayBlock[] | null>(null);
  const [seededForJudgeId, setSeededForJudgeId] = useState(judgeId);
  if (judgeId !== seededForJudgeId) {
    setSeededForJudgeId(judgeId);
    setBlocks(null);
  } else if (data && blocks === null) {
    setBlocks(data.blocks);
  }

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  function persist(next: CritiqueDisplayBlock[]) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateMutation.mutate({ showId, judgeId, blocks: next });
    }, 900);
  }

  function updateBlock(index: number, patch: BlockPatch) {
    setBlocks((prev) => {
      if (!prev) return prev;
      const next = prev.map((b, i) => (i === index ? { ...b, ...patch } : b));
      persist(next);
      return next;
    });
  }

  async function flush(next: CritiqueDisplayBlock[]) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await updateMutation.mutateAsync({ showId, judgeId, blocks: next });
  }

  async function handlePublish() {
    if (!blocks) return;
    try {
      await flush(blocks);
      await publishMutation.mutateAsync({ showId, judgeId });
      toast.success('Critiques published to the results page');
      await Promise.all([refetch(), utils.critiques.listForShow.invalidate({ showId })]);
    } catch (err) {
      toast.error('Could not publish', { description: (err as Error).message });
    }
  }

  async function handleUnpublish() {
    try {
      await unpublishMutation.mutateAsync({ showId, judgeId });
      toast.success('Unpublished — you can make changes and publish again');
      await Promise.all([refetch(), utils.critiques.listForShow.invalidate({ showId })]);
    } catch (err) {
      toast.error('Could not unpublish', { description: (err as Error).message });
    }
  }

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-8 animate-spin text-primary/40" />
      </div>
    );
  }

  const displayBlocks = blocks ?? data.blocks;
  const gate = publishGateStatus(displayBlocks);
  const isPublished = data.status === 'published';
  const canAttemptPublish = data.status === 'submitted' && gate.canPublish;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="flex min-h-[2.75rem] items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to judges
      </button>

      <div className="rounded-lg border p-3 sm:p-4">
        <p className="font-medium">{data.judge.name}</p>
        <p className="text-xs text-muted-foreground">
          {data.status === 'invited' && !data.hasUpload && "Hasn't uploaded their critiques yet"}
          {data.status === 'invited' && data.hasUpload && "Uploaded, but hasn't sent to you yet"}
          {data.status === 'submitted' && 'Sent to you — ready to check and publish'}
          {data.status === 'published' && 'Published to the results page'}
          {data.originalFilename ? ` · ${data.originalFilename}` : ''}
        </p>
      </div>

      {!data.hasUpload ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nothing to review yet — this judge hasn&apos;t uploaded their critiques.
        </p>
      ) : (
        <>
          <div className="space-y-3">
            {displayBlocks.map((block, i) => (
              <CritiqueBlockCard
                key={i}
                block={block}
                assignableOptions={data.assignableOptions}
                role="secretary"
                onChange={(patch) => updateBlock(i, patch)}
              />
            ))}
          </div>

          <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-sm">
              {isPublished ? (
                <span className="text-se-fresh-deep">Published — visible on the results page.</span>
              ) : data.status !== 'submitted' ? (
                <span className="text-muted-foreground">Waiting for the judge to send these.</span>
              ) : gate.canPublish ? (
                <span className="text-se-fresh-deep">Ready to publish.</span>
              ) : (
                <span className="text-se-honey-deep">
                  {gate.blockingCount} {gate.blockingCount === 1 ? 'critique needs' : 'critiques need'} checking
                  before you can publish.
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {isPublished ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="min-h-[2.75rem]" disabled={unpublishMutation.isPending}>
                      <Undo2 className="size-4" />
                      Unpublish
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Unpublish these critiques?</AlertDialogTitle>
                      <AlertDialogDescription>
                        They&apos;ll be removed from the results page. You can make changes and publish again
                        whenever you&apos;re ready.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep Published</AlertDialogCancel>
                      <AlertDialogAction onClick={handleUnpublish}>Yes, Unpublish</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <Button
                  className="min-h-[2.75rem]"
                  onClick={handlePublish}
                  disabled={!canAttemptPublish || publishMutation.isPending}
                >
                  {publishMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  Publish Critiques
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
