import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import { html, rawHtml, escapeHtml } from '@/lib/html-escape';

describe('html-escape', () => {
  it('escapes interpolations, keeps nested html, joins arrays, drops empties', () => {
    const name = `O'Neil & <b>"Rex"</b>`;
    const rows = ['a<', 'b>'].map((r) => html`<li>${r}</li>`);
    const out = html`<p>${name}</p><ul>${rows}</ul>${false}${null}${undefined}${0}${rawHtml('<hr>')}`.toString();
    expect(out).toBe(
      '<p>O&#39;Neil &amp; &lt;b&gt;&quot;Rex&quot;&lt;/b&gt;</p><ul><li>a&lt;</li><li>b&gt;</li></ul>0<hr>',
    );
    expect(escapeHtml(null)).toBe('');
  });
});

/**
 * Guard (bug hunt 2026-09-22): hand-built HTML served from our origin must be
 * built with the escaping `html` tag, and there is one escaping owner.
 */
const SRC = join(__dirname, '..');
function walk(dir: string): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.') || entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out = out.concat(walk(full));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe('html escaping — one owner guard', () => {
  const files = walk(SRC);
  const rel = (f: string) => relative(SRC, f).split(sep).join('/');

  it('no local esc/escapeHtml helpers outside src/lib/html-escape.ts', () => {
    const offenders = files
      .filter((f) => rel(f) !== 'lib/html-escape.ts')
      .filter((f) => /(function\s+(esc|escHtml|escapeHtml)\s*\(|const\s+(esc|escHtml|escapeHtml)\s*=)/.test(readFileSync(f, 'utf8')))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('every API route that serves text/html builds its page with the html tag', () => {
    const htmlRoutes = files.filter((f) => rel(f).startsWith('app/api/') && readFileSync(f, 'utf8').includes('text/html'));
    expect(htmlRoutes.length).toBeGreaterThanOrEqual(3);
    for (const f of htmlRoutes) {
      const src = readFileSync(f, 'utf8');
      expect(src, `${rel(f)} must import from @/lib/html-escape`).toMatch(/from '@\/lib\/html-escape'/);
      // A plain (untagged) template that starts an HTML document or a page body.
      expect(src, `${rel(f)} has an untagged <!DOCTYPE template`).not.toMatch(/(?<!html)`\s*<!DOCTYPE/);
      expect(src, `${rel(f)} passes an untagged template to renderPage`).not.toMatch(/renderPage\([^)]*?,\s*`/);
    }
  });
});
