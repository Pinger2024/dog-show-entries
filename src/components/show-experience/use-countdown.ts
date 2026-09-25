'use client';

import { useEffect, useState } from 'react';
import { differenceInSeconds } from 'date-fns';

/**
 * Ticking countdown to a target Date (1s interval).
 *
 * Extracted verbatim from the battle-tested `useCountdown` in
 * `src/app/(shows)/shows/[id]/preview/show-preview.tsx` so the Show
 * Experience kit (and show-preview.tsx itself) share one implementation.
 */
export function useCountdown(target: Date | null) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => tick((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [target]);
  if (!target) return null;
  const secs = Math.max(0, differenceInSeconds(target, new Date()));
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return { d, h, m, s, totalSecs: secs };
}
