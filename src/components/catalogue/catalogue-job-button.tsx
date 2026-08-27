'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';

type Phase = 'idle' | 'preparing' | 'ready' | 'failed';

const POLL_INTERVAL_MS = 2000;

/**
 * Trigger a browser download of a cross-origin, presigned URL without
 * navigating the current page. The download attribute on a cross-origin
 * anchor is ignored by browsers, but that's fine here — the R2 presigned
 * URL always carries `Content-Disposition: attachment` (see
 * generatePresignedGetUrl), so the browser treats the click as a download
 * rather than a navigation regardless. A synchronous programmatic click,
 * not window.open(), so it isn't caught by popup blockers.
 */
function triggerDownload(url: string) {
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = '';
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } catch {
    window.location.assign(url);
  }
}

/**
 * Catalogue formats render as a background job, not a direct PDF stream
 * (2026-08-26 — a heavy catalogue render used to OOM-kill the single prod
 * web instance, so rendering moved to a separate worker process). Click →
 * enqueue → poll → the file downloads automatically the instant a poll (or
 * the initial request, if the render was already cached) reports "done" —
 * see triggerDownload above. Replaces PdfViewerButton's direct iframe embed
 * for the five catalogue formats served from /api/catalogue/[showId]/[format],
 * which now answers 202 {jobId,status} instead of a PDF.
 *
 * Reload while a job is queued/running: component state (`phase`,
 * `jobIdRef`) is local, so a reload always lands back on 'idle' — the
 * button shows its normal label, NOT "Preparing…", even though the job may
 * still be rendering server-side (2026-08-27 — prod's render worker only
 * ticks every 5 minutes now, see document-render-worker.ts, so "come back
 * later and tap it again" is the expected path, not an edge case). This is
 * fine, not a bug: `start()` always calls `documentJobs.request` on click
 * regardless of prior state, and `requestCatalogueJob` (catalogue-jobs.ts)
 * dedupes onto any existing queued/running/done job for the same
 * (show, format, snapshot), so re-tapping the button re-attaches to the
 * SAME job and resumes polling it rather than enqueuing a duplicate render.
 *
 * (2026-08-27 — a secretary's browser missed a poll tick because Safari
 * throttles timers in a backgrounded tab, so "ready" sat undetected for
 * ~30s and then still needed a manual click; measured 10:33:39 job created
 * → 10:33:47 rendered → 10:34:16 next poll landed.) Two mitigations: the
 * download now fires itself (no second tap needed), and a `visibilitychange`
 * listener forces an immediate poll the moment the tab regains focus rather
 * than waiting out the throttled interval. "Ready — Open" stays on screen
 * as the manual fallback for the rare browser that suppresses the
 * auto-download (e.g. a strict popup/download policy).
 *
 * The auto-download fires at most once per job, guarded by jobId.
 */
export function CatalogueJobButton({
  showId,
  format,
  icon,
  label = 'View',
  readyLabel = 'Ready — Open',
  variant = 'outline',
  className,
}: {
  showId: string;
  format: 'standard' | 'by-class' | 'judging' | 'absentees' | 'marked';
  icon: React.ReactNode;
  label?: string;
  /** Button text once the artefact is ready to open. */
  readyLabel?: string;
  variant?: 'outline' | 'default' | 'ghost';
  className?: string;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const jobIdRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  /** jobId of the job whose file we've already auto-downloaded — guards
   *  against re-firing the download if applyStatus is ever invoked twice
   *  for the same "done" job. */
  const autoDownloadedJobIdRef = useRef<string | null>(null);

  const utils = trpc.useUtils();
  const requestJob = trpc.documentJobs.request.useMutation();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function applyStatus(jobId: string, status: { status: string; error: string | null; downloadUrl?: string }) {
    if (!mountedRef.current || jobIdRef.current !== jobId) return;
    if (status.status === 'done') {
      setPhase('ready');
      setDownloadUrl(status.downloadUrl ?? null);
      if (status.downloadUrl && autoDownloadedJobIdRef.current !== jobId) {
        autoDownloadedJobIdRef.current = jobId;
        triggerDownload(status.downloadUrl);
      }
      return;
    }
    if (status.status === 'failed') {
      setPhase('failed');
      setError(status.error ?? 'The catalogue could not be generated.');
      return;
    }
    timerRef.current = setTimeout(() => void poll(jobId), POLL_INTERVAL_MS);
  }

  async function poll(jobId: string) {
    if (!mountedRef.current || jobIdRef.current !== jobId) return;
    try {
      const status = await utils.documentJobs.status.fetch({ jobId });
      applyStatus(jobId, status);
    } catch (err) {
      if (!mountedRef.current || jobIdRef.current !== jobId) return;
      setPhase('failed');
      setError((err as Error).message);
    }
  }

  // Safari (and others) throttle setTimeout in a backgrounded tab, so the
  // 2s poll can lag well behind the actual render finishing. Re-check the
  // moment the tab comes back into view instead of waiting it out.
  useEffect(() => {
    if (phase !== 'preparing') return;
    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') return;
      const jobId = jobIdRef.current;
      if (!jobId) return;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      void poll(jobId);
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    // `poll` is a plain function recreated every render but always reads
    // current refs (jobIdRef/mountedRef) and calls the current
    // `applyStatus`, so it's safe to omit here; adding it would just
    // re-run this effect (and re-attach the listener) on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function start() {
    setPhase('preparing');
    setError(null);
    setDownloadUrl(null);
    try {
      const result = await requestJob.mutateAsync({ showId, format });
      jobIdRef.current = result.jobId;
      if (result.status === 'done') {
        const status = await utils.documentJobs.status.fetch({ jobId: result.jobId });
        applyStatus(result.jobId, status);
        return;
      }
      timerRef.current = setTimeout(() => void poll(result.jobId), POLL_INTERVAL_MS);
    } catch (err) {
      setPhase('failed');
      const message = (err as Error).message;
      setError(message);
      toast.error(`Couldn't prepare the catalogue — ${message}`);
    }
  }

  if (phase === 'ready' && downloadUrl) {
    return (
      <div className="flex flex-col gap-1">
        <Button variant="default" className={`min-h-[2.75rem] ${className ?? ''}`} asChild>
          <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
            {icon}
            {readyLabel}
          </a>
        </Button>
        <p className="text-xs text-muted-foreground">
          Your download has started — press Open if it didn&apos;t.
        </p>
      </div>
    );
  }

  if (phase === 'failed') {
    return (
      <div className="flex flex-col gap-1">
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button variant="outline" className={`min-h-[2.75rem] ${className ?? ''}`} onClick={() => void start()}>
          <RotateCcw className="size-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (phase === 'preparing') {
    // A short label ON the button (so it never overflows or wraps mid-word
    // on a phone) plus the full explanation as a small caption underneath —
    // not crammed into the button itself. max-w keeps the sentence wrapping
    // in a calm 2–3 line block rather than stretching edge-to-edge.
    return (
      <div className="flex flex-col items-start gap-1">
        <Button variant={variant} className={`min-h-[2.75rem] ${className ?? ''}`} disabled>
          <Loader2 className="size-4 animate-spin" />
          Preparing…
        </Button>
        <p className="max-w-[16rem] text-xs text-muted-foreground">
          Preparing your catalogue — usually ready within a few minutes. You can carry on and come back.
        </p>
      </div>
    );
  }

  return (
    <Button variant={variant} className={`min-h-[2.75rem] ${className ?? ''}`} onClick={() => void start()}>
      {icon}
      {label}
    </Button>
  );
}
