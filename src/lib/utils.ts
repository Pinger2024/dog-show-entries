import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Dog title display helpers ─────────────────────────────

const TITLE_DISPLAY: Record<string, string> = {
  ch: 'Ch.',
  sh_ch: 'Sh.Ch.',
  ir_ch: 'Ir.Ch.',
  ir_sh_ch: 'Ir.Sh.Ch.',
  int_ch: 'Int.Ch.',
  ob_ch: 'Ob.Ch.',
  ft_ch: 'FT.Ch.',
  wt_ch: 'WT.Ch.',
};

// Higher index = more prestigious (used for display ordering)
const TITLE_RANK: Record<string, number> = {
  wt_ch: 1,
  ft_ch: 2,
  ob_ch: 3,
  ir_sh_ch: 4,
  ir_ch: 5,
  sh_ch: 6,
  int_ch: 7,
  ch: 8,
};

export function getTitleDisplay(title: string): string {
  return TITLE_DISPLAY[title] ?? title;
}

/**
 * Formats a dog's name with title prefix(es).
 * Shows the highest-ranking title as prefix.
 * e.g. "Ch. Dorabella Dancing Queen"
 */
export function formatDogName(
  dog: { registeredName: string; titles?: { title: string }[] | null }
): string {
  if (!dog.titles || dog.titles.length === 0) {
    return dog.registeredName;
  }

  // Sort by rank descending, pick the highest
  const sorted = [...dog.titles].sort(
    (a, b) => (TITLE_RANK[b.title] ?? 0) - (TITLE_RANK[a.title] ?? 0)
  );

  const prefix = sorted.map((t) => getTitleDisplay(t.title)).join(' ');
  return `${prefix} ${dog.registeredName}`;
}
