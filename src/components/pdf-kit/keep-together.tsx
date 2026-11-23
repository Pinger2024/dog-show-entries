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

  // @react-pdf/layout reads this prop with `'minPresenceAhead' in props`
  // (not `!= null`) to decide between the element's own value and its
  // internal default of 0 — so `minPresenceAhead={undefined}` is NOT the
  // same as omitting the prop entirely. The key's mere presence makes the
  // engine read back `undefined`, which poisons its own arithmetic
  // (`child.box.top + child.box.height + child.box.marginBottom +
  // undefined` = NaN) and silently disables the page-break-before-a-
  // trailing-margin protection every ordinary View gets for free. Spread
  // the prop only when the caller actually supplied a value, so a plain
  // `<KeepTogether>` with no `minPresenceAhead` behaves exactly like the
  // `<View wrap={false}>` it replaces — confirmed by a real golden-render
  // regression during the front-matter-on-kit migration (a `KeepTogether`
  // swap silently reflowed page breaks on two real shows' catalogues
  // before this fix; see keep-together.test.tsx's
  // "identical to a plain wrap={false} View" case).
  const minPresenceAheadProp = minPresenceAhead !== undefined ? { minPresenceAhead } : {};

  return (
    <View style={style} wrap={tooTallForOnePage} {...minPresenceAheadProp}>
      {children}
    </View>
  );
}
