# Remi — Dog Show Entry Management System

## Project Overview

Remi is a dog show entry management platform for the UK Kennel Club show circuit. It handles show creation, online entries, payments (Stripe), and catalogue generation. Built with Next.js App Router, tRPC, Drizzle ORM (PostgreSQL), and shadcn/ui.

**Live URL:** https://remi-pf1p.onrender.com
**Hosting:** Render (web service `srv-d6g578a4d50c73dj4rpg`)
**Database:** PostgreSQL on Render
**Email:** Resend (sending from `noreply@lettiva.com`)
**Payments:** Stripe
**DNS:** Vercel nameservers for `lettiva.com`

## Key People

- **Michael** (`michael@prometheus-it.com`) — Developer/admin. Gets notified of all feedback.
- **Amanda** (`hundarkgsd@gmail.com`, show email: `mandy@hundarkgsd.co.uk`) — Secretary of Clyde Valley GSD Club. Primary user and source of feature requests. She emails feedback to `feedback@inbound.lettiva.com`.

## Feedback Loop Workflow

Amanda sends feedback, bug reports, and feature requests by replying to Remi emails (or emailing `feedback@inbound.lettiva.com` directly). The pipeline:

1. Outgoing emails include `replyTo: feedback@inbound.lettiva.com`
2. Resend receives inbound email via MX record on `inbound.lettiva.com`
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
| `FEEDBACK_EMAIL` | Reply-To address (`feedback@inbound.lettiva.com`) |
| `FEEDBACK_NOTIFY_EMAIL` | Who gets notified of new feedback (`michael@prometheus-it.com`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |

## Tech Stack & Patterns

- **Framework:** Next.js 15 App Router
- **API:** tRPC with superjson transformer
- **DB:** Drizzle ORM with PostgreSQL, schema in `src/server/db/schema/`
- **Auth:** NextAuth.js with Google provider, role-based access (exhibitor, secretary, admin)
- **UI:** shadcn/ui components, Tailwind CSS, Lucide icons
- **Procedures:** `publicProcedure`, `protectedProcedure` (logged in), `secretaryProcedure` (secretary/admin)

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
- `from: "Remi <noreply@lettiva.com>"`
- `to: ["mandy@hundarkgsd.co.uk"]` (her show email) or `hundarkgsd@gmail.com` (her personal)
- `reply_to: "feedback@inbound.lettiva.com"` so her replies feed back into the system

## DNS Notes

`lettiva.com` DNS is managed via **Vercel** (not LCN, even though LCN is the registrar). Key records for inbound email:
- MX: `inbound` → `inbound-smtp.eu-west-1.amazonaws.com` (priority 10)
- TXT: `resend._domainkey.inbound` → DKIM key
- A: `inbound` → `127.0.0.1` (overrides wildcard CNAME `*.lettiva.com → cname.vercel-dns.com`)

## Database Migrations

Use `npx drizzle-kit push` to sync schema changes to the database. No migration files — push mode.

## Feature Development Workflow

When building new features (not bug fixes), always follow this research-first approach:

1. **Research first** — Before writing any code, launch a research agent (Task tool with `subagent_type: "Explore"` or `"general-purpose"`) to investigate:
   - How best-in-class apps solve this problem (competitors, adjacent industries)
   - What the KC/dog show world specifically needs (regulations, conventions, workflows)
   - UX patterns that would make the feature innovative rather than just functional
   - What data we already have in the schema that could make the feature richer

2. **Design for innovation** — Remi isn't just digitising paper processes. Every feature should ask: "What can we do that paper/PDFs/spreadsheets never could?" Think real-time updates, smart automation, cross-referencing data, proactive notifications, and mobile-first workflows.

3. **Build and ship** — Implement, test (`npm run build`), commit, push, mark feedback completed, email Amanda.

4. **Close the loop** — Always email Amanda when a feature ships, with clear instructions on how to use it and encouragement to share feedback.
