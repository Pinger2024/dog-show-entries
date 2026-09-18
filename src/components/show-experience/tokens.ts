/* ============================================================
 * Show Experience (green) — plain, server-safe design tokens.
 *
 * Deliberately NOT 'use client'. kit.tsx (the presentational component
 * kit) is 'use client', which means anything importing a value from it
 * receives a client-reference proxy when that import happens inside a
 * Server Component — clsx/twMerge/cn then silently drop it, because the
 * proxy doesn't stringify the way a plain string does. That bug shipped
 * SE_H-less headings on every server-rendered page (homepage, about,
 * features, pricing, help, reviews, terms, privacy, for-secretaries, and
 * more) even though the source looked correct.
 *
 * Token-only values with no React/hooks/client dependencies live here
 * instead, so both Server and Client Components get the real string.
 * kit.tsx re-exports from this module for back-compat.
 * ============================================================ */

/* ─── SE_H ───────────────────────────────────────── */
/* The design's unoverridden heading recipe (H = { fontWeight: 800,
 * letterSpacing: -0.015em } under the "friendly"/Hanken Grotesk fontset).
 * Compose per-heading overrides on top, e.g. cn(SE_H, 'text-2xl'). */

export const SE_H = 'font-extrabold tracking-[-0.015em]';
