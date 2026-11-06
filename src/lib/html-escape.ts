/**
 * One owner for putting values into HTML that Remi builds by hand — the
 * token-gated pages served from our own origin (results approval, judge
 * contract, the prize-card print wrapper) and email bodies.
 *
 * Bug hunt 2026-09-22: those pages interpolated dog names, show and club
 * names, judge names, notes and a URL parameter straight into markup served
 * as text/html from remishowmanager.co.uk. A dog registered with a name like
 * `<img src=x onerror=…>` ran script in the judge's session; a crafted link
 * did the same to a logged-in secretary. There was an `esc()` — three copies
 * of it — but nothing made anyone call it.
 *
 * Use the `html` tagged template: every interpolated value is escaped unless
 * it is itself `html`-built (or deliberately wrapped in `rawHtml`). Arrays are
 * joined, and null / undefined / false render as nothing, so
 * `${cond && html`<p>…</p>`}` and `${rows.map((r) => html`<tr>…</tr>`)}` work.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape a value for HTML text or a quoted attribute. null/undefined/false → ''. */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined || value === false) return '';
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

/** Markup that is already safe — produced by `html` or explicitly trusted. */
export class SafeHtml {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

/**
 * Trust a string as markup. Only for HTML Remi itself generated from
 * constants (e.g. the shared email header) — never for anything a user typed.
 */
export function rawHtml(markup: string): SafeHtml {
  return new SafeHtml(markup);
}

function render(value: unknown): string {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  return escapeHtml(value);
}

/** Tagged template that escapes every interpolation by default. */
export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  let out = strings[0] ?? '';
  for (let i = 0; i < values.length; i++) {
    out += render(values[i]) + (strings[i + 1] ?? '');
  }
  return new SafeHtml(out);
}
