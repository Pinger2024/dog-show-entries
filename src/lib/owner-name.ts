/**
 * Is this a proper owner's name? ONE owner of that question (CLAUDE.md "One
 * owner per rule"): the dog form, sign-up, the profile and the secretary's
 * Register New Dog all ask it here, on the screen AND on the server.
 *
 * Mandy, 3 Nov 2026 (Telegram 8175): exhibitors were typing both joint owners
 * into one name box ("John & Jane Smith"), and some typed their address into
 * the name — which the catalogue then sorted and printed as their surname. Her
 * ruling (8178): "I'd stop them till they sort it" — so a name with either
 * problem is refused, with a message saying how to put it right, and the
 * two-people case gets a one-tap split (`splitJointOwnerName`).
 *
 * Deliberately narrow, because a real name must never be refused:
 *   - two people = an "&", "+" or "/" anywhere, or the word "and" on its own
 *     ("Alexander Anderson" and "Sandy" are fine) — EXCEPT a joint title on
 *     one name, "Mr & Mrs D Smith", which the catalogue prints as a unit and
 *     is common (kept from the catalogue data checks, which this file now
 *     owns the detection for — lib/catalogue-data-checks.ts calls it);
 *   - an address = any digit or comma. No street-word guessing: "Close",
 *     "Lane" and "Street" are real surnames.
 */

export type OwnerNameProblem = 'two_people' | 'address';

/** Where the name is being typed: a dog's owner, or the person's own account
 *  (sign-up / profile), which has no "Add Joint Owner" button to point at. */
export type OwnerNameContext = 'owner' | 'account';

const TWO_PEOPLE = /[&+/]|\sand\s/i;
/** "Mr & Mrs D Smith" / "Mr and Mrs Smith": a joint title on one name. */
const TITLE_PAIR = /^\s*(?:mr|mrs|miss|ms|dr)\.?\s*(?:[&+/]|and)\s*(?:mr|mrs|miss|ms|dr)\.?(?:\s|$)/i;
const ADDRESS = /[\d,]/;

export function ownerNameProblem(name: string | null | undefined): OwnerNameProblem | null {
  const n = (name ?? '').trim();
  if (!n) return null;
  // An address first: "John & Jane Smith, 12 High St" needs the address out
  // before a split would make sense.
  if (ADDRESS.test(n)) return 'address';
  if (TWO_PEOPLE.test(` ${n} `) && !TITLE_PAIR.test(n)) return 'two_people';
  return null;
}

const MESSAGES: Record<OwnerNameContext, Record<OwnerNameProblem, string>> = {
  owner: {
    two_people:
      'This looks like two people. Put one name here and tap "Make it two owners" — the catalogue shows every owner together.',
    address: 'This looks like an address. Please put just the name here — the address has its own box below.',
  },
  account: {
    two_people: "Please put just one person's name here. You can add a joint owner when you add your dog.",
    address: 'This looks like an address. Please put just your name here — your address has its own box below.',
  },
};

/** The message that refuses this name, or null when it is fine. */
export function ownerNameIssue(name: string | null | undefined, context: OwnerNameContext = 'owner'): string | null {
  const problem = ownerNameProblem(name);
  return problem ? MESSAGES[context][problem] : null;
}

/** For a zod string schema: `.superRefine(refineOwnerName('owner'))`. The same
 *  refinement runs in the form and in the tRPC input, so they cannot disagree. */
export function refineOwnerName(context: OwnerNameContext = 'owner') {
  return (value: string | null | undefined, ctx: { addIssue: (issue: { code: 'custom'; message: string }) => void }) => {
    const message = ownerNameIssue(value, context);
    if (message) ctx.addIssue({ code: 'custom', message });
  };
}

/**
 * "John & Jane Smith" → ["John Smith", "Jane Smith"]; "John Smith and Jane
 * Brown" → ["John Smith", "Jane Brown"]. A first name on its own borrows the
 * other person's surname. Null unless it is exactly two people — anything
 * else is left for the person to sort out.
 */
export function splitJointOwnerName(name: string | null | undefined): [string, string] | null {
  if (ownerNameProblem(name) !== 'two_people') return null;
  const parts = (name ?? '')
    .split(/\s*[&+/]\s*|\s+and\s+/i)
    .map((p) => p.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
  if (parts.length !== 2) return null;
  const [first, second] = parts as [string, string];
  const secondWords = second.split(' ');
  const firstNamed = !first.includes(' ') && secondWords.length >= 2
    ? `${first} ${secondWords[secondWords.length - 1]}`
    : first;
  return [firstNamed, second];
}
