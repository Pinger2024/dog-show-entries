import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import { safeCallbackUrl } from '@/lib/safe-redirect';

const ORIGIN = 'https://remishowmanager.co.uk';

describe('safeCallbackUrl — only ever a same-site path', () => {
  it.each([
    ['/dashboard', '/dashboard'],
    ['/invite/abc?x=1#y', '/invite/abc?x=1#y'],
    [`${ORIGIN}/secretary/shows/1`, '/secretary/shows/1'],
  ])('keeps %s', (raw, expected) => {
    expect(safeCallbackUrl(raw, { origin: ORIGIN })).toBe(expected);
  });

  it.each([
    'javascript:alert(document.cookie)',
    'JavaScript:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'https://evil.example/login',
    '//evil.example/login',
    '/\\evil.example',
    '/\t/evil.example',
    'https://remishowmanager.co.uk.evil.example/x',
    '',
    null,
    undefined,
  ])('rejects %j', (raw) => {
    expect(safeCallbackUrl(raw as string | null, { origin: ORIGIN })).toBe('/dashboard');
  });

  it('rejects absolute URLs when no origin is known (server render)', () => {
    expect(safeCallbackUrl(`${ORIGIN}/x`)).toBe('/dashboard');
  });
});

/**
 * Guard (bug hunt 2026-09-22): nothing may read a redirect query param
 * without going through safeCallbackUrl.
 */
describe('redirect params — one owner guard', () => {
  const SRC = join(__dirname, '..');
  function walk(dir: string): string[] {
    let out: string[] = [];
    for (const e of readdirSync(dir)) {
      if (e === 'node_modules' || e.startsWith('.') || e === '__tests__') continue;
      const full = join(dir, e);
      if (statSync(full).isDirectory()) out = out.concat(walk(full));
      else if (/\.tsx?$/.test(e)) out.push(full);
    }
    return out;
  }

  it('every read of callbackUrl / redirect / next / returnTo is wrapped in safeCallbackUrl', () => {
    const offenders: string[] = [];
    for (const f of walk(SRC)) {
      const lines = readFileSync(f, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (/\.get\(\s*['"](callbackUrl|redirect|redirectTo|next|returnTo|returnUrl)['"]\s*\)/.test(line) && !line.includes('safeCallbackUrl(')) {
          offenders.push(`${relative(SRC, f).split(sep).join('/')}:${i + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
