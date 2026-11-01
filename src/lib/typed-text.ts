import { z } from 'zod';

/**
 * Tidying for free text a person typed into a form.
 *
 * Why this exists. Venue names and addresses go out on printed RKC schedules,
 * on the public show page and now through `/api/shows`, and they were being
 * stored exactly as typed. On production today that means a club's schedule
 * prints "Outpaw Pursuits, " with a trailing comma and a space, and an address
 * ending "Trimdon Station Co, Durham," — a comma with nothing after it. Two
 * more venues carry trailing spaces. Nobody typed those on purpose; they are
 * what a half-finished line looks like when it is saved.
 *
 * The rule belongs here rather than in a renderer because there are six or
 * more places venue text is printed, and tidying at each of them is the same
 * rule written down six times — the duplication this codebase keeps paying
 * for. Clean it once, on the way in.
 */

/**
 * Tidies a line of typed text for storage:
 *
 *  - trims the ends,
 *  - collapses any run of whitespace (including a newline pasted in from a
 *    club's letterhead) to one space,
 *  - drops a trailing comma or semicolon, which is always the residue of a
 *    line someone stopped typing rather than punctuation they meant.
 *
 * Internal punctuation is untouched: "Welfare Ground, Murton, Seaham" keeps
 * every comma that separates something from something else.
 */
export function tidyTypedText(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[,;]+$/, '')
    .trim();
}

/**
 * A required line of typed text: length-checked as given, tidied, then
 * re-checked so it cannot arrive blank. `name: z.string().min(1)` used to
 * accept "   " — three spaces are three characters — and store a venue with
 * no name at all. Checking AFTER the tidy is what closes that.
 *
 * Deliberately `transform` and not `z.preprocess`: preprocess types its own
 * input as `unknown`, which makes every field it touches required at the call
 * site and silently broke callers that pass only a name.
 */
export const requiredTypedText = (max: number) =>
  z
    .string()
    .max(max)
    .transform(tidyTypedText)
    .refine((value) => value.length > 0, { message: 'This cannot be blank' });

/** An optional line of typed text, tidied when there is any. */
export const optionalTypedText = () =>
  z
    .string()
    .optional()
    .transform((value) => (value === undefined ? undefined : tidyTypedText(value)));
