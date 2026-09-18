# Remi — Dog Show Entry Management System

Dog show entry management for the UK **Royal Kennel Club (RKC)** circuit — show creation, online
entries, Stripe payments, catalogue and document generation.
Live https://remishowmanager.co.uk · Render `srv-d6g578a4d50c73dj4rpg` · Postgres 18.

## Conventions

- **Always write "RKC"** — never "KC" or "Kennel Club".

## Key people

- **Michael** (`michael@prometheus-it.com`) — co-founder (tech), developer/admin.
- **Mandy** — Co-founder (industry expert), 50% partner, equal authority to Michael
 
## Who we build for — the most important thing in this file

**Primarily 60+ year old women who love dogs and are not confident with computers.** Every screen
must pass: "would this intimidate someone who didn't grow up with computers?"

- **Simple over clever** — if it looks complex, it IS too complex. Use progressive disclosure.
- **Mobile first, always** — secretaries work on phones. Nothing ships that isn't usable on a phone


## How we work

1. **Research first** — before code, think about how the best apps would solve it, **Ask Mandy the domain questions BEFORE building** — never ship "maybe, please check".
2. **Design the whole journey** — what does Mandy do before this, and after? Where does she expect to find it? What happens when it goes wrong?
3. **Don't just digitise paper** — ask what paper and spreadsheets could never do.
4. **Build it fully** — never an MVP, never the minimal fix. Root cause, every call site — see
   **One owner per rule** below, which is what "every call site" means in practice.
5. **Test** — every bug Mandy reports becomes a test *first*, fix second; new features get a
   journey test. **Prove the test fails** before trusting it. One vitest at a time
   (`singleFork`), and a few tests are order-dependent so a lone green run isn't proof. Mock
   external services, never the DB.
6. **🚦 Demo, then get a tested OK — a green build is NOT permission to ship.** Deploy to demo,
   use the artefact the way Mandy will, wait for Michael or Mandy to confirm, then push.
7. **Close the loop** — Telegram Mandy what shipped and how to use it; mark the feedback done.

## One owner per rule

**Anything this app decides or computes lives in ONE function, in one module, and every path calls
it.** Not only derived values — validation rules, requirement lists, eligibility gates and render
paths too. A rule written down twice is a rule that will disagree with itself; the only question is
when you find out, and here it is usually a printed document or a club's money.

Adapted from the Lettiva project's "derived values have ONE owner", widened because in Remi the
thing that gets copied is normally a *rule*, not a number.

- A new concept ships with its **type, its function, and a guard test** that fails the suite if a
  second copy appears.
- Raw fields — money, dates, statuses — are used for arithmetic or comparison **only inside the
  module that owns them**.
- **Before adding a check, a fee, a requirement or a renderer, go and find the existing one.** If
  it already exists in a second place, that duplication IS the bug. Fix it; never add a third copy.
  Hand-mirroring a rule into one more place only sets up the next failure.
- Enter every file sceptically: is there one owner for this, or has it been recomputed inline? Does
  it call the shared function or hand-roll its own? Is there a second copy elsewhere in the app?
  "It was already like that" is never a reason to leave it.

Found the hard way — each of these was a rule we had written down twice:

- **Pedigree, 2026-09-11.** `dogs.update` refused to clear sire/dam/breeder/colour, but the dog
  form autosaves those same columns through `/api/dog-autosave/[dogId]`, which had no such rule —
  so clearing the sire was saved before Save was ever pressed, and it then *disarmed* the other
  guard (which only fires when the old value was non-blank). One rule now, `lib/dog-pedigree.ts`.
- **Regional requirements, 2026-09-11.** What a regional entry needs is declared in THREE places —
  `svEntryMissingRequirements` (server), `svMissingRequirements` (client only), and `dog-form`'s
  own list (client, create only). Six fields are required by a button and by nothing else.
- **Creation paths, 2026-09-11.** Four ways to create a dog or an entry, each with a different idea
  of what is required; `secretary.createManualEntry` runs none of the gates `orders.checkout` does.
  A previous fix mirrored exactly ONE rule (duplicate classes) into it and left every other rule
  behind — the comment in that guard says so in as many words.
- **Money, 2026-09-08.** Two settlement computations with no cross-check under-settled a club by
  £52.51 (`fe38c179` added the reconciliation guard).
- **Catalogues, 2026-09-08.** `generateCataloguePdf` and the snapshot renderer were two paths that
  had to agree; collapsed to one in `9cc33b60`.

Known duplications still standing, so nobody re-discovers them as new: the special-awards carve-out
(six renderers that must EACH branch on `isSpecialAwardClass`), and the catalogue route vs
`pdf-generation.ts` split where `marked`/`absentees` live only in the route.
