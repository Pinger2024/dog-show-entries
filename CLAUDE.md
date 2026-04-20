# Remi — Dog Show Entry Management System

## Project Overview

Remi is a dog show entry management platform for the UK Kennel Club show circuit. It handles show creation, online entries, payments (Stripe), and catalogue generation. Built with Next.js App Router, tRPC, Drizzle ORM (PostgreSQL), and shadcn/ui.

**Live URL:** https://remishowmanager.co.uk
**Hosting:** Render (web service `srv-d6g578a4d50c73dj4rpg`)
**Database:** PostgreSQL on Render
**Email:** Resend (sending from `noreply@remishowmanager.co.uk`)
**Payments:** Stripe
**DNS:** Cloudflare for `remishowmanager.co.uk` (zone `e8d86cbbc2aadf1aac365d637f85969e`)

## Key People

- **Michael** (`michael@prometheus-it.com`) — Developer/admin. Gets notified of all feedback.
- **Amanda** (`hundarkgsd@gmail.com`, show email: `mandy@hundarkgsd.co.uk`, Remi email: `mandy@remishowmanager.co.uk`) — Secretary of Clyde Valley GSD Club and co-founder. Primary user and source of feature requests. She emails feedback to `feedback@inbound.remishowmanager.co.uk`.

## Feedback Loop Workflow

Amanda sends feedback, bug reports, and feature requests by replying to Remi emails (or emailing `feedback@inbound.remishowmanager.co.uk` directly). The pipeline:

1. Outgoing emails include `replyTo: feedback@inbound.remishowmanager.co.uk`
2. Resend receives inbound email via MX record on `inbound.remishowmanager.co.uk`
3. Resend fires `email.received` webhook → `POST /api/webhooks/resend`
4. Webhook verifies via svix, fetches full email body via `resend.emails.receiving.get()`, stores in `feedback` table
5. Notification email sent to Michael at `michael@prometheus-it.com`
6. Michael triages at `/feedback` (admin-only page)

**The expectation:** Amanda emails in requests → Claude works on them → emails Amanda when complete. Check `/feedback` for pending items.

## Important Env Vars

