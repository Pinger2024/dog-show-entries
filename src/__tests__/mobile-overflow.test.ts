import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PROJECT_ROOT, scanFiles } from './helpers/static-scan';

// ─── Test 1: No unprotected negative horizontal margins ─────────────

describe('mobile overflow protection', () => {
  // Files that are known-safe for negative margins (with justification)
  const NEGATIVE_MARGIN_ALLOWLIST = [
    // UI component separators — only -mx-1 (4px), far too small to cause overflow
    'src/components/ui/command.tsx',
    'src/components/ui/select.tsx',
    'src/components/ui/dropdown-menu.tsx',
    // Admin page — small -mx-2 with matching px-2 for hover effect, admin-only page
    'src/app/(dashboard)/admin/page.tsx',
    // Dashboard + feature-tabs — full-bleed horizontal scroll pattern with sm:-mx-0 reset
    'src/app/(dashboard)/dashboard/page.tsx',
    'src/components/features/feature-tabs.tsx',
  ];

  it('should not have unprotected negative horizontal margins', () => {
    // Match -mx-2 through -mx-96 and -mx-[*] (arbitrary values)
    // Skip -mx-1 which is too small to cause overflow
    const pattern = /-mx-(?:[2-9]|[1-9]\d|\[)/;
    const matches = scanFiles(
      ['src/app', 'src/components'],
      ['.tsx'],
      pattern,
    );

    const violations = matches.filter((m) => {
      // Allow if file is in the allowlist
      if (NEGATIVE_MARGIN_ALLOWLIST.some((allowed) => m.file.includes(allowed))) {
        return false;
      }
      // Allow if the same line has `hidden sm:block` or `hidden md:block` (desktop-only)
      if (/hidden\s+(sm|md|lg):block/.test(m.content)) {
        return false;
      }
      return true;
    });

    if (violations.length > 0) {
      const details = violations
        .map((v) => `  ${v.file}:${v.line}  ${v.content}`)
        .join('\n');
      expect.fail(
        `Unprotected negative horizontal margins found (can cause mobile bleed):\n${details}\n\n` +
        `Fix: remove the negative margin, wrap in a desktop-only container (hidden sm:block),\n` +
        `or add to NEGATIVE_MARGIN_ALLOWLIST with justification.`
      );
    }
  });

  // ─── Test 2: No 100vw or w-screen ────────────────────────────────

  it('should not use 100vw or w-screen', () => {
    const matches = scanFiles(
      ['src/app', 'src/components'],
      ['.tsx', '.css'],
      /100vw|w-screen/,
    );

    // Filter out comments and safe usages
    const violations = matches.filter((m) => {
      const trimmed = m.content.trimStart();
      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return false;
      // 100vw inside max-w-[calc(...)] is safe — it constrains width, doesn't set it
      if (/max-w-\[calc\(100vw/.test(m.content)) return false;
      return true;
    });

    if (violations.length > 0) {
      const details = violations
        .map((v) => `  ${v.file}:${v.line}  ${v.content}`)
        .join('\n');
      expect.fail(
        `100vw/w-screen usage found (includes scrollbar width, causes mobile overflow):\n${details}\n\n` +
        `Fix: use w-full or 100% instead.`
      );
    }
  });

  // ─── Test 3: Layout shells maintain a horizontal-overflow guard ────
  //
  // The guard is overflow-x-CLIP, not hidden: `hidden` turns the element
  // into a scroll container, which silently disables every position:sticky
  // descendant (the app sidebars never floated because of it — found
  // 2026-08-03). `clip` guards against mobile horizontal overflow
  // identically without breaking sticky.

  it('should have an overflow-x-clip guard on layout shells', () => {
    const shells = [
      'src/components/layout/dashboard-shell.tsx',
      'src/components/layout/secretary-shell.tsx',
      'src/components/layout/steward-shell.tsx',
    ];

    for (const shell of shells) {
      const filePath = path.resolve(PROJECT_ROOT, shell);
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(
        content.includes('overflow-x-clip'),
        `${shell} must contain overflow-x-clip as a safety net against mobile horizontal overflow (NOT overflow-x-hidden — that breaks position:sticky)`,
      ).toBe(true);
    }
  });

  it('guards html with hidden ONLY and body with hidden fallback + clip override', () => {
    const filePath = path.resolve(PROJECT_ROOT, 'src/app/globals.css');
    const content = fs.readFileSync(filePath, 'utf-8');

    // html: `hidden` only. `clip` on the root broke position:fixed on iOS
    // Safari — the mobile bottom nav detached and drifted mid-page
    // (Mandy's phone, 2026-08-03). html's overflow value has no effect on
    // sticky (measured live), so hidden costs nothing there.
    const htmlBlock = content.match(/html\s*\{[^}]*\}/s);
    expect(
      htmlBlock && htmlBlock[0].includes('overflow-x: hidden'),
      'globals.css html {} must keep overflow-x: hidden',
    ).toBe(true);
    expect(
      htmlBlock && !htmlBlock[0].includes('overflow-x: clip'),
      'globals.css html {} must NOT use overflow-x: clip — it breaks position:fixed on iOS Safari',
    ).toBe(true);

    // body: hidden fallback then clip override — `hidden` makes body a
    // scroll container and disables every position:sticky descendant.
    const bodyBlock = content.match(/body\s*\{[^}]*\}/s);
    expect(
      bodyBlock && bodyBlock[0].includes('overflow-x: hidden'),
      'globals.css body {} must keep the overflow-x: hidden fallback',
    ).toBe(true);
    expect(
      bodyBlock && bodyBlock[0].indexOf('overflow-x: clip') > bodyBlock[0].indexOf('overflow-x: hidden'),
      'globals.css body {} must override with overflow-x: clip after the hidden fallback',
    ).toBe(true);
  });

  // ─── Test 4: No overflow-x-auto combined with negative margins ────

  it('should not combine overflow-x-auto with negative margins on the same element', () => {
    // Full-bleed scroll patterns with sm:-mx-0 reset are safe
    const OVERFLOW_COMBO_ALLOWLIST = [
      'src/app/(dashboard)/dashboard/page.tsx',
      'src/components/features/feature-tabs.tsx',
    ];

    const matches = scanFiles(
      ['src/app', 'src/components'],
      ['.tsx'],
      /overflow-x-auto/,
    );

    // For each line with overflow-x-auto, check if the same line also has -mx-
    const violations = matches.filter((m) => {
      if (OVERFLOW_COMBO_ALLOWLIST.some((a) => m.file.includes(a))) return false;
      if (/-mx-/.test(m.content)) {
        // Allow if desktop-only
        if (/hidden\s+(sm|md|lg):block/.test(m.content)) return false;
        return true;
      }
      return false;
    });

    if (violations.length > 0) {
      const details = violations
        .map((v) => `  ${v.file}:${v.line}  ${v.content}`)
        .join('\n');
      expect.fail(
        `overflow-x-auto combined with negative margins on the same element:\n${details}\n\n` +
        `This pattern caused the show-section-nav mobile bleed bug.\n` +
        `Fix: remove the negative margin, or separate the overflow container from the margin.`
      );
    }
  });
});
