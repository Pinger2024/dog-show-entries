import { describe, it, expect } from 'vitest';
import { scanFiles, type Match } from './helpers/static-scan';

/**
 * Every allowlist entry documents WHY the pattern is a legitimate exception
 * rather than a missed sweep. Keep these narrow (file + optional line
 * substring) — a whole-file allowlist is fine when the entire file is one
 * coherent categorical/status system, but don't allowlist a file "just in
 * case" for a pattern it doesn't actually need.
 */
interface AllowlistEntry {
  file: string;
  /** Optional: only allowlist lines containing this substring within the file. */
  lineIncludes?: string;
  reason: string;
}

function isAllowlisted(m: Match, allowlist: AllowlistEntry[]): boolean {
  return allowlist.some((entry) => {
    if (!m.file.includes(entry.file)) return false;
    if (entry.lineIncludes && !m.content.includes(entry.lineIncludes)) return false;
    return true;
  });
}

function reportViolations(matches: Match[], label: string, fixHint: string): void {
  if (matches.length === 0) return;
  const details = matches.map((v) => `  ${v.file}:${v.line}  ${v.content}`).join('\n');
  expect.fail(`${label}:\n${details}\n\n${fixHint}`);
}

// ─── Global green design system conformance ──────────────────────────────
//
// The app was flipped app-wide to the "Show Experience (green)" palette
// (src/app/globals.css, 2026-07-10). Dark mode was removed. This test locks
// that in: legacy Tailwind neutral/accent color families, dark: variants,
// and retired brand hexes should not reappear via copy-paste from
// pre-flip code or new components built against muscle memory.

