'use client';

/**
 * Autosave hook for the dog form's data-loss-prone sections (Mandy
 * 2026-07-11 — an exhibitor lost sire/dam registration + health details to
 * an unpressed second save button).
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

export type DogAutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export type DogAutosavePayload = {
  dog?: Record<string, unknown>;
  svProfile?: Record<string, unknown>;
};

export function useDogAutosave({
  dogId,
  enabled,
  hydrated,
  payload,
  onSaved,
}: {
  dogId: string | undefined;
  /** Master switch — false in create mode (no dog row to save onto yet). */
  enabled: boolean;
  /** True only once the form state reflects the SERVER's data, never the
   *  blank defaults. Nothing is captured or sent before this. */
  hydrated: boolean;
  payload: DogAutosavePayload;
  onSaved?: () => void;
}): DogAutosaveStatus {
  const [status, setStatus] = useState<DogAutosaveStatus>('idle');
  const latestPayloadRef = useRef<string | null>(null);
  const baselineRef = useRef<string | null>(null);
  const lastSavedRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const serialized = JSON.stringify(payload);
  const active = enabled && !!dogId;

  useEffect(() => {
    if (!active || !hydrated) return;

    // First hydrated snapshot is the baseline — an untouched form never
    // saves (and never beacons) at all.
    if (baselineRef.current === null) {
      baselineRef.current = serialized;
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
        const res = await fetch(`/api/dog-autosave/${dogId}`, {
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
  }, [serialized, active, hydrated, dogId]);

  // Unmount beacon — delivers whatever the debounce hadn't flushed yet.
  useEffect(() => {
    if (!active) return;
    return () => {
      const latest = latestPayloadRef.current;
      if (latest !== null && latest !== lastSavedRef.current) {
        navigator.sendBeacon(
          `/api/dog-autosave/${dogId}`,
          new Blob([latest], { type: 'application/json' }),
        );
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, dogId]);

  return status;
}
