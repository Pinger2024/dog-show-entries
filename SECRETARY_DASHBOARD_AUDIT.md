# Secretary Dashboard — Full Functional Audit (Phase 4)

Browser-free, code-level audit of **every** secretary function — all 133 `secretary.*`
tRPC procedures + the `shows.*` procedures behind the dashboard, and the 22 secretary
pages. Run as a 12-domain agent fan-out, each finding then **adversarially verified by
re-reading the code** (16 candidate findings were refuted this way and dropped — they are
not listed). Anything already recorded in the app-wide bug hunt (`BUGHUNT_FINDINGS.md` /
`BUGHUNT_DEFERRED.md`) was excluded.

Generated 2026-06-08 during the autonomous run. **Chrome MCP was down**, so this is the
functional + code-visible pass; the pure look-and-feel / mobile-at-375px sweep (Phase 2,
and the visual half of this phase) is still pending a working browser — those items are
tagged *needs visual pass*.

**Policy:** clear, reachable, tRPC-testable FUNCTIONAL/security bugs were auto-fixed
(test-first → full suite green → commit). Everything that needs a schema push, a product
decision, a client-only change with no test harness, or is defensive hardening against a
hand-crafted API call is **documented here for Michael + Mandy to decide** — not applied
unattended.

Result: **3 fixed**, **17 documented** (below), 1 UX note, 16 refuted.

---

## ✅ FIXED THIS RUN  (commit 801f0f0, +5 tests, suite 802 green)

### F1 · getPreviousScheduleData — cross-org data leak  (HIGH · security)
`secretary.ts` getPreviousScheduleData loaded the **target** show's `organisationId` and
returned the most-recent sibling show's full `scheduleData` — guarantors (home addresses),
prize money, sponsors, officers, on-call vet — with **no membership check**. Any secretary
could pass another club's public showId and read its private schedule data. The sibling
`getScheduleData` directly above does check membership; this one didn't. **Fix:** verify
active membership of the show's org (admin bypass) before using it. Same IDOR class as
bug-hunt #1. *Live cross-tenant PII — recommend a hotfix deploy (see Telegram).*

### F2 · createManualEntry — duplicate entry of same dog + class  (MEDIUM · functional)
Online checkout rejects entering the same dog in the same class twice; the manual
(postal/cash) path didn't — a second call created a duplicate catalogue row and a duplicate
order/payment record that **inflates club revenue reporting**. **Fix:** mirror the
`orders.ts` confirmed-overlap guard before inserting (rejects the dup; still allows the same
dog in a *different* class).

### F3 · "Publish results" checklist item never auto-ticked  (LOW · functional)
`default-checklist.ts` declares `autoDetectKey: 'results_published'` but
`getChecklistAutoDetect` never populated it, so the item could never auto-complete. **Fix:**
`detected.results_published = !!show.resultsPublishedAt`. (The sibling `judge_approvals_sent`
key is still unwired — see D14, needs the approval-state query.)

---

## 📋 DOCUMENTED — real user-facing correctness bugs (rank first)

### D1 · Settings page overwrites one club's branding with another's on org-switch  (MEDIUM · data-integrity)
`settings/page.tsx` uses an `initialised` boolean latch so the form only hydrates once. A
multi-org secretary (**Amanda is exactly this**) who switches active org via the switcher
gets the new org's data refetched, but the form keeps the **old** org's name/contact/logo.
`isDirty` flips true, a spurious "unsaved changes" bar appears, and Save writes the *old*
org's values onto the *new* org — silent cross-club corruption. **Recommend:** drop the
latch and key the hydrate effect on `org` identity, or `key={activeOrgId}` on the page to
force remount. *Not blind-fixed: client-only change, no React test harness here — verify in
the browser.* **needs visual pass** to confirm the fix.

### D2 · Newly added class prints a BLANK class number on the RKC schedule  (MEDIUM · functional)
`addShowClass` inserts a class without assigning `classNumber` (stays NULL). Every other
path (wizard, `bulkCreateClasses`, `autoAssign`) numbers inline. PDF generation reads
`classNumber` raw with no renumber first, and `class-labels.ts` falls back to an **empty
string** for a numberless breed class → a freshly-added class prints with a blank number on
the schedule/catalogue/ring board until the secretary manually clicks "Auto-number".
**Recommend:** after insert, refetch-and-renumber in RKC order (reuse `bulkCreateClasses`'
logic — a naïve `max+1` is wrong because order matters). *Not blind-fixed: touches the
class-numbering area hardened in bug-hunt #5; wants its own careful test.*

