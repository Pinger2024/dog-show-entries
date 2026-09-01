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
 * column once the current one has reached its fair share
 * (`totalHeight / columns`) — but never leaves a column empty while items
 * remain (a column only advances once it already holds at least one item),
 * and never creates more columns than requested. The LAST column absorbs
 * whatever remains, so rounding error lands there rather than causing an
 * extra empty column.
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
  if (columns === 1 || items.length === 0) {
    return [items.slice() as T[]];
  }

  const totalHeight = items.reduce((sum, item) => sum + item.height, 0);
  const target = totalHeight / columns;

  const result: T[][] = Array.from({ length: columns }, () => []);
  let col = 0;
  let colHeight = 0;

  for (const item of items) {
    if (colHeight >= target && col < columns - 1 && result[col].length > 0) {
      col += 1;
      colHeight = 0;
    }
    result[col].push(item);
    colHeight += item.height;
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
