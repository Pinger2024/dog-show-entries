import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';

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
 *      and its smallest type sizes to absorb a couple of extra sections.
 *   3. If even compact overruns (pathological content), prefer the compact
 *      render anyway: its `wrap={false}` sections and `minPresenceAhead`
 *      titles mean the spill lands as whole sections on a continuation
 *      page, never a stranded line or two.
 *
 * The second render only happens when the first one overflowed, so the
 * common case pays nothing.
 */

/** Count the page objects in a rendered PDF buffer. */
export function pdfPageCount(buf: Buffer): number {
  return (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

export async function renderScheduleWithFit(
  // Loosely typed: callers hand us one of the three schedule renderers
  // (picked at runtime by pickScheduleComponent); only the SV one reads
  // `density`, and the extra prop is inert on the RKC components.
  Component: React.ComponentType<Record<string, unknown>>,
  props: Record<string, unknown>,
  /** The document's designed page count, or null for schedules that are
   *  meant to paginate freely (the RKC renderers). */
  designedPages: number | null,
): Promise<Buffer> {
  const normal = Buffer.from(
    await renderToBuffer(React.createElement(Component, props)),
  );
  if (designedPages == null || pdfPageCount(normal) <= designedPages) {
    return normal;
  }

  console.warn(
    `[schedule-render] normal-density render produced ${pdfPageCount(normal)} pages ` +
      `(designed ${designedPages}) — retrying at compact density`,
  );
  const compact = Buffer.from(
    await renderToBuffer(
      React.createElement(Component, { ...props, density: 'compact' }),
    ),
  );
  return compact;
}
