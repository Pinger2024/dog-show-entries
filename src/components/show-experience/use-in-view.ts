'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Reveals its target once when scrolled into view: fade + 8px rise (apply
 * `transition-all duration-[240ms] ease-out motion-reduce:transition-none`
 * plus `opacity-100 translate-y-0` / `opacity-0 translate-y-2` from
 * `visible` on the element the ref is attached to).
 *
 * Progressive enhancement, SSR-safe: `visible` starts `true` so content
 * renders normally with no JS, under `prefers-reduced-motion: reduce`, and
 * pre-hydration — nothing is ever blanked. Only once mounted, with motion
 * allowed, and the element not already on screen does this hide-then-reveal
 * on scroll; anything already in the viewport at mount is left alone.
 */
export function useInView<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const rect = el.getBoundingClientRect();
    const alreadyVisible = rect.top < window.innerHeight && rect.bottom > 0;
    if (alreadyVisible) return;

    setVisible(false);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

/**
 * Fires `stuck` once when a sentinel placed immediately before a
 * `position: sticky` element scrolls past `topOffsetPx` (the sticky
 * element's `top` offset) — i.e. the moment the sticky element actually
 * starts sticking. Intended to trigger a one-shot "just stuck" entrance
 * class (e.g. `animate-in fade-in slide-in-from-top-2`) on that element.
 *
 * No-ops under `prefers-reduced-motion: reduce` (stuck stays false — callers
 * should have a static default appearance either way).
 */
export function useStuckReveal<T extends HTMLElement>(topOffsetPx: number) {
  const sentinelRef = useRef<T | null>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          setStuck(true);
          observer.disconnect();
        }
      },
      { rootMargin: `-${topOffsetPx}px 0px 0px 0px`, threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [topOffsetPx]);

  return { sentinelRef, stuck };
}
