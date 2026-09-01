/**
 * pdf-kit/keep-together — a `wrap={false}` block, generalising the 100+
 * ad-hoc `wrap={false}` call sites across the catalogue/schedule/judges-book
 * components (e.g. `InfoCard` and `ImportantShowNotices`'s notice items in
 * `schedule/shared/elements.tsx`, every `wrap={false}` row in
 * `catalogue-ringside.tsx`/`catalogue-marked.tsx`).
 *
 * THE ESCAPE HATCH: `wrap={false}` tells react-pdf "never split this block
 * across a page boundary" — for a block genuinely taller than one page,
 * that doesn't paginate it, it silently overflows the page (content runs
 * off the bottom edge). `KeepTogether` therefore accepts an
 * `estimatedHeight`/`maxHeight` pair (get both from `measure.ts` and the
 * page's usable height) and falls back to normal wrapping — the content
 * still won't be lost, it will just start pagination on its own — rather
 * than overflow. Pass `forceWrap` directly if you've already made that
 * decision elsewhere.
 */
import React from 'react';
import { View } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';

export interface KeepTogetherProps {
  children: React.ReactNode;
  style?: Style;
  /** Passed straight through to the wrapping `View` — e.g. so this block's
   *  first line stays with a heading that precedes it. */
  minPresenceAhead?: number;
  /** This block's estimated height (points) — from `measure.ts`'s
   *  `estimateTextHeight`/`estimateLineCount`, or a caller's own known
   *  fixed height. Compared against `maxHeight` to decide whether
   *  `wrap={false}` is safe. Omit either prop to skip the check (the block
   *  always renders `wrap={false}`, matching every existing hand-written
   *  call site's behaviour today). */
  estimatedHeight?: number;
  /** The usable height (points) available to this block — typically a
   *  `PageFrame`'s page height minus margins/known header+footer height. */
  maxHeight?: number;
  /** Skip the height check and force normal wrapping regardless. */
  forceWrap?: boolean;
}

export function KeepTogether({
  children,
  style,
  minPresenceAhead,
  estimatedHeight,
  maxHeight,
  forceWrap,
}: KeepTogetherProps) {
  const tooTallForOnePage =
    forceWrap === true ||
    (estimatedHeight != null && maxHeight != null && estimatedHeight > maxHeight);

  return (
    <View style={style} wrap={tooTallForOnePage} minPresenceAhead={minPresenceAhead}>
      {children}
    </View>
  );
}