### D3 · Late online entry gets a BLANK catalogue number  (MEDIUM · functional)
`ensureCatalogueNumbers` early-exits the moment any entry is numbered (to keep printed
numbers stable). If a secretary proofs/numbers the catalogue while entries are still open,
then an online entry completes via the Stripe webhook (which sets `status:'confirmed'` but
**no** `catalogueNumber`), the next render early-exits and the new entry shows a blank number
sorted last. `secretary.addEntry` already does append-mode (`max+1`); the webhook-confirm
branch and the £0 free-entry path don't. **Recommend:** in those branches, if the show
already has numbered entries, assign `max+1`. *Not blind-fixed: touches the payment webhook —
delicate; wants a `stripe-webhook.test.ts` case.*

---

## 📋 DOCUMENTED — need a schema push / constraint redesign

> These require `drizzle-kit push` (prod + demo) or a unique-constraint change. Held back
> per the no-unattended-schema-push guardrail; some also touch the in-flight all-breed work.

### D4 · One judge can't be assigned to two breed groups — raw SQL error toast  (MEDIUM · functional)
The `judge_assignments` unique constraint is `(showId, judgeId, breedId, sex)` with
`nullsNotDistinct()`, and does **not** include `breedGroupId`/`judgeRoleId`. `assignGroupJudge`
always inserts `breedId=null, sex=null`, so assigning the same judge to a *second* breed group
collides and throws a hard Postgres unique violation — surfaced to a non-technical user as a
raw `Failed query: insert into "judge_assignments"…` toast. (Empirically reproduced by the
verifier.) Common in all-breed/group shows. **Recommend:** widen the constraint to disambiguate
group/SAC/breed assignment types (or a per-type partial unique index). *Schema change + relates
to the uncommitted all-breed `show_breeds` work — don't touch unattended.*

### D5 · addAndAssignJudge silently drops a distinct SAC assignment  (MEDIUM · functional)
Same root constraint. `onConflictDoNothing` targets `(showId, judgeId, breedId, sex)`, omitting
`isSpecialAwardsClassesJudge`. A SAC assignment `{null,null,SAC:true}` and a regular
`{null,null,SAC:false}` for the same judge share the key → one is silently dropped, count comes
back lower, no error. **Recommend:** include `isSpecialAwardsClassesJudge` in both the unique
constraint and the onConflict target, or validate the input array for dup tuples. *Schema change.*

### D6 · assignSteward can create duplicate rows under a double-submit  (LOW · functional)
Check-then-insert with no transaction and **no unique constraint** on `(showId, userId)`. Two
near-simultaneous calls (double-click / retried request) both pass the existence check and both
insert. **Recommend:** add a `unique(showId, userId)` constraint (then catch → friendly error),
or `onConflictDoNothing`. *Robust fix is a schema change.*

### D7 · updateDog audit entries are mislabelled "Classes Changed"  (LOW · functional)
`updateDog` edits dog pedigree details but writes the audit row with `action:'classes_changed'`
— there's no accurate enum value, so the audit-log viewer badges a dog edit as "Classes
Changed". **Recommend:** add a `dog_details_updated` enum value (+ viewer config). *Needs a
pgEnum migration (drizzle push).*

---

## 📋 DOCUMENTED — product decisions

### D8 · entries_open server gate only enforces payout bank details  (MEDIUM · functional)
`shows.update({status:'entries_open'})` enforces **only** that the org has payout bank details
server-side. Classes, judges, fees, entry-close date, secretary details, guarantors and RKC
class minimums are checked **only** by the advisory `getPhaseBlockers` query that disables the
client button. A direct tRPC call opens entries with zero classes/judges/fees. Auth is intact
(must be a secretary with show access — self-inflicted, not cross-tenant). **Recommend:** move
the blocker set into a shared helper the mutation also calls; throw `PRECONDITION_FAILED`.
*Product call: which of the ~7 prerequisites are hard server gates vs advisory (WUSV/guarantor
exceptions exist).* 

