import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

/**
 * Static guard for the 2026-06-12 bank-details leak (see
 * src/server/trpc/public-org-columns.ts and public-data-privacy.test.ts).
 *
 * `organisation: true` joins the FULL organisations row — including payout
 * bank details and Stripe IDs. Public and exhibitor-facing queries must use
 * `organisation: { columns: publicOrgColumns }` instead.
 *
 * public-data-privacy.test.ts pins the procedures that were fixed; this scan
 * catches the NEXT one someone writes with an unscoped join. Like
 * mobile-overflow.test.ts, it's a blunt instrument with a precise allowlist —
 * if it fails on legitimately secretary-scoped code, scope the join anyway
 * (costs nothing) or extend the allowlist with a justification.
 *
 * Originally this only scanned src/server/trpc/routers. That left the same
 * pattern free to spread through App Router API routes, server services, and
 * public page components — which it had, to 19 unscoped joins across
 * src/app/api alone. Those are now scoped, and src/app/api is pinned at zero
 * so the next one fails here rather than shipping.
 */

const SRC = join(__dirname, '..');

/** Directories scanned recursively for unscoped organisation joins. */
const SCANNED_ROOTS = [
  'server/trpc/routers',
  'app/api',
  'app/(shows)',
  'server/services',
  'lib',
];

/**
 * path (relative to src/, POSIX separators) → allowed count + justification.
 * Anything not listed must have zero unscoped joins.
 *
 * The rule for being here: the full row is used SERVER-SIDE ONLY and never
 * crosses a serialisation boundary (no JSON response, no props to a
 * 'use client' component). Rendering a PDF, an email, or an OG image from it
 * is fine — the bytes that reach the user contain no bank details.
 */
const ALLOWED: Record<string, { count: number; reason: string }> = {
  'server/trpc/routers/secretary.ts': {
    count: 14,
    reason:
      'secretaryProcedure + verifyShowAccess/org scoping — a club may see its own payout details',
  },
  'server/trpc/routers/steward.ts': {
    count: 1,
    reason:
      'submitForJudgeApproval uses the org row server-side to render an email; nothing returns it',
  },
  'server/services/pdf-generation.ts': {
    count: 6,
    reason: 'server-side PDF rendering only; the org row never leaves the process',
  },
  'server/services/email.ts': {
    count: 5,
    reason: 'server-side email templating only; the org row never leaves the process',
  },
  'server/services/results-notifications.ts': {
    count: 2,
    reason: 'server-side email templating only',
  },
  'server/services/judge-contract-pdf.ts': {
    count: 1,
    reason: 'server-side PDF rendering only',
  },
  'server/services/sv-results-data.ts': {
    count: 1,
    reason: 'server-side report assembly only',
  },
  'server/services/test-data-generator.ts': {
    count: 1,
    reason: 'dev/admin-only test-data seeding, never on a user response path',
  },
  'lib/share-image-data.ts': {
    count: 1,
    reason: 'server-side OG/share image generation only',
  },
  'app/(shows)/shows/[id]/page.tsx': {
    count: 1,
    reason:
      'server component; the row feeds generateMetadata only and <ShowPreviewClient /> receives no props, so nothing is serialised to the client',
  },
  'app/(shows)/shows/[id]/results/layout.tsx': {
    count: 1,
    reason: 'server component, metadata only — no props cross the client boundary',
  },
  'app/(shows)/shows/[id]/opengraph-image.tsx': {
    count: 1,
    reason: 'server-side image generation only',
  },
  'app/(shows)/shows/[id]/results/opengraph-image.tsx': {
    count: 1,
    reason: 'server-side image generation only',
  },
};

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out = out.concat(walk(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('no unscoped organisation joins outside the allowlist', () => {
  const files = SCANNED_ROOTS.flatMap((root) => {
    const abs = join(SRC, root);
    try {
      return walk(abs);
    } catch {
      return [];
    }
  })
    // The doc-comment in public-org-columns.ts names the pattern it forbids.
    .filter((f) => !f.endsWith(`${sep}public-org-columns.ts`));

  it('scans a non-trivial number of files (guard against a broken walk)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  for (const file of files) {
    const rel = relative(SRC, file).split(sep).join('/');
    const src = readFileSync(file, 'utf8');
    const matches = src.match(/organisation:\s*true/g) ?? [];
    if (matches.length === 0 && !ALLOWED[rel]) continue; // nothing to assert

    it(`${rel} only joins full organisation rows where allowlisted`, () => {
      const allowed = ALLOWED[rel]?.count ?? 0;
      expect(
        matches.length,
        `${rel} has ${matches.length} \`organisation: true\` join(s) but only ` +
          `${allowed} allowlisted. Use \`organisation: { columns: publicOrgColumns }\` ` +
          `for anything that can reach a user (payout bank details must never leave ` +
          `secretary scope), or extend the allowlist in this file with a justification.`
      ).toBeLessThanOrEqual(allowed);
    });
  }
});
