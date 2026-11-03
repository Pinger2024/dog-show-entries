import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { pdfPageCount, renderWithPageBudget } from '@/components/pdf-kit/render-with-page-budget';
import { scheduleCoverFits } from '@/components/schedule';
import type { CoverDensity } from '@/components/schedule/shared/styles';

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
 *
 * The RKC schedules paginate freely, but their COVER is one page and must
 * stay one page: it carries the docking statement the RKC requires on the
 * front cover. A full cover (venue, several judges, secretary, vet, first
 * aider, show manager, notices) once spilled its last notice onto a
 * near-blank second page (Mandy 2026-11-03, GSD Club of Scotland 2027). So
 * the cover is rendered on its own first, and the schedule gets the compact
 * cover only when the normal one ran past a page (`fitCoverDensity`).
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
  const coverDensity = await fitCoverDensity(Component, props);
  return renderWithPageBudget(Component, { ...props, coverDensity }, designedPages, {
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

/**
 * The cover density that keeps this schedule's cover on one A5 page: renders
 * the cover alone and returns 'compact' only when 'normal' ran past a page.
 * Renderers without a fitted cover (the SV schedule) always get 'normal'.
 */
export async function fitCoverDensity(
  Component: React.ComponentType<Record<string, unknown>>,
  props: Record<string, unknown>,
): Promise<CoverDensity> {
  if (!scheduleCoverFits(Component)) return 'normal';
  const cover = await renderToBuffer(
    React.createElement(Component, { ...props, coverOnly: true, coverDensity: 'normal' }) as Parameters<typeof renderToBuffer>[0],
  );
  // Measuring is a refinement, never a gate: if the cover cannot be counted,
  // the schedule still prints, at the normal density it always had.
  let pages: number;
  try {
    pages = await pdfPageCount(cover);
  } catch (err) {
    console.warn('[schedule-render] could not count the cover pages — keeping the normal cover', err);
    return 'normal';
  }
  if (pages <= 1) return 'normal';
  console.warn(`[schedule-render] the cover ran to ${pages} pages — rendering the compact cover`);
  return 'compact';
}