| Variable | Purpose |
|----------|---------|
| `RESEND_API_KEY` | Resend API key for sending/receiving |
| `RESEND_WEBHOOK_SECRET` | Svix signing secret for webhook verification |
| `FEEDBACK_EMAIL` | Reply-To address (`feedback@inbound.remishowmanager.co.uk`) |
| `EMAIL_FROM` | Sending address (`Remi <noreply@remishowmanager.co.uk>`) |
| `FEEDBACK_NOTIFY_EMAIL` | Who gets notified of new feedback (`michael@prometheus-it.com`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |

## Tech Stack & Patterns

- **Framework:** Next.js 15 App Router
- **API:** tRPC with superjson transformer
- **DB:** Drizzle ORM with PostgreSQL, schema in `src/server/db/schema/`
- **Auth:** NextAuth.js with Google provider, role-based access (exhibitor, secretary, admin)
- **UI:** shadcn/ui components, Tailwind CSS, Lucide icons
- **Procedures:** `publicProcedure`, `protectedProcedure` (logged in), `secretaryProcedure` (secretary/admin)

## Mobile First (IMPORTANT)

**Everything we build is mobile first.** Amanda and most secretaries use their phones. Every component, layout, and form must look great on a ~375px screen before we think about desktop.

Rules:
- Design for mobile viewport first, then enhance for larger screens with `sm:` / `md:` / `lg:` breakpoints
- Inputs, buttons, and form rows should **stack vertically on mobile** (`grid-cols-1`, then `sm:grid-cols-2` etc.)
- Never put 3+ items in a horizontal row on mobile — use `flex-col sm:flex-row` or `grid-cols-1 sm:grid-cols-3`
- Touch targets must be at least 44px (`min-h-[2.75rem]`)
- Test inline action panels (checklist command center) at narrow widths — they render inside cards that are already indented

## Target Users & UX Philosophy (IMPORTANT)

**Our primary users are typically 60+ year old women who love dogs and are not confident with computers.** Think Amanda — she's brilliant at running dog shows but technology is not her comfort zone. Every screen, every form, every interaction must pass the test: "Would this intimidate someone who didn't grow up with computers?"

Rules:
- **Simple over clever** — if a feature looks complex, it IS too complex. Reduce visible options, use progressive disclosure (basics first, advanced behind expandable sections)
- **Less text on screen** — every word competes for attention. Cut ruthlessly. Use short, plain English labels. No jargon, no technical terms
- **Visual calm** — generous whitespace, clear hierarchy, one primary action per screen. Cluttered = scary
- **Every screen should say "I can do this"** — if a user's first reaction is "this looks complicated", we've failed regardless of how powerful the feature is
- **Guide, don't overwhelm** — step-by-step flows, clear next actions, helpful descriptions. Hand-hold without being patronising
- **Functionality stays, complexity goes** — never remove features to simplify. Instead, present them progressively and design the UI so power is accessible without being intimidating

## Project Structure

```
src/
  app/
    (dashboard)/     — Exhibitor pages (behind auth)
    (shows)/         — Public show pages
    api/webhooks/    — Stripe and Resend webhook handlers
  server/
    db/schema/       — Drizzle table definitions + enums
    trpc/routers/    — tRPC route handlers
    services/        — Email, Stripe services
  components/
    layout/          — DashboardShell, SecretaryShell
    ui/              — shadcn components
```

## User Roles

- **exhibitor** — Default. Can enter shows, manage dogs.
- **secretary** — Can create/manage shows, view entries, upload schedules.
- **admin** — Full access including `/feedback` inbox.

## Sending Emails to Amanda

When sending update/notification emails to Amanda, use the Resend API with:
- `from: "Remi <noreply@remishowmanager.co.uk>"`
- `to: ["mandy@hundarkgsd.co.uk"]` (her show email) or `hundarkgsd@gmail.com` (her personal) or `mandy@remishowmanager.co.uk` (her Remi mailbox)
- `reply_to: "feedback@inbound.remishowmanager.co.uk"` so her replies feed back into the system

## DNS Notes

`remishowmanager.co.uk` DNS is managed via **Cloudflare** (zone ID `e8d86cbbc2aadf1aac365d637f85969e`). Three email services coexist:

- **Zoho Mail** owns the root MX (`mx.zoho.eu`, `mx2.zoho.eu`, `mx3.zoho.eu`) — provides personal mailboxes (`michael@`, `mandy@`)
- **Resend inbound** owns `inbound.remishowmanager.co.uk` MX (`inbound-smtp.eu-west-1.amazonaws.com`) — provides the feedback webhook pipeline
- **Resend sending** uses `send.remishowmanager.co.uk` for SES return path + `resend._domainkey` for DKIM — handles outbound email

The lettiva.com domain is no longer used — migrated to remishowmanager.co.uk on 2026-04-10 after a DNS move broke the inbound email pipeline.

## Database Migrations

Use `npx drizzle-kit push` to sync schema changes to the database. No migration files — push mode.

## Testing

**411 integration tests across 39 files**, covering every user journey in `TESTING_MAP.md`.

### Running tests

```bash
npm test              # full suite (pretest auto-pushes schema to remi_test DB)
npx vitest run --run src/__tests__/integration/  # skip pretest hook (faster)
npm run test:watch    # watch mode
```

### Test infrastructure

- **Framework:** Vitest 3.2.4 with Postgres-backed integration tests
- **Local DB:** Homebrew `postgresql@16` with `remi_test` database (not Docker)
- **CI:** GitHub Actions with a Postgres service container (`.github/workflows/test.yml`)
- **Config:** `vitest.config.ts` loads `.env.test` for test env vars; `singleFork: true` keeps all tests in one process

### Test helpers (`src/__tests__/helpers/`)

| File | Purpose |
|------|---------|
| `setup.ts` | Global mocks for Stripe, Resend, results-notifications, email senders, NextAuth. Runs `cleanDb()` before each test. |
| `db.ts` | `testDb` (Drizzle instance against `remi_test`), `cleanDb()` (TRUNCATE CASCADE, refuses non-localhost URLs) |
| `context.ts` | `createTestCaller(user)` — builds a tRPC caller with an injected session, bypasses NextAuth entirely |
| `factories.ts` | `makeUser`, `makeOrg`, `makeShow`, `makeDog`, `makeEntry`, `makeResult`, `makeJudge`, `makeStewardAssignment`, `makeOrder`, `makePayment`, `makePlan`, `makeSponsor`, `makeFeedback`, `makeBacklogItem`, etc. + convenience builders like `makeSecretaryWithOrg()`, `makeSecretaryWithOrgAndBreed()` |
| `stripe-event.ts` | `injectStripeEvent(event)`, `buildStripeWebhookRequest()` — for Stripe webhook route testing |
| `resend-mocks.ts` | Shared `resendMocks.send` capture for email payload assertions |

### Writing a new test

```typescript
const { user, org } = await makeSecretaryWithOrg();
const show = await makeShow({ organisationId: org.id, status: 'in_progress' });
const caller = createTestCaller(user);
await caller.secretary.someMutation({ showId: show.id });
expect(...).toBe(...);
```

### Testing rules

- **Every bug Amanda reports becomes a test first, fix second.** The suite grows where it matters.
- **New features include a journey test.** One test that strings multiple procedures together.
- **Mock external services, not the DB.** Tests use real Postgres and real Drizzle queries. Stripe, Resend, S3/R2 are mocked at the service boundary.
- **Don't mock the database.** Use transactions or `cleanDb()` between tests.
- **Assert payload shapes, not email HTML.** For email tests, check `to`, `subject`, and key body content — not exact HTML.
- **`TESTING_MAP.md` is the canonical coverage checklist.** Tick rows as tests land. Add new rows as features ship.

## Feature Development Workflow

When building new features (not bug fixes), always follow this research-first approach:

1. **Research first** — Before writing any code, launch a research agent (Task tool with `subagent_type: "Explore"` or `"general-purpose"`) to investigate:
   - How best-in-class apps solve this problem (competitors, adjacent industries)
   - What the RKC/dog show world specifically needs (regulations, conventions, workflows)
   - UX patterns that would make the feature innovative rather than just functional
   - What data we already have in the schema that could make the feature richer

2. **Think through the full user journey** — Before building, walk through every step a user takes. Ask: "What does Amanda do before this feature? What does she do after? Where does she expect to find it? What happens if something goes wrong?" Design the complete flow end-to-end, not just the technical piece. Features should feel finished from the user's perspective — not just functional from the developer's perspective.

3. **Design for innovation** — Remi isn't just digitising paper processes. Every feature should ask: "What can we do that paper/PDFs/spreadsheets never could?" Think real-time updates, smart automation, cross-referencing data, proactive notifications, and mobile-first workflows.

4. **Build and ship** — Implement, test (`npm run build`), commit, push, mark feedback completed, email Amanda.

5. **Close the loop** — Always email Amanda when a feature ships, with clear instructions on how to use it and encouragement to share feedback.
