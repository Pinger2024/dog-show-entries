/**
 * ONE owner for which numbers a show's catalogue uses.
 *
 * Mandy, 20 Oct 2026: "can we start the catalogue numbering for the current
 * live regional at 141 and can we miss out 197, 212 and 216 as those are
 * missing". The club reuses one set of bibs, numbered from 141, and some are
 * lost. Midland (4 Oct) had to be renumbered +140 by hand after the show; while
 * entries are open a hand renumber doesn't last, because every confirmation
 * re-sorts the whole show.
 *
 * Before this the rule "1, 2, 3 … with no gaps" was written down twice: where
 * numbers are issued (server/services/catalogue-numbering.ts) and in the print
 * preflight (lib/catalogue-preflight.ts), which marked every Midland render as
 * failed after the renumber. Both now ask this module. Pure, with no imports, so
 * the render worker's preflight can use it without the web app's dependencies.
 */

/** Where a show's numbers start, and the numbers never to issue. `skip` is
 *  sorted, deduplicated, and holds only numbers at or above `start`. */
export type CatalogueNumberRule = { start: number; skip: number[] };

export const DEFAULT_CATALOGUE_NUMBER_RULE: CatalogueNumberRule = { start: 1, skip: [] };

/** Highest start a secretary can choose; far beyond any real bib set. */
export const CATALOGUE_NUMBER_MAX_START = 9999;
/** Most numbers a secretary can leave out. */
export const CATALOGUE_NUMBER_MAX_SKIP = 200;

/** The rule stored on a show row (columns `catalogue_number_start` and
 *  `catalogue_number_skip`). A show that never set one numbers 1, 2, 3 … */
export function catalogueNumberRule(show: {
  catalogueNumberStart?: number | null;
  catalogueNumberSkip?: readonly number[] | null;
}): CatalogueNumberRule {
  const start =
    Number.isInteger(show.catalogueNumberStart) && (show.catalogueNumberStart as number) >= 1
      ? (show.catalogueNumberStart as number)
      : 1;
  return { start, skip: tidySkip(show.catalogueNumberSkip ?? [], start) };
}

function tidySkip(skip: readonly number[], start: number): number[] {
  return [...new Set(skip.filter((n) => Number.isInteger(n) && n >= start))].sort((a, b) => a - b);
}

/** The first number the rule issues after `after` (0 = nothing issued yet). */
export function nextCatalogueNumber(rule: CatalogueNumberRule, after: number): number {
  const skip = new Set(rule.skip);
  let n = Math.max(after + 1, rule.start);
  while (skip.has(n)) n += 1;
  return n;
}

/** The first `count` numbers the rule issues, in order. */
export function expectedCatalogueNumbers(rule: CatalogueNumberRule, count: number): number[] {
  const numbers: number[] = [];
  let last = 0;
  for (let i = 0; i < count; i += 1) {
    last = nextCatalogueNumber(rule, last);
    numbers.push(last);
  }
  return numbers;
}

/** What the secretary typed, read into a rule — or the reason it can't be. */
export function parseCatalogueNumberRule(input: {
  start: string;
  skip: string;
}): { ok: true; rule: CatalogueNumberRule } | { ok: false; error: string } {
  const startText = input.start.trim();
  if (!/^\d+$/.test(startText)) {
    return { ok: false, error: 'Please enter a whole number for where the numbers start, such as 1 or 141.' };
  }
  const start = Number(startText);
  if (start < 1 || start > CATALOGUE_NUMBER_MAX_START) {
    return { ok: false, error: `Numbers can start anywhere from 1 to ${CATALOGUE_NUMBER_MAX_START}.` };
  }

  const pieces = input.skip.split(/[\s,;]+/).filter(Boolean);
  const bad = pieces.find((p) => !/^\d+$/.test(p));
  if (bad) {
    return { ok: false, error: `"${bad}" isn't a number. List the numbers to leave out like this: 197, 212, 216.` };
  }
  const skip = tidySkip(pieces.map(Number), start);
  if (skip.length > CATALOGUE_NUMBER_MAX_SKIP) {
    return { ok: false, error: `You can leave out up to ${CATALOGUE_NUMBER_MAX_SKIP} numbers.` };
  }
  return { ok: true, rule: { start, skip } };
}

/** The rule in plain words, for the Catalogue page. */
export function describeCatalogueNumberRule(rule: CatalogueNumberRule): string {
  if (rule.skip.length === 0) return `Numbers start at ${rule.start}.`;
  const listed =
    rule.skip.length === 1
      ? String(rule.skip[0])
      : `${rule.skip.slice(0, -1).join(', ')} and ${rule.skip[rule.skip.length - 1]}`;
  return `Numbers start at ${rule.start}, leaving out ${listed}.`;
}

/** The rule as the form shows it, so an unchanged Save is a no-op. */
export function catalogueNumberRuleFormValues(rule: CatalogueNumberRule): { start: string; skip: string } {
  return { start: String(rule.start), skip: rule.skip.join(', ') };
}
