'use client';

import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import {
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { SECard, Wordmark } from '@/components/show-experience/kit';
import { CritiqueBlockCard, type BlockPatch } from '@/components/critiques/critique-block-card';
import type { CritiqueDisplayBlock } from '@/components/critiques/types';
import { CritiqueUploadForm } from './_components/critique-upload-form';

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-3 py-10 sm:px-4">
      <SECard className="flex w-full max-w-sm flex-col gap-6">{children}</SECard>
    </div>
  );
}

function Header({ showName, judgeName }: { showName: string; judgeName: string }) {
  return (
    <div className="text-center">
      <Link href="/" className="inline-flex justify-center">
        <Wordmark size={22} />
      </Link>
      <h1 className="mt-3 font-serif text-xl font-semibold sm:text-2xl">{showName}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Critiques from {judgeName}</p>
    </div>
  );
}

export default function JudgeCritiquePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const { data, isLoading, error, refetch } = trpc.critiques.getByToken.useQuery(
    { token },
    { retry: false },
  );
  const saveMutation = trpc.critiques.saveBlocksByToken.useMutation();
  const submitMutation = trpc.critiques.submitByToken.useMutation();

  // Seeded once from the server, then edited purely locally — refetches
  // (e.g. from React Query's background refresh) must never clobber
  // in-progress edits. Adjusted during render (React's documented pattern
  // for "derive state from a prop the first time it's available") rather
  // than in an effect — the `blocks === null` guard makes this a no-op on
  // every render after the first seed, so it can't loop.
  const [blocks, setBlocks] = useState<CritiqueDisplayBlock[] | null>(null);
  const [showReupload, setShowReupload] = useState(false);
  // Only seed once an upload exists — the pre-upload fetch carries an empty
  // blocks array, and seeding that would permanently mask the real blocks
  // the refetch brings back after the upload ([] is truthy, so the
  // `blocks ?? data.blocks` fallback never kicks in).
  if (data && blocks === null && data.hasUpload) {
    setBlocks(data.blocks);
  }

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  function updateBlock(index: number, patch: BlockPatch) {
    setBlocks((prev) => {
      if (!prev) return prev;
      const next = prev.map((b, i) => (i === index ? { ...b, ...patch } : b));
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveMutation.mutate({ token, blocks: next });
      }, 900);
      return next;
    });
  }

  async function handleSend() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (blocks) {
      try {
        await saveMutation.mutateAsync({ token, blocks });
      } catch (err) {
        toast.error('Could not save your changes', { description: (err as Error).message });
        return;
      }
    }
    try {
      await submitMutation.mutateAsync({ token });
      await refetch();
    } catch (err) {
      toast.error('Could not send your critiques', { description: (err as Error).message });
    }
  }

  if (isLoading) {
    return (
      <CenteredCard>
        <CardContent className="flex flex-col items-center py-12">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
        </CardContent>
      </CenteredCard>
    );
  }

  if (error || !data) {
    return (
      <CenteredCard>
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="size-6 text-destructive" />
          </div>
          <CardTitle className="font-serif text-lg sm:text-xl">Link Not Found</CardTitle>
          <CardDescription>
            This link isn&apos;t valid. Please ask the show secretary to send you a new one.
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Button asChild>
            <Link href="/">Go to Home</Link>
          </Button>
        </CardFooter>
      </CenteredCard>
    );
  }

  if (data.status === 'published') {
    return (
      <CenteredCard>
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-se-fresh-soft">
            <CheckCircle2 className="size-6 text-se-fresh-deep" />
          </div>
          <CardTitle className="font-serif text-lg sm:text-xl">Published</CardTitle>
          <CardDescription>
            Your critiques for <strong>{data.show.name}</strong> are now live on the results page.
            Thank you!
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Button asChild className="min-h-[2.75rem]">
            <Link href={`/shows/${data.show.id}/results`}>View Results</Link>
          </Button>
        </CardFooter>
      </CenteredCard>
    );
  }

  if (data.status === 'submitted') {
    return (
      <CenteredCard>
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-se-fresh-soft">
            <CheckCircle2 className="size-6 text-se-fresh-deep" />
          </div>
          {/* Full name, never a "first name" split — judges' names start
              with honorifics ("Mrs J Henderson" → "Thank You, Mrs"). */}
          <CardTitle className="font-serif text-lg sm:text-xl">
            Thank You{data.judge.name ? `, ${data.judge.name}` : ''}
          </CardTitle>
          <CardDescription>
            Your critiques for <strong>{data.show.name}</strong> have been sent to the secretary.
            They&apos;ll check them over and publish them soon.
          </CardDescription>
        </CardHeader>
      </CenteredCard>
    );
  }

  if (!data.hasUpload || showReupload) {
    return (
      <div className="mx-auto w-full max-w-lg px-3 py-10 sm:px-4">
        <Header showName={data.show.name} judgeName={data.judge.name} />
        <SECard className="mt-4">
          <CardContent className="pt-6">
            <CritiqueUploadForm
              token={token}
              onUploaded={() => {
                // Reset the locally-edited copy so the fresh parse displays
                // (a re-upload replaces the document wholesale).
                setBlocks(null);
                setShowReupload(false);
                void refetch();
              }}
            />
            {showReupload && (
              <button
                type="button"
                className="mx-auto mt-3 block min-h-[2.75rem] text-sm text-muted-foreground underline hover:text-foreground"
                onClick={() => setShowReupload(false)}
              >
                Keep what I already sent
              </button>
            )}
          </CardContent>
        </SECard>
      </div>
    );
  }

  const displayBlocks = blocks ?? data.blocks;
  // Wrong-document guard: a judge uploading last year's (or another show's)
  // critiques gets hundreds of "needs a home" cards and no idea why. If not
  // a single critique matched a class on this show, say so plainly up top.
  const nothingMatched =
    displayBlocks.length > 0 && !displayBlocks.some((b) => b.matchedEntryClassId !== null);

  return (
    <div className="mx-auto w-full max-w-2xl px-3 pb-28 pt-10 sm:px-4">
      <Header showName={data.show.name} judgeName={data.judge.name} />
      <p className="mt-3 text-center text-sm text-muted-foreground">
        Please check these over. Green ticks are ready to go — amber ones need a quick look.
      </p>
      {nothingMatched && (
        <div className="mt-4 rounded-lg border border-se-honey-line bg-se-honey-soft p-4 text-sm text-se-honey-deep">
          <p className="font-medium">None of these matched the classes at {data.show.name}.</p>
          <p className="mt-1">
            This usually means the wrong document was uploaded — please check it&apos;s the right
            one and replace it.
          </p>
          <Button
            type="button"
            size="sm"
            className="mt-3 min-h-[2.75rem]"
            onClick={() => setShowReupload(true)}
          >
            Upload a different document
          </Button>
        </div>
      )}
      <div className="mt-5 space-y-3">
        {displayBlocks.map((block, i) => (
          <CritiqueBlockCard
            key={i}
            block={block}
            assignableOptions={data.assignableOptions}
            role="judge"
            onChange={(patch) => updateBlock(i, patch)}
          />
        ))}
      </div>
      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 p-3 backdrop-blur sm:sticky sm:mt-6 sm:border-t-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <div className="mx-auto flex max-w-2xl justify-center">
          <Button
            size="lg"
            className="min-h-[2.75rem] w-full max-w-xs shadow-lg"
            onClick={handleSend}
            disabled={submitMutation.isPending}
          >
            {submitMutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Send to the Secretary
          </Button>
        </div>
      </div>
    </div>
  );
}
