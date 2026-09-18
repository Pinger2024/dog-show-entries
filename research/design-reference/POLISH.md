# Layer 2 — beyond the mock ("smash the ceiling")

The `.original.jsx` files define the static bar. This file defines the living
layer — what the mock cannot show. Rules: subtle over showy; every animation
respects `prefers-reduced-motion`; nothing blocks interaction; 60fps only
(transform/opacity, no layout-thrashing animations); mobile-first.

## Feel

1. **Buttons** — press: scale(0.98) + shadow tightens (transition 120ms
   ease-out). Hover (desktop): fresh/primary lift shadow slightly
   (`0 12px 26px -12px`), ghost gains a line2→ink3 ring shift. Focus-visible:
   2px se-fresh ring offset 2.
2. **Cards** — desktop hover on interactive cards (browse ShowCard, rail
   cards): translateY(-1px) + shadow deepens, 160ms. No hover motion on
   static info cards.
3. **Countdown** — when a cell's value changes, the digit crossfades/slides
   up 0.3s (single transform, tabular-nums so no width shift). Under 24h to
   close, the honey banner's Eyebrow gains the Pulse dot.
4. **Chips with Pulse** — the halo breathes (scale 1→1.35 opacity .3→0,
   2s infinite) — CSS only.
5. **Hero** — the radial fresh glow drifts very slowly (translate 8px over
   30s alternate). Imperceptible but alive. Reduced-motion: static.
6. **Section entrances** — mobile show page sections fade+rise 8px on first
   scroll into view (IntersectionObserver, once, 240ms, stagger none).
   Reduced-motion: off.
7. **Enter flow** — step transitions: outgoing step fades 80ms, incoming
   rises 8px/160ms. Checkbox check: path draw or scale-in 140ms. Class-row
   price color transition 150ms. Sticky-bar total: brief scale pop (1→1.06→1,
   180ms) when the amount changes.
8. **Confirmation** — the check disc springs in (scale 0.6→1, 260ms
   spring-ish cubic-bezier) THEN a one-shot confetti burst in theme colors
   (se-fresh, se-honey, se-cream, se-green), ~1.2s, canvas or CSS particles,
   fires once per confirmation. This is a Mandy delight moment — do it
   properly. Reduced-motion: disc fades in, no confetti.
9. **Copy-link feedback** — button morphs to "Copied ✓" in-place for 1.6s
   (no toast dependency), then reverts.
10. **Skeletons** — any loading state on the re-skinned surfaces uses
    se-paper2 shimmer blocks matching the final layout (no spinner soup),
    e.g. browse list while near-me resolves.
11. **Images** — club crest and any photos fade in on load (opacity 200ms)
    to avoid pop-in.
12. **Scroll polish** — honey banner in the hero: no parallax (busy), but
    the sticky action bar's appearance animates (translateY -8px → 0 +
    fade, 200ms) when it first sticks.

## Craft details

13. **Club crest treatment** — follow the design's ClubLogo philosophy:
    circle-crop `object-cover` (never a square logo floating on a white
    plate), ring + soft lift shadow. Initials fallback keeps the same disc.
14. **Text rendering** — `text-wrap: balance` on the hero H1 and section
    headings; `text-wrap: pretty` on FAQ/body paragraphs (design already
    specifies both — verify applied).
15. **Tabular numerals** on every fee, total, countdown and date-tile digit.
16. **Selection color** — `::selection` in se-fresh-soft/se-ink within
    `.show-exp` (tiny, felt).
17. **Overscroll** — the dark hero should not reveal a white band on iOS
    rubber-band: paint `background-color: var(--color-se-deep)` behind the
    page top (html/body scoped to these routes or a fixed backstop div).

## Explicitly NOT doing

- Parallax, marquee, auto-playing anything, scroll-jacking.
- Toast libraries, lottie, new heavy deps. Confetti = tiny hand-rolled
  canvas (~60 lines) or CSS particles, no package.
- Animation on the payment step (untouched zone).
