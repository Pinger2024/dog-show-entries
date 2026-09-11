import React from 'react';
import { pdfPageCount, renderWithPageBudget } from '@/components/pdf-kit/render-with-page-budget';

// Re-exported for existing callers/tests (src/__tests__/integration/
// sv-schedule-pagination.test.tsx imports `pdfPageCount` from this module) —
// now backed by the general pdf-kit implementation instead of a local copy.
export { pdfPageCount };

/**
 * Fit-aware schedule rendering.
 *
 * The SV schedule is a fixed six-page editorial design, but several of its
 * sections are data-elastic (fee levels, memberships, sundries, prize text
 * are all secretary-entered lists). React-PDF has no measure-before-render
 * API, so when those sections outgrow their page the renderer silently
 * paginates — orphaning content onto an extra page while the folio still
 * claims "02 / 06" (Mandy 2026-07-11, North East regional).
 *
 * Strategy, in order:
 *   1. Render at normal density and count the pages that actually came out.
 *   2. If the document overran its designed page count, re-render at
 *      'compact' density — the at-a-glance page tightens row pitch, gaps
 *      and its smallest type sizes to absorb several extra sections.
 *   3. If even compact overruns (pathological content), ship the compact
 *      render anyway: its `wrap={false}` sections and `minPresenceAhead`
 *      titles mean the spill lands as whole sections on a continuation
 *      page, never a stranded line or two.
 *
 * The second render only happens when the first one overflowed, so the
 * common case pays nothing. Callers get the designed page count from
 * `designedSchedulePageCount` (schedule component dispatcher), which owns
 * the ruleset → page-budget mapping.
 */

export async function renderScheduleWithFit(
  // Loosely typed: callers hand us one of the three schedule renderers
  // (picked at runtime by pickScheduleComponent); only the SV one reads
  // `density`, and the extra prop is inert on the RKC components.
  Component: React.ComponentType<Record<string, unknown>>,
  props: Record<string, unknown>,
  /** The document's designed page count (see `designedSchedulePageCount`),
   *  or null for schedules that are meant to paginate freely. */
  designedPages: number | null,
): Promise<Buffer> {
  return renderWithPageBudget(Component, props, designedPages, {
    compactProp: 'density',
    compactValue: 'compact',
    onOverflow: (pagesRendered, budgetPages) => {
      console.warn(
        `[schedule-render] normal-density render produced ${pagesRendered} pages ` +
          `(designed ${budgetPages}) — retrying at compact density`,
      );
    },
  });
}
