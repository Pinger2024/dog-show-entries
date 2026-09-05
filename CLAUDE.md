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
4. **Build it fully** — never an MVP, never the minimal fix. Root cause, every call site.
5. **Test** — every bug Mandy reports becomes a test *first*, fix second; new features get a
   journey test. **Prove the test fails** before trusting it. One vitest at a time
   (`singleFork`), and a few tests are order-dependent so a lone green run isn't proof. Mock
   external services, never the DB.
6. **🚦 Demo, then get a tested OK — a green build is NOT permission to ship.** Deploy to demo,
   use the artefact the way Mandy will, wait for Michael or Mandy to confirm, then push.
7. **Close the loop** — Telegram Mandy what shipped and how to use it; mark the feedback done.