### D9 · Any secretary can edit any global judge record  (MEDIUM · data-integrity)
`updateJudge` mutates a judge by id with no scoping. Judges are an **intentionally global**
shared registry (no org column; `addAndAssignJudge` already updates shared rows cross-org), so
this isn't a tenant breach — but there's no write-provenance, so any secretary can overwrite a
judge's name/email/photo that other clubs' schedule PDFs depend on. **Recommend (decision):**
either accept global-by-design, or restrict edits to admins, or add provenance/audit. *Product
call — global judge model is deliberate.*

### D14 · "Submit results for judge approval" checklist key still unwired  (LOW · functional)
Companion to F3: `judge_approvals_sent` is declared but `getChecklistAutoDetect` doesn't compute
it. **Recommend:** derive it from the approval state `getResultsPublicationStatus` already
computes. *Left documented because the approval data model wasn't confirmed in this pass.*

---

## 📋 DOCUMENTED — defensive hardening (UI can't currently trigger; crafted-call only)

These verified as real gaps but the **UI cannot reach them** — they need a hand-crafted tRPC
call by an already-authenticated secretary against their own show. Low priority; batch into a
"server hardening" pass.

- **D10 · updateOrganisation logo fetch** has no timeout/host allowlist → blind-SSRF / request-hang
  surface (response body never returned). Add `AbortSignal.timeout(3000)` (mirror `createVenue`)
  + reject private hosts. *(Self-flagged untestable — that's why it's documented, not fixed.)*
- **D11 · updateVenue** skips `verifyOrgAccess` when `venue.organisationId` is null (seed venues).
  Fail closed on null-org, or backfill seed venues. Impact is cosmetic (shared seed-venue photo).
- **D12 · addRing** allows duplicate ring numbers in one show (UI suggests next number but the field
  is free-type) → ring-board/schedule group by `number` collapse. Add a `(showId, number)` check.
- **D13 · setStewardBreeds** (a) accepts breeds the show doesn't host (no validation vs show
  classes — harmless no-op, clutters the badge list); (b) delete-then-insert isn't transactional,
  so a duplicate `(breedId, showDate)` in the payload wipes the steward's breeds then 500s. Wrap in
  a transaction + validate breeds belong to the show.
- **D15 · deleteShowClass** raw-errors when the class has entries (the FK *blocks* the delete — no
  orphaning — but the user gets a generic toast). `bulkDeleteShowClasses` already gives a friendly
  `PRECONDITION_FAILED`; add the same precondition check here. *(Leans friendliness, hence documented.)*
- **D16 · shows.update** date validation is skipped when `startDate` isn't re-sent in the same edit
  (`effectiveStartDate = rest.startDate` with no stored-value fallback) → entry-close date can be set
  on/after the show start date. Fall back to the stored `startDate`.
- **D17 · shows.create** has **no** date-ordering validation at all (the client wizard validates, so
  normal use is safe; a direct API call can persist `endDate < startDate` etc.). Mirror the client's
  four refines server-side.

---

## 🎨 UX NOTE (code-visible)

- **judge-section.tsx** — if a selected judge is deleted between selection and assignment, the user
  gets a generic error; for a 60+ user that's confusing ("I selected a judge that's right there").
  Re-validate / prompt "that judge may have been removed — please refresh." Edge case (LOW).

---

## Coverage & method

- **Domains audited (12):** dashboard/org/settings · shows CRUD+wizard+delete · classes ·
  entries/manual-entry/dogs · catalogue+settings · reports+financial · judges (assignment) ·
  judge contracts/emails · stewards+rings · checklist+phase-blockers · sundry/schedule/documents ·
  sponsors/results/RKC.
- **Adversarial verification** refuted 16 candidate findings (e.g. `transferClass` fee "corruption",
  `searchDogs`/`registerDogForExhibitor` "cross-org" — dogs are global by design, the
  `resendJudgeApprovalRequest` "missing flag" — the flag only *loosens* access, several
  "duplicate email" claims — the UI lists are deduplicated). These were dropped, not carried as noise.
- **Still pending a working browser (Chrome MCP down):** the pure visual / mobile-at-375px sweep of
  every secretary screen (Phase 2 + the look-and-feel half of this phase). Items tagged *needs visual
  pass* above, plus a general pass on calm/whitespace/touch-target/label-plainness per CLAUDE.md.
