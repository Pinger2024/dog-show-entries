# Autonomous Run — 2026-06-08

Unattended run kicked off while Michael is out. Branch: `fix/bug-hunt-2026-06-04`.
This file is the resume anchor (survives context compaction) AND Michael's report. Read it first on any wake-up.

## ⭐ SESSION SUMMARY (read this first)
- **Baseline:** started RED (3 stale tests lagging deliberate commits) → realigned → committed `0e05b2a` → green.
- **Phase 1 bug hunt:** workflow confirmed 27 bugs. **16 fixed + tested + committed** (1 critical, 8 high, 7 med/low):
  `245e922` #1 cross-org privilege-escalation (CRITICAL) · `b0591be` #6 withheld-address leak ·
  `24c66d0` #7+#18 sponsor IDOR · `9a37a68` #2 manual-entry overcharge · `84f168f` #3 abandoned-PI ·
  `dd4fb25` #4 payout-on-upgrade · `c0103c7` #5 JH/SAC numbering · `fdc3718` #9 declined-retry upgrade ·
  `6aa1cd1` #10 discount-group delete · `d678d8f` #14+#15 steward lock/award · `fede3fe` #27 sundry cap ·
  `5d6c347` #24+#25 results-email dog · `cbada7a` #23 dog re-create. **11 documented** → `BUGHUNT_DEFERRED.md`.
- **Phase 2 mobile sweep:** ⛔ BLOCKED — Chrome DevTools MCP server killed (my too-broad pkill). Needs restart.
- **Phase 4 secretary audit (functional pass DONE):** 48-agent fan-out over all 133 secretary procs + 22 pages,
  adversarially verified (16 false positives filtered). **3 fixed** `801f0f0` (HIGH cross-org schedule-data leak,
  dup manual entry, results_published checklist). **17 documented** → `SECRETARY_DASHBOARD_AUDIT.md` (`dfb4bb0`).
- **Phase 5 steward journey (functional pass DONE):** 18-agent journey walk (21 procs + 3 pages + shell).
  **4 fixed** `13ce692` (absent-dog-as-winner HIGH, cross-club pre-judging leak, achievement wire over-fetch,
  breed-null class visibility). **17 documented** (incl. placement collision + judge-approval lock) →
  `STEWARD_JOURNEY_AUDIT.md` (`2010361`).
- **Phase 3 testing-map:** `e0fac7f` #69 sundry report + `b475a35` #126 entry-confirmation email PAYLOAD
  (via `vi.importActual`). Remaining gaps are browser/external-bound (Mixam pricing, Google OAuth, print PDF+R2)
  or payload rows whose call-wiring is already covered. Suite now **809 green**.
- **⚠️ ACTION FOR MICHAEL:** TWO live security fixes committed-not-deployed — `245e922` (CRITICAL cross-org
  privilege esc., Phase 1) and `801f0f0` (HIGH cross-org schedule-data/PII leak, Phase 4). Your call on the hotfix.
  Nothing is pushed; 7 audit fixes this continuation are test-first + suite-green. The process `.md` files
  (AUTONOMOUS_RUN / BUGHUNT_* / *_AUDIT) should be stripped before any PR to main.
- **Browser-free work is now exhausted.** To resume the visual phases (Phase 2 + the look-and-feel halves of
  Phase 4/5): restart the chrome-devtools MCP, then say "continue".

## Spine / continuity
- Driver: background tasks (tests/workflows) re-invoke me on completion; fallback `ScheduleWakeup` each idle turn.
- On every wake-up: read THIS file → find first phase not `DONE` → continue from its sub-progress.

