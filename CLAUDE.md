# Remi — Dog Show Entry Management System

Dog show entry management for the UK **Royal Kennel Club (RKC)** circuit — show creation, online
entries, Stripe payments, catalogue and document generation.
Live https://remishowmanager.co.uk · Render `srv-d6g578a4d50c73dj4rpg` · Postgres 18.

## How to read this file

**The code is ground truth.** Where this file or a memory contradicts the code, the code is
right and the doc is stale — trust the code, then fix the doc. Nothing here restates what the
repo already tells you; look it up instead:

| Want | Look at |
|---|---|
| Stack, versions | `package.json` |
| Env vars | `.env.example` |
| Layout, route groups | `ls src/app` |
| Schema, enums, user roles | `src/server/db/schema/` |
| Test helpers, factories | `src/__tests__/helpers/` |
| Coverage checklist | `TESTING_MAP.md` |
| Migrations | `drizzle.config.ts` — push mode, no migration files |

Process rules, traps and infrastructure reference (email/DNS, money rules, mobile CSS traps,
deploy gotchas) live in Claude's memory directory. **This file holds only what the code can't
tell you.** Don't grow it back — every fact here that describes *state* rather than a *decision*
will rot silently.

## Conventions

- **Always write "RKC"** — never "KC" or "Kennel Club".
- Conventional commits + Co-Authored-By. Run `/simplify` after every commit.
- UI: shadcn/ui + Tailwind, `font-serif` headings, Lucide icons.

## Key people

- **Michael** (`michael@prometheus-it.com`) — co-founder (tech), developer/admin.
- **Mandy** — Amanda formally, but **always call her Mandy**. Co-founder (industry), 50% partner,
  **equal authority to Michael**. Secretary of Clyde Valley GSD Club, primary user, source of
  most feature requests.

## Who we build for — the most important thing in this file

**Primarily 60+ year old women who love dogs and are not confident with computers.** Every screen
must pass: "would this intimidate someone who didn't grow up with computers?"

- **Simple over clever** — if it looks complex, it IS too complex. Use progressive disclosure.
- **Less text** — cut ruthlessly. Short, plain English, no jargon.
- **Visual calm** — whitespace, clear hierarchy, one primary action per screen.
- **Functionality stays, complexity goes** — never remove a feature to simplify; reveal it
  progressively.
- **Mobile first, always** — secretaries work on phones. Nothing ships that isn't right at
  ~375px: rows stack (`grid-cols-1` → `sm:`), never 3+ across on mobile, touch targets ≥44px
  (`min-h-[2.75rem]`). The specific overflow traps are in memory — read them before touching
  layout.

## Payments — Remi is merchant of record

Exhibitors pay **Remi's** Stripe account; Remi BACSes the net to each host club after entries
close. No Stripe Connect, no club-side KYC.

- Exhibitor is charged `totalAmount + platformFee` (£1 + 1%); `platform_fee_pence` on `orders`
  records the split.
- Club supplies sort code + account number at `/secretary/club`. **`shows.update` refuses
  `entries_open` until all three payout fields are set** (checklist key `payout_details_set`).
- Admin records each BACS payout at `/admin/payouts`. Chargeback liability is Remi's.
- Club→Remi SaaS billing is separate (`/secretary/billing`); print orders separate again (Remi
  is the buyer).

⚠️ **Stripe Connect code exists and is DORMANT, not live** — `stripe-connect.ts`,
`/api/stripe/connect/*`, `stripe_*` columns. Kept for a possible future marketplace model; don't
read it as the active payment path. See `project_stripe_connect_migration.md`.

> Money rules in memory are not optional reading: `show-metrics.ts` is the single source for
> figures, Stripe payouts are account-wide, everything reconciles to the penny.

## How we work

1. **Research first** — before code, investigate how the best apps solve it, what RKC/dog-show
   convention requires, and what's already in the schema. Fan it out in a workflow with Sonnet
   agents. **Ask Mandy the domain questions BEFORE building** — never ship "maybe, please check".
2. **Design the whole journey** — what does Mandy do before this, and after? Where does she
   expect to find it? What happens when it goes wrong?
3. **Don't just digitise paper** — ask what paper and spreadsheets could never do.
4. **Build it fully** — never an MVP, never the minimal fix. Root cause, every call site.
5. **Test** — every bug Mandy reports becomes a test *first*, fix second; new features get a
   journey test. **Prove the test fails** before trusting it. One vitest at a time
   (`singleFork`), and a few tests are order-dependent so a lone green run isn't proof. Mock
   external services, never the DB.
6. **🚦 Demo, then get a tested OK — a green build is NOT permission to ship.** Deploy to demo,
   use the artefact the way Mandy will, wait for Michael or Mandy to confirm, then push.
7. **Close the loop** — email Mandy what shipped and how to use it; mark the feedback done.