describe('design system conformance (Show Experience green)', () => {
  // ─── Legacy Tailwind color families ──────────────────────────────────
  //
  // stone-/amber-/zinc-/emerald- and bare gray-/slate- neutrals are the
  // pre-flip palette. Two kinds of legitimate survivors:
  //  1. Genuinely categorical/information-bearing color systems (status
  //     badges, per-category legends, placement ribbons) — these carry
  //     meaning in their hue and aren't part of the show-experience brand
  //     surface, so they're allowlisted rather than forced onto se-* tokens.
  //  2. Nothing else — a hit outside the allowlist is a missed sweep and
  //     should be fixed onto se-* (or another existing semantic) tokens.
  const COLOR_FAMILY_ALLOWLIST: AllowlistEntry[] = [
    // Admin-only internal tooling (not part of the public Show Experience
    // reskin) using amber=warning/pending, emerald=success/accepted,
    // gray=neutral/inactive as a coherent status-color legend — same genre
    // as the pre-approved judge-intel/payment/closing category rows.
    {
      file: 'src/app/(dashboard)/admin/applications/page.tsx',
      reason: 'application status colors (pending=amber, approved=emerald) — admin-only categorical status',
    },
    {
      file: 'src/app/(dashboard)/admin/calculator/page.tsx',
      reason: 'cost-breakdown stacked-bar segments + good/warn profit indicators — admin-only categorical legend',
    },
    {
      file: 'src/app/(dashboard)/admin/invitations/page.tsx',
      reason: 'STATUS_CONFIG (pending=amber, accepted=emerald, expired=gray, revoked=red) — admin-only categorical status',
    },
    {
      file: 'src/app/(dashboard)/admin/page.tsx',
      reason: 'ACTIVITY_CONFIG + pipeline-stage funnel bars + attention panel — admin-only categorical/status colors',
    },
    {
      file: 'src/app/(dashboard)/admin/reference-data/page.tsx',
      reason: 'class-type category badges (special=amber, junior_handler=emerald) — admin-only categorical',
    },
    // Per-role color mapping (secretary=amber, steward=blue) — categorical,
    // same pattern as sponsors TIER_COLORS.
    {
      file: 'src/components/dashboard/role-picker-banner.tsx',
      reason: 'per-role quick-switch color mapping — categorical, distinguishes role identity',
    },
    // Steward placement ribbons — 1st-5th follow the prize-card ribbon
    // palette (red/blue/yellow/green/purple); 6th+ falls back to a
    // documented "neutral slate" by design (see placementColour()).
    {
      file: 'src/app/(steward)/steward/shows/[id]/classes/[classId]/page.tsx',
      lineIncludes: "bg: 'bg-slate-600'",
      reason: 'steward placement ribbon palette — documented neutral fallback for 6th+ (placementColour())',
    },
  ];

  it('should not use legacy Tailwind neutral/accent color families outside the allowlist', () => {
    // stone-/amber-/zinc-/emerald- families, plus bare gray-/slate- NEUTRALS
    // (text/bg/border/ring/divide variants only — categorical uses of other
    // families like red/blue/violet/sky/pink/rose are unaffected). \b anchors
    // on the family name so e.g. "milestone-100" (no hyphen before "stone")
    // doesn't false-positive, while "bg-stone-100" (hyphen before "stone" is
    // a word boundary) correctly matches.
    const pattern = /\b(?:stone|amber|zinc|emerald)-\d+|\b(?:text|bg|border|ring|divide)-(?:gray|slate)-\d+/;
    const matches = scanFiles(['src'], ['.tsx'], pattern);
    const violations = matches.filter((m) => !isAllowlisted(m, COLOR_FAMILY_ALLOWLIST));

    reportViolations(
      violations,
      'Legacy Tailwind color family found (stone-/amber-/zinc-/emerald- or bare gray-/slate- neutral)',
      'Fix: sweep onto se-* semantic tokens (se-ink/se-ink2/se-ink3 for text, se-line/se-line2 for borders,\n' +
      'se-paper2/se-surface for backgrounds, se-honey-* for gold/trophy accents, se-fresh-* for success/positive) —\n' +
      'see src/components/show-experience/kit.tsx and already-migrated call sites for the established mapping.\n' +
      'Only add to COLOR_FAMILY_ALLOWLIST if the color is genuinely categorical/information-bearing.'
    );
  });

  // ─── Dark mode variants ───────────────────────────────────────────────
  //
  // Dark mode was removed app-wide. `dark:` classes are dead weight from
  // shadcn's default codegen (no .dark class or next-themes toggle exists
  // to ever activate them) — strip them at the source, don't allowlist.

  it('should not use dark: variant classes (dark mode was removed)', () => {
    const pattern = /\bdark:/;
    const matches = scanFiles(['src'], ['.tsx'], pattern);

    reportViolations(
      matches,
      'dark: variant class found (dark mode was removed app-wide)',
      'Fix: remove the dark: variant — there is no .dark class or theme toggle to ever activate it.'
    );
  });

  // ─── Retired brand hex / tokens ───────────────────────────────────────
  //
  // #2D5F3F was the pre-flip "Heritage Green" primary, superseded by
  // se-green (#2f6b43). The --gold custom property + gold-rule utilities
  // were fully retired (zero live consumers) and removed from globals.css.
  // react-pdf styling and other non-live-UI rendering paths are allowlisted
  // since they render static print/email artifacts, not the live app shell.
  const RETIRED_HEX_ALLOWLIST: AllowlistEntry[] = [
    {
      file: 'src/components/judge-contract/judge-contract-pdf.tsx',
      reason: 'react-pdf styling file — renders a static PDF, not the live app shell',
    },
  ];

  it('should not reference the retired #2D5F3F brand hex outside the allowlist', () => {
    const pattern = /#2D5F3F/i;
    const matches = scanFiles(['src'], ['.tsx'], pattern);
    const violations = matches.filter((m) => !isAllowlisted(m, RETIRED_HEX_ALLOWLIST));

    reportViolations(
      violations,
      'Retired #2D5F3F hex found (superseded by se-green / --primary #2f6b43)',
      'Fix: use the current brand primary (#2f6b43 / var(--primary) / text-primary / bg-primary), or add to\n' +
      'RETIRED_HEX_ALLOWLIST if this is a react-pdf styling file or email-template hex literal.'
    );
  });

  it('should not reference the retired --gold token', () => {
    // Matches the Tailwind utilities (text-gold, bg-gold, border-gold, gold-rule,
    // gold-foreground) and raw CSS var references. Deliberately scoped to
    // hyphen-qualified tokens so prose like "British Gold Medal" or breed
    // colors ("Black & Gold") in JSX text content don't false-positive.
    const pattern = /(?:text|bg|border|ring|divide|from|via|to)-gold\b|gold-rule|gold-foreground|--gold\b|--color-gold\b/;
    const matches = scanFiles(['src'], ['.tsx'], pattern);
    // Also check globals.css itself for reintroduction of the dead token.
    const cssMatches = scanFiles(['src/app'], ['.css'], pattern);

    reportViolations(
      [...matches, ...cssMatches],
      'Retired --gold token/utility found (removed 2026-07-10 — zero live consumers, superseded by se-honey-*)',
      'Fix: use the se-honey-* family (se-honey / se-honey-deep / se-honey-soft / se-honey-line / se-honey-ink)\n' +
      'for gold/trophy/achievement accents instead of reintroducing --gold.'
    );
  });
});
