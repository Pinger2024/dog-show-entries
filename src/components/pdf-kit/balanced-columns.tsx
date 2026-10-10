/**
 * pdf-kit/balanced-columns — splits a list of items into N columns by
 * MEASURED HEIGHT, not by count. Lists like officials, sponsors, or an
 * exhibitor index are naturally uneven (an official's line may be one
 * sentence, or three; a sponsor block may carry a logo) — dividing by
 * `Math.ceil(items.length / columns)` alone routinely leaves one column
 * visibly taller than the others.
 *
 * `balanceColumns` is exported standalone (pure, no react-pdf import) so it
 * can be unit-tested with plain height numbers, independent of layout.
 */
import React from 'react';
import { View } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';

export interface HeightedItem {
  height: number;
}

/**
 * Greedy left-to-right fill: walks items in order, advancing to the next
 * column once the current one has reached its fair share of the
 * REMAINING height over the REMAINING columns — recomputed after every
 * advance, not a single `totalHeight / columns` fixed upfront. A fixed
 * upfront target starves later columns whenever one early item is much
 * taller than average (a big sponsor logo block, say): the first column
 * alone can blow past the global target, and every following column then
 * measures itself against that same too-low number and never triggers
 * another advance — leaving a column, or several, completely empty even
 * though items remain. Recomputing against what's actually left avoids
 * that. A column only advances once it already holds at least one item
 * (never emitted empty while items remain to fill it), and columns never
 * exceed the requested count — the LAST column absorbs whatever's left,
 * so rounding error lands there rather than creating an extra column.
 *
 * This is a heuristic (single left-to-right pass, not an optimal
 * partition) — it is intentionally simple and deterministic rather than
 * hunting for the mathematically most-balanced split, matching the
 * complexity a page-layout heuristic warrants.
 */
export function balanceColumns<T extends HeightedItem>(items: readonly T[], columns: number): T[][] {
  if (columns < 1) {
    throw new Error(`pdf-kit balanceColumns: columns must be >= 1 (got ${columns})`);
  }
  const result: T[][] = Array.from({ length: columns }, () => []);
  if (columns === 1 || items.length === 0) {
    // Either everything goes in the one column, or there's nothing to
    // distribute — either way every OTHER column stays correctly empty
    // rather than being omitted (a caller rendering N columns still gets
    // N `View`s, some just empty).
    result[0].push(...items);
    return result;
  }

  let remainingHeight = items.reduce((sum, item) => sum + item.height, 0);
  let remainingColumns = columns;
  let col = 0;
  let colHeight = 0;

  for (const item of items) {
    const target = remainingHeight / remainingColumns;
    if (colHeight >= target && col < columns - 1 && result[col].length > 0) {
      col += 1;
      remainingColumns -= 1;
      colHeight = 0;
    }
    result[col].push(item);
    colHeight += item.height;
    remainingHeight -= item.height;
  }

  return result;
}

export interface BalancedColumnsItem extends HeightedItem {
  key: string;
  node: React.ReactNode;
}

export interface BalancedColumnsProps {
  items: BalancedColumnsItem[];
  columns: number;
  /** Gap between columns, in points. Defaults to 12. */
  columnGap?: number;
  /** Merged onto the outer row `View`. */
  style?: Style;
  /** Merged onto each column's `View`. */
  columnStyle?: Style;
}

/** Renders `items` split into `columns` columns, balanced by `.height` via
 *  `balanceColumns` (see above) rather than by item count. */
export function BalancedColumns({ items, columns, columnGap = 12, style, columnStyle }: BalancedColumnsProps) {
  const cols = balanceColumns(items, columns);
  return (
    <View style={[{ flexDirection: 'row', gap: columnGap }, style ?? {}]}>
      {cols.map((colItems, i) => (
        <View key={i} style={[{ flex: 1 }, columnStyle ?? {}]}>
          {colItems.map((item) => (
            <React.Fragment key={item.key}>{item.node}</React.Fragment>
          ))}
        </View>
      ))}
    </View>
  );
}
