/**
 * pdf-kit/flow — a list of `{ heading, body }` blocks that fill pages
 * without ever orphaning a heading at the foot of a page. Generalises the
 * many one-off `minPresenceAhead` heading guards scattered through the
 * catalogue components (`catalogue-by-class.tsx`, `catalogue-ringside.tsx`,
 * `catalogue-judging.tsx`, `catalogue-marked.tsx`, …) into one component:
 * pass a heading + its body once, per block, and Flow keeps the heading
 * glued to the start of its body across a page break — react-pdf's
 * `minPresenceAhead` looks at FOLLOWING SIBLINGS within N points, so it
 * only needs to sit on the heading's own node with the body immediately
 * after it in the tree, which is exactly Flow's structure.
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
 *  measurement call for the common case. */
export const DEFAULT_FLOW_KEEP_WITH_HEADING = 14;

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
  /** Space between consecutive blocks, in points. Defaults to 8. */
  gap?: number;
  style?: Style;
}

export function Flow({ blocks, gap = 8, style }: FlowProps) {
  return (
    <View style={style}>
      {blocks.map((block, i) => (
        <View key={block.key} style={i < blocks.length - 1 ? { marginBottom: gap } : undefined}>
          <View
            wrap={false}
            minPresenceAhead={block.keepWithHeadingHeight ?? DEFAULT_FLOW_KEEP_WITH_HEADING}
            style={block.headingStyle}
          >
            {block.heading}
          </View>
          <View style={block.bodyStyle}>{block.body}</View>
        </View>
      ))}
    </View>
  );
}
