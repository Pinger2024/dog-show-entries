/**
 * pdf-kit/flow — a list of `{ heading, body }` blocks that fill pages
 * without ever orphaning a heading at the foot of a page. Generalises the
 * many one-off `minPresenceAhead` heading guards scattered through the
 * catalogue components (`catalogue-by-class.tsx`, `catalogue-ringside.tsx`,
 * `catalogue-judging.tsx`, `catalogue-marked.tsx`, …) into one component:
 * pass a heading + its body once, per block, and Flow keeps the heading
 * glued to the start of its body across a page break via `minPresenceAhead`
 * on the heading node.
 *
 * REACT-PDF LIMITATION DISCOVERED BUILDING THIS (relevant to the later
 * migration — read before wrapping Flow's output in anything):
 * `minPresenceAhead` only reliably "sees" the following content when the
 * element carrying it has NO intermediate wrapping `View` between it and
 * the page's own flow — nesting the heading+body pair inside even ONE
 * extra `<View>` (whether a per-block wrapper, or a single outer wrapper
 * around the whole list) silently defeats the look-ahead: the heading gets
 * orphaned alone on a page regardless of how large `minPresenceAhead` is
 * set (confirmed at 1, 5, 14, 28, 100, and 300 points — all identical,
 * broken, crossover height with a wrapping View present). Once the wrapper
 * is removed and the heading/body Views render as a flat sequence of
 * `React.Fragment`-grouped siblings, `minPresenceAhead`'s magnitude starts
 * mattering again exactly as documented. Confirmed against a real render,
 * see flow.test.tsx.
 *
 * Because of this, Flow deliberately renders NO wrapping element of its
 * own — `blocks.map(...)` returns a flat `React.Fragment` per block,
 * spreading heading+body directly into whatever parent renders `<Flow />`.
 * Render it as a direct child of a `<Page>` (or `<PageFrame>`) — or another
 * container that ISN'T itself `wrap={false}`/isolated from the page flow —
 * for the orphan protection to hold. There is no `style` prop for this
 * reason: an outer wrapping style would require an outer wrapping element,
 * which reintroduces the bug. Style each block's heading/body individually
 * via `headingStyle`/`bodyStyle`.
 *
 * This does NOT keep an entire body glued to its heading if the body is
 * longer than `keepWithHeadingHeight` — a body may still be arbitrarily
 * long and paginate normally past that point. For a block that must NEVER
 * split, use `KeepTogether` (or nest it inside a Flow block's `body`).
 */
import React from 'react';
import { View } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';

/** A conservative single body line's height at a typical 9–10pt body size
 *  with normal leading — used only when a block doesn't supply its own
 *  `keepWithHeadingHeight`. Pass an accurate value (e.g. from
 *  `measure.ts`'s `estimateTextHeight` for the body's actual font/size)
 *  whenever you have one; this default exists so Flow is usable without a
 *  measurement call for the common case.
 *
 *  Empirically 14 (a bare single-line estimate at 10pt) was NOT reliably
 *  enough in a real multi-block document test — one heading still orphaned
 *  with it (see flow.test.tsx's multi-block test, which caught this before
 *  it shipped). Matches `SectionTitle`'s own default, which the same test
 *  approach found robust with no orphan window even at 1pt sampling
 *  resolution. */
export const DEFAULT_FLOW_KEEP_WITH_HEADING = 28;

export interface FlowBlock {
  key: string;
  heading: React.ReactNode;
  body: React.ReactNode;
  /** Points of `body` that must stay with `heading` before a page break is
   *  allowed between them. Defaults to `DEFAULT_FLOW_KEEP_WITH_HEADING`. */
  keepWithHeadingHeight?: number;
  headingStyle?: Style;
  bodyStyle?: Style;
}

export interface FlowProps {
  blocks: FlowBlock[];
  /** Space after each block (except the last), in points — applied as
   *  `marginBottom` on the block's body. Defaults to 8. */
  gap?: number;
}

/**
 * Renders `blocks` as a FLAT sequence (no wrapping element — see the
 * file-level react-pdf limitation note above) of heading/body pairs, each
 * heading kept with the start of its body via `minPresenceAhead`. Must be
 * rendered directly into a page's normal flow (a `<Page>`/`<PageFrame>`, or
 * another un-isolated flow container) for that protection to hold.
 */
export function Flow({ blocks, gap = 8 }: FlowProps) {
  return (
    <>
      {blocks.map((block, i) => (
        <React.Fragment key={block.key}>
          <View
            wrap={false}
            minPresenceAhead={block.keepWithHeadingHeight ?? DEFAULT_FLOW_KEEP_WITH_HEADING}
            style={block.headingStyle}
          >
            {block.heading}
          </View>
          <View style={[block.bodyStyle ?? {}, i < blocks.length - 1 ? { marginBottom: gap } : {}]}>
            {block.body}
          </View>
        </React.Fragment>
      ))}
    </>
  );
}
