/**
 * pdf-kit/render-with-page-budget — generalises
 * `src/server/services/schedule-render.ts`'s `renderScheduleWithFit`: render
 * a document once, count its actual pages (pdf-lib), and if it overran a
 * known page budget, re-render with a "compact" prop flipped on. Since
 * @react-pdf/renderer has no measure-before-render API, this render →
 * count-pages → re-render loop is the only reliable way to guarantee a
 * fixed-page-count document (e.g. the SV schedule's designed six pages)
 * actually comes out at that count when its data-elastic sections
 * (fee levels, sundries, prize text) grow.
 *
 * `schedule-render.ts`'s `renderScheduleWithFit` is now a thin wrapper over
 * this function (same retry logic, same `density`/`'compact'` prop
 * contract) — see that file.
 */
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { PDFDocument } from 'pdf-lib';

/** Page count of a rendered PDF. */
export async function pdfPageCount(buf: Uint8Array | Buffer): Promise<number> {
  return (await PDFDocument.load(buf)).getPageCount();
}

export interface RenderWithPageBudgetOptions<P> {
  /** Prop name flipped on for the compact retry. Defaults to `'compact'`. */
  compactProp?: keyof P;
  /** Value assigned to `compactProp` for the compact retry. Defaults to
   *  `true` (as `P[keyof P]`). */
  compactValue?: P[keyof P];
  /** Called with (pagesRendered, budgetPages) right before the compact
   *  retry — use this for logging/telemetry. Defaults to a `console.warn`. */
  onOverflow?: (pagesRendered: number, budgetPages: number) => void;
}

/**
 * Renders `Component` with `props`. If `budgetPages` is null, returns that
 * render unconditionally (some documents paginate freely by design). If the
 * render's actual page count exceeds `budgetPages`, re-renders once with
 * `options.compactProp` (default `'compact'`) set to `options.compactValue`
 * (default `true`) and returns THAT buffer regardless of its own page count
 * — a second overflow means the content is pathological, and shipping the
 * denser compact render (whose own `wrap={false}`/`minPresenceAhead`
 * sections keep spillover to whole sections, never a stranded line or two)
 * beats shipping nothing.
 */
export async function renderWithPageBudget<P extends Record<string, unknown>>(
  Component: React.ComponentType<P>,
  props: P,
  budgetPages: number | null,
  options: RenderWithPageBudgetOptions<P> = {},
): Promise<Buffer> {
  const normal = await renderToBuffer(React.createElement(Component, props));
  if (budgetPages == null) return normal;

  const normalPages = await pdfPageCount(normal);
  if (normalPages <= budgetPages) return normal;

  const compactProp = options.compactProp ?? ('compact' as keyof P);
  const compactValue = options.compactValue ?? (true as P[keyof P]);

  if (options.onOverflow) {
    options.onOverflow(normalPages, budgetPages);
  } else {
    console.warn(
      `[pdf-kit] normal-density render produced ${normalPages} pages ` +
        `(budget ${budgetPages}) — retrying with ${String(compactProp)}=${String(compactValue)}`,
    );
  }

  return renderToBuffer(
    React.createElement(Component, { ...props, [compactProp]: compactValue } as P),
  );
}