## GUARDRAILS (hard rules — never break)
1. **No push to prod / origin.** Work stays on local branch `fix/bug-hunt-2026-06-04`.
2. **No emails to Amanda / users / anyone.** No Resend sends.
3. **No `drizzle-kit push` against prod or demo DBs.** Test DB (`remi_test`) only, via `npm test`'s pretest.
4. **Commit by EXPLICIT PATH ONLY.** Never `git add -A` / `git add .`.
5. **DO NOT touch / commit these pre-existing dirty files (other people's in-flight work):**
   - `src/server/db/schema/show-breeds.ts` (new, untracked) — all-breed work
   - `src/server/db/schema/index.ts` (+showBreeds export) — all-breed work
   - `src/server/db/schema/shows.ts` (+showBreeds relation) — all-breed work
   - `src/server/trpc/routers/print-orders.ts`, `src/lib/print-products.ts`,
     `src/__tests__/integration/print-orders.test.ts`, `public/prize-cards/*.jpg` — print in-flight work
   - `.gitignore`, `.claude/`, `AGENTS.md`, `ALL_BREED_SHOWS_PLAN.md`, `research/`, `scripts/_*`, `drizzle/`, etc.
6. If any single change can't go green after ~3 tries → **revert that change**, log it under "Stuck/Skipped", move on.
7. Each fix: **failing test first → fix → full `npm test` green → commit** (CLAUDE.md rule).

## Baseline
- [x] `npm test` was RED at start: 3 failures, ALL stale tests lagging deliberate commits.
      Realigned + committed `0e05b2a` (storage 5MB→15MB, SV Baby Puppy now included,
      dogs.create required-owners contract). Green-confirm re-run in progress.
      None of the three were regressions; UI/code evidence + git history + Amanda's own
      corrections back each. Full diagnosis in commit body.

## Phase 1 — Bug hunt  (status: ✅ DONE — 16 fixed+tested+committed, 11 documented for review)
Fixed (each with a threat/cross-check test, suite green): #1,#2,#3,#4,#5,#6,#7,#9,#10,#14,#15,#18,#23,#24,#25,#27.
Documented in BUGHUNT_DEFERRED.md (verdict + fix, held back as product-judgment / delicate-accounting /
heavy-display): #8,#11,#12,#13,#16,#17,#19,#20,#21,#22,#26. Original detail in BUGHUNT_FINDINGS.md.
--- original phase note below ---
## Phase 1 — Bug hunt  (original plan)
- Workflow: fan out finders across subsystems → adversarially verify each → for REAL bugs: write failing test → fix → `npm test` green → commit (explicit paths).
- DONE when: 2 consecutive finder rounds surface nothing new, OR budget exhausted.
- Fixes committed individually.

## Phase 2 — Mobile visual QA sweep  (status: ⛔ BLOCKED — Chrome DevTools MCP disconnected)
- The chrome-devtools MCP server got killed while clearing a stuck automation Chrome (a too-broad
  `pkill -f chrome-devtools-mcp` matched the server process, not just its Chrome). Its tools are gone
  for this session and can only be restored by restarting the MCP (harness/user side).
- Dev server is still up on :3000. When the Chrome MCP is back: emulate 375px, use
  `scrollWidth > clientWidth` per page as the overflow signal + screenshots; secretary/exhibitor pages
  need a magic-link login (no credentials provider — adapt `scripts/_demo-magic-link.ts` for the dev DB).
- PIVOTED to Phase 3 (browser-free) to keep delivering value.
--- original phase note below ---
## Phase 2 — Mobile visual QA sweep  (original plan)
- Start `npm run dev` (port 3000); drive Chrome DevTools MCP at 375px width.
- Enumerate page list up front, one pass each. Fix overflow / layout / touch-target breaks. Before/after screenshots.
- DONE when: every enumerated page visited once and breaks fixed-or-logged.

## Phase 3 — TESTING_MAP gaps  (status: PENDING)
- TESTING_MAP table has ~15 partial (🟠) rows (the "5" summary line is stale).
- Bounded high-value subset (no browser/OAuth-only ones). Candidate targets:
  - #69 sundry report (`getSundryItemReport`)
  - #126/#127 entry-confirmation + secretary-notification email payload assertions
  - #129/#130/#131 results email/notification payload assertions
  - #21/#124 catalogue/bundled checkout deeper path
- DONE when: chosen subset has passing tests; skipped ones logged with reason.

## Phase 4 — Secretary dashboard full functional + UX audit  (status: FUNCTIONAL PASS DONE 2026-06-08 — visual/375px half still pending Chrome MCP)
- Done: workflow wku1a4nzw (48 agents) audited all 133 secretary procs + shows procs + 22 pages across 12 domains → adversarial verify. 20 confirmed, 16 refuted, 1 UX. Deliverable: SECRETARY_DASHBOARD_AUDIT.md.
- Fixed 3 reachable/verified bugs → commit 801f0f0 (+5 tests, suite 802): getPreviousScheduleData cross-org leak (HIGH), createManualEntry dup guard (MED), results_published checklist key (LOW).
- 17 documented for review (Settings cross-org save-corruption + 2 blank-number bugs ranked first; schema-push / product-judgment / hardening below them). ⚠️ HIGH cross-org PII leak — pinged Michael, recommend hotfix.
- Remaining: visual/mobile sweep of every secretary screen (tagged "needs visual pass") once Chrome MCP is back.
- Go through EVERY secretary function / page / route. For each: (a) does it work correctly? (b) is it as
  user-friendly as it could be for a non-technical 60+ user, mobile-first (CLAUDE.md philosophy)?
- Method: hybrid — (1) fan-out code/functional audit of every `secretary.*` procedure + secretary page;
  (2) drive the REAL running app via Chrome DevTools at 375px through the flows. Needs a logged-in
  secretary session + a show with data — resolve auth first (candidates: demo magic-link
  `scripts/_demo-magic-link.ts`, seed + credentials login, or admin impersonation route).
- Deliverable: `SECRETARY_DASHBOARD_AUDIT.md` — every function listed with status (works / broken /
  clunky), severity, and a concrete improvement suggestion.
- Policy: AUTO-FIX only clear FUNCTIONAL bugs (test-first → green → commit). UX/friendliness changes are
  DOCUMENTED for Michael + Amanda to decide, NOT applied unsupervised (UX is their call per philosophy).
- DONE when: every secretary function audited + documented.

## Phase 5 — Steward journey walkthrough + UX audit  (status: FUNCTIONAL PASS DONE 2026-06-08 — on-the-day visual feel still pending Chrome MCP)
- Done: workflow woc17eyaz (18 agents) walked the whole steward event-day journey (21 procs + 3 pages + shell) across 5 steps → adversarial verify. 11 functional/security confirmed, 10 UX/journey, 2 refuted. Deliverable: STEWARD_JOURNEY_AUDIT.md.
- Fixed 4 reachable/verified bugs → commit 13ce692 (+5 tests, suite 807): absent dog showing as winner on public results (HIGH), cross-club pre-judging leak (MED/security), unpublished-achievement wire over-fetch (MED), breed-scoped steward losing JH/breed-null classes (MED).
- Documented: placement collision (HIGH, needs (showClassId,placement) index) + judge-approved-edit lock & resubmit (HIGH/MED, state-machine care) ranked first; breed-scoping write-enforcement (latent/all-breed-adjacent); SV-grade + award-eligibility server validation; 10 UX/journey gaps led by the end-of-day dead-end + unsequenced publish/submit steps.
- Remaining: on-the-day mobile feel (taps/375px/dead-end+checklist screens) once Chrome MCP is back.
- Put myself in the shoes of a steward at an event; walk the WHOLE steward journey end to end; assess how
  the process actually functions for them on the day (ring management, marking, calling classes, etc.).
- Method: drive the real app via Chrome DevTools as a steward (steward assignment + steward shell), plus
  trace `steward.*` procedures + steward pages. Note friction, broken steps, confusing UI, mobile issues.
- Deliverable: `STEWARD_JOURNEY_AUDIT.md` — each step of the journey: what works, what's broken/clunky, fix.
- Policy: same as Phase 4 (fix functional bugs; document UX for review).
- DONE when: full steward journey walked + documented.

## Log
- 2026-06-08 ~06:30 — Pre-flight: confirmed do-not-commit set, dev=`next dev`, baseline test launched.
- 2026-06-08 ~06:47 — Baseline RED (3 stale tests) → realigned → committed 0e05b2a → full suite GREEN 769/769.
- 2026-06-08 ~06:50 — Phase 1 bug-hunt workflow launched (background, read-only find+verify, 12 finders).
  Dev server warming in background (/tmp/devserver.log) for Phase 2. Fixes will be applied sequentially
  in the main loop (test-first → green → commit) once the workflow returns the verified list.

## Bugs found / fixed
Phase 1 workflow confirmed **27 bugs** (1 critical, 9 high, 13 medium, 4 low) — full detail in
`BUGHUNT_FINDINGS.md`. Triage (per advisor): fix+commit security/money where a correct reference exists;
`[DOC]` the product-judgment ones (#8 joint-owner feature, #11 dup-cart, #19 fee-in-email, #21 follower-skip).
Tests encode the THREAT/cross-check, not a hand-typed constant. Re-grep lines before each edit (snapshot drift).

FIXED:
- [x] #1 CRITICAL cross-org privilege escalation (invitations.send) → commit 245e922 (+cross-org FORBIDDEN test). Michael pinged re: live prod exposure.
- [x] #7+#18 cross-org sponsor IDOR (11 sponsor/show/class-sponsor procedures) → commit 24c66d0 (+sponsor-access.test.ts).
- [x] #6 catalogue JSON export leaked withheld owner addresses → commit b0591be (+catalogue-privacy unit test).

SECURITY/PRIVACY BATCH DONE (#1,#6,#7,#18).
- [x] #2 manual-entry overcharge (fee ladder, NFC) → commit 9a37a68 (+parity cross-check test vs checkout).

- [x] #3 stale-order cleanup now cancels the abandoned Stripe PaymentIntent → commit 84f168f (+test).

- [x] #4 listPayouts underpaid club on class upgrades (order total now bumped in webhook) → commit dd4fb25 (+test).

Now remaining high-severity. IN PROGRESS: #5 (JH/Special Award classes get RKC numbers, must be unnumbered).
- [x] #5 JH/Special Award classes kept unnumbered across reorder/resort/bulkCreate (shared helper) → commit c0103c7 (+test).
- [x] #9 deferred upgrade now applies after declined-then-retried card → commit fdc3718 (+decline/retry test).

- [x] #10 block deleting a discount group that existing orders use → commit 6aa1cd1 (+2 tests).

✅ ALL CRITICAL + HIGH-SEVERITY DONE (#1,#2,#3,#4,#5,#6,#7,#9,#10,#18). 10 commits, suite green 785. Michael pinged (milestone).
REMAINING: #8 (HIGH but DOC-only — joint-owner, likely false positive, verify before any change).
  Mediums to fix: #12,#13,#14,#15,#16,#17,#20,#22,#23. DOC mediums: #11,#19,#21.
  Lows: #24,#25 (same root), #26, #27.
  Then phases 2 (mobile sweep) → 3 (testing-map) → 4 (secretary audit) → 5 (steward journey).
- [x] #14+#15 steward results-lock + show-award uniqueness → commit d678d8f (+3 tests).
- [x] #27 sundry maxPerOrder bypass → commit fede3fe (+test).
- [x] #24+#25 results email subject names correct dog → commit 5d6c347 (+test).
- [x] #23 dog re-create restores soft-deleted instead of 500 → commit cbada7a (+tests).
IN PROGRESS: #12 (show-metrics double-subtracts downgrade refund), #20 (re-publish re-sends emails).
THEN DOC (verify+write up, no code): #8 (likely FALSE POSITIVE — joint-owner), #11, #19, #21, and catalogue/
financial-display #13/#16/#17/#22/#26 (heavy component context — document precise fix for follow-up). Then Phase 2.
DOC bucket (no code change, write up for Michael): #8 (joint-owner — possible false positive), #11 (dup cart),
#19 (email omits platform fee), #21 (follower skip). Will batch-document after the high-sev fixes.

## Stuck / Skipped
(none yet)
