'use client';

/**
 * Generic autosave: debounced keepalive fetch + unmount beacon. First used
 * by the dog form's data-loss-prone sections (Mandy 2026-07-11 — an
 * exhibitor lost sire/dam registration + health details to an unpressed
 * second save button); domain-neutral so the next autosave surface (e.g.
 * the schedule form's inline copy of this pattern) can adopt it without
 * touching this module.
 *
 * Two delivery paths, copied from the schedule-settings autosave that
 * survived the 2026-04-22 wipe incident:
 *   1. While mounted: debounced POST to /api/dog-autosave/[dogId]
 *      (keepalive fetch — unlike a tRPC mutation it isn't aborted when the
 *      component unmounts mid-flight).
 *   2. On unmount: `navigator.sendBeacon()` with the latest snapshot, so
 *      "type then immediately hit Back" still lands.
 *
 * THE hydration guard: `latestPayloadRef` is only ever populated once the
 * caller says `hydrated` — before that, the beacon has nothing to send, so
 * an unhydrated form's blank defaults can never overwrite saved data. The
 * server route's wipe guard backstops this independently.
 */
import { useEffect, useRef, useState } from 'react';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useBeaconAutosave({
  url,
  enabled,
  hydrated,
  payload,
  onSaved,
}: {
  /** Autosave endpoint, e.g. `/api/dog-autosave/<dogId>`. Undefined
   *  disables the hook (no target to save to yet). */
  url: string | undefined;
  /** Master switch — e.g. false in a create flow with no row to save onto. */
  enabled: boolean;
  /** True only once the form state reflects the SERVER's data, never the
   *  blank defaults. Nothing is captured or sent before this. */
  hydrated: boolean;
  payload: Record<string, unknown>;
  onSaved?: () => void;
}): AutosaveStatus {
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const latestPayloadRef = useRef<string | null>(null);
  const hasBaselineRef = useRef(false);
  const lastSavedRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const serialized = JSON.stringify(payload);
  const active = enabled && !!url;

  useEffect(() => {
    if (!active || !hydrated) return;

    // First hydrated snapshot is the baseline — an untouched form never
    // saves (and never beacons) at all.
    if (!hasBaselineRef.current) {
      hasBaselineRef.current = true;
      lastSavedRef.current = serialized;
      latestPayloadRef.current = serialized;
      return;
    }

    latestPayloadRef.current = serialized;
    if (serialized === lastSavedRef.current) return;

    setStatus('saving');
    if (timerRef.current) clearTimeout(timerRef.current);
    const snapshot = serialized;
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(url!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: snapshot,
          keepalive: true,
        });
        if (!res.ok) throw new Error(String(res.status));
        lastSavedRef.current = snapshot;
        setStatus('saved');
        onSavedRef.current?.();
      } catch {
        setStatus('error');
      }
    }, 700);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized, active, hydrated, url]);

  // Unmount beacon — delivers whatever the debounce hadn't flushed yet.
  useEffect(() => {
    if (!active) return;
    return () => {
      const latest = latestPayloadRef.current;
      if (latest !== null && latest !== lastSavedRef.current) {
        navigator.sendBeacon(url!, new Blob([latest], { type: 'application/json' }));
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, url]);

  return status;
}
