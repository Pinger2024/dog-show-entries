# Remi — Full Codebase Review & Cleanup Audit
**Date:** 2026-06-12 · **Branch reviewed:** `fix/bug-hunt-2026-06-04` · **Reviewer:** Claude (Fable 5)
**Scope:** entire repo — dead code, security, money-handling, data integrity, consistency.

> **STATUS UPDATE (same day):** Michael green-lit autonomous fixes. Shipped to prod in four commits on `main` (`198f220` security hotfix, `323e23c` dead-code removal, `04ebc7d` hardening, plus a follow-up quality/consolidation pass): C1, H1, H2, H3, M1, M2, M3, M4, L5 (dual auth, header preferred), L6 (route deleted) — all FIXED & DEPLOYED, plus the drizzle enum-export bug (advertDocument/advertPosition/dnaRecording missing from schema/index.ts, which broke every `drizzle-kit push`). ~4,100 lines deleted, 137 scripts archived, 5 deps removed, 16 new regression tests (incl. a static `organisation: true` scan and an addAndAssignJudge-bypass guard).
> **Still open (deliberately deferred):** M5 + L3 + L4 (schema changes — blocked until the parked working-tree schema ships and a coordinated `db:push` day happens; patch `remi_demo` too), L2 (print-orders.ts is parked), the consistency passes (money/date formatters, ownership-check helper, public-visibility helper), and the `secretary.ts` split.
**Method:** four parallel deep audits (dead-code, security/quality, secretary UX, feature inventory) + personal verification of every critical/high finding. Items marked ✅ I verified in the code myself; others were agent-verified with file:line evidence.

---

## Part 1 — Security & Correctness (fix before anything else)

### 🔴 CRITICAL

**C1. Public API leaks club bank details** ✅ *personally verified*
- `organisations.getById` is a `publicProcedure` returning the **full org row** — including `payoutAccountName`, `payoutSortCode`, `payoutAccountNumber` (`src/server/trpc/routers/organisations.ts:9-29`; columns at `schema/organisations.ts:23-25`), plus `stripeCustomerId`/`stripeSubscriptionId`.
- The full org row is also embedded in **public show responses** via `with: { organisation: true }`: `shows.ts:199` (list), `:232` (getById), `:352` (upcoming), and `steward.ts:916/:1219` (live results).
- Because `shows.update` *requires* payout details before `entries_open`, **every club currently accepting entries has its bank account readable by any unauthenticated visitor**. `shows.nearby` (shows.ts:448) already does it right — selects only `{ id, name }`.
- **Fix:** define one public-safe org column set (`id, name, kcRegNumber, type, website, logoUrl…`) and use it in every public/exhibitor-facing query. Trim the exhibitor-side joins too (`entries.ts:390/:478`, `orders.ts:803`). One-day fix. Ship as hotfix.

### 🟠 HIGH

**H1. Public `shows.list` enumerates any club's draft/cancelled shows with secretary PII** ✅ *personally verified*
- `status` input enum includes `draft`/`cancelled` and is applied unscoped: `shows.ts:47-92`. Returns full rows: `secretaryName/Email/Phone/Address`, fees, joined org (→ C1).
- `shows.getById` carefully hides drafts from non-members (`:261-284`) — the list endpoint undoes that care.
- **Fix:** intersect requested status with a public allowlist; scope `draft`/`cancelled` to caller's orgs.

**H2. Public dog profile leaks upcoming entries (pre-judging) + unpublished results**
- `dogs.getPublicProfile` (`dogs.ts:106-224`) returns **all confirmed entries with no date filter** as `showHistory` → a judge can see a dog is entered in their upcoming show. Direct violation of the project's own privacy rule (`feedback_no_entered_dogs_visible`).
- Both it and `timeline.getForDog` (`timeline.ts:23-127`) return `placement`/`critiqueText` with **no `publishedAt` check** — bypassing the publication gating that `steward.getLiveResults` enforces (`steward.ts:1023`).
- **Fix:** filter history to shows already underway/completed; only include result fields where `result.publishedAt !== null`.

**H3. Legacy `payments.createIntent` still mounted** ✅ *mount personally verified* (`router.ts:36`)
- No UI calls it, but any logged-in user can invoke it directly. It bypasses duplicate-entry checks, RKC age rules, breed validation, judge-conflict checks, and the fee model (prices from per-class fees, no member discounts, no zero-amount skip).
- Worst part: it creates entries **without an `orderId`**, and `show-metrics.ts:159` skips order-less entries from `clubReceivablePence` → Stripe takes the money, the dog appears in the catalogue, **the club's BACS payout never includes it**.
- **Fix:** delete the procedure (live checkout is `orders.checkout`). ~151 lines, test-only callers.

### 🟡 MEDIUM

| # | Finding | Where | Fix |
|---|---------|-------|-----|
| M1 | Any secretary can edit **any judge globally**, incl. `contactEmail` — contract offers email that address, so club A can intercept club B's judge contracts | `secretary.ts:2574-2603` | Require an org↔judge relationship for writes; admin-only for contact-detail changes on shared judges |
| M2 | IDOR: `getShowEntryStats` has **no `verifyShowAccess`** (118 of ~132 secretary procs have it) — any secretary can read a rival show's revenue/entry stats. Same gap in `getShowPhaseContext` (`:4057`) | `secretary.ts:5594-5640` | Add the standard `verifyShowAccess` call |
| M3 | Stripe refunds: no `idempotencyKey` + read-modify-write race on `refundAmount` — retry after timeout can double-refund; concurrent partials under-record | `stripe-refunds.ts:37-63` | Idempotency key + atomic `SET refund_amount = refund_amount + ${amount}` |
| M4 | ~20 of 23 Resend sends ignore the SDK's `{ error }` result (it doesn't throw) — judge offers/entry confirmations can silently fail; this is the known "suppressed address" failure mode | `email.ts` (only :868/:940 check); `secretary.ts` ×6 | One `sendOrThrow` wrapper in email.ts, used everywhere |
| M5 | `entries.order_id` has **no FK constraint** (comment says "added via orders table" — it never was; confirmed absent in drizzle snapshot). All money reconciliation pivots on this column | `schema/entries.ts:33` | Add `foreignKey()` in table config + push (patch `remi_demo` too) |

### 🟢 LOW (quick wins)
- L1: `getBreedEntryStats` lacks the status gate `getPublicStats` has (`shows.ts:1036`).
- L2: `completeByDeduction` TOCTOU — concurrent calls can double-spend payout balance (`print-orders.ts:349-394`); fix with `WHERE status='draft'` + rowcount check.
- L3: Missing unique constraints: `memberships(user,org)`, `achievements(show,dog,type)`, `payments.stripe_payment_id`.
- L4: Secretary's refund `reason` text is collected then dropped — persist it on the payments row.
- L5: Cron secret passed as `?secret=` query param → lands in access logs; move to `Authorization` header.
- L6: `prize-cards-a3` fetchable by catalogue purchasers pre-show (format missing from `SECRETARY_ONLY_FORMATS`).

### ✅ Verified good (genuinely strong)
- Stripe webhook: signature verification + replay/regression guards are thorough — best file in the money path.
- Refund exclusion: `'refunded'` enum means all 11 `status='paid'` queries auto-exclude refunds; partial refunds netted in `show-metrics.ts`.
- Platform fee math: integer pence throughout; per-entry package splits put rounding remainder on the last dog so sums reconcile.
- All 10 PDF API routes share `authenticatePdfRequest` — no unauthenticated PDF endpoints.
- Class numbering: all 8 render surfaces really do use `class-labels.ts` (memory claim verified true).
- Child-object IDOR pattern: 12 spot-checked secretary mutations all verify via parent show/org.

---

## Part 2 — Dead Code Inventory (~5,100 deletable lines)

### Dead components (~3,535 lines, all zero-importer-verified)
| File | Lines | Note |
|------|-------|------|
| `src/app/(shows)/shows/[id]/show-detail.tsx` | 1,462 | The known-dead public show page (live page renders `preview/show-preview.tsx`). Memory said the dead copy was in `src/components/shows/` — that one's already gone; **this** is the remaining corpse |
| `src/components/catalogue/catalogue-premium-compact.tsx` | 930 | Untracked experiment; only referenced by an untracked sample script |
| `src/components/dev/account-switcher.tsx` | 265 | Superseded by `/admin/users` |
| `src/app/(shows)/pricing/pricing-cards.tsx` | 246 | Page renders its own cards inline |
| `src/components/show/tell-a-friend.tsx` | 216 | Superseded by `share-kit.tsx` |
| `src/components/show/show-share-dropdown.tsx` | 194 | Only importer is dead `show-detail.tsx` |
| `src/components/show/live-entry-stats.tsx` | 178 | Only importer is dead `show-detail.tsx` |
| `src/components/ui/form-section.tsx` | 44 | Zero references |

### Dead tRPC surface (~850 lines)
- **Whole routers:** `organisations` (69 lines, zero refs — also the C1 leak; delete kills two birds), `payments` (151 lines — the H3 risk), `routers/index.ts` (2-line scaffolding stub; real router is `router.ts`).
- **Dead procs in live routers:** `shows.upcoming`, `shows.getShareCount`; `shows.getPublicStats`/`getBreedEntryStats`/`getShowDogPhotos` (transitively dead once show-detail.tsx goes); `dogs.addOwner`/`updateOwner`/`removeOwner`/`updatePhotoCaption`; `secretary.assignClassNumbers`/`reorderSundryItems`; `admin.reorderBreedGroups`/`reorderClassDefinitions`; `orders.getById`/`list`; `users.getDashboard`; `backlog.get`; `feedback.get`.
- **Keep:** `stripeConnect` router (deliberately dormant), `secretary.updateShowSponsor` (likely staged for the queued sponsor-picker rebuild), `dev.ts` (live admin tooling, just misnamed), `pro.ts` (live Remi Pro feature).

### Dead services / schema (~404 lines)
- `services/kc-lookup.ts` (69) — older duplicate of what `firecrawl.ts` does.
- `services/print-price-refresh.ts` (46) + `printPriceCache` table — Tradeprint-era vestiges (check table for prod data before drop).
- `catalogues` table (43) — planned persistence never wired; catalogues render on-the-fly.
- `seed-clyde-valley.ts` (211) — one-off seed.
- Tradeprint vestiges in live code: `lib/print-products.ts:100-109` (`PRD-TODO-SADDLE-STITCHED-BOOKLETS`), `tradeprint*` columns across print-orders schema/webhook/email.

### Dead routes
- `/api/prize-cards-a3/[showId]` route is dead (the underlying generator is LIVE via print-orders → don't delete the generator).
- `/api/upload/presign` — referenced only by its own test.
- `/admin/referrals` — functional but unlinked from admin nav; link it or drop it.
- Confirmed ALIVE (don't touch): `/promo` (shared-by-URL marketing page), `/~offline` + `/serwist` (service worker), `/feed`, `/browse`, `/reviews`, `/features`, `/for-secretaries`, `/backlog`, `/apply`.

### Unused dependencies
Remove: `@googlemaps/js-api-loader`, `@trpc/next`, `@mendable/firecrawl-js`, `@vitejs/plugin-react`, `@types/dompurify`.
Keep (false positives): `shadcn`, `tailwindcss`, `tw-animate-css`, `@tailwindcss/postcss` (CSS imports), `esbuild`, `dotenv-cli`. Review: `@playwright/test` (3 scripts import transitive `playwright`).

### scripts/ directory (359 files; 162 untracked)
- ~30 operational keepers (demo scripts, check/update-feedback, backlog, search-console, e2e suites, seeds).
- 56 `_`-prefixed one-off probes/fixes (53 untracked) — archive or delete wholesale.
- ~110 untracked unprefixed one-offs (`add-*-backlog.ts` ×17, `probe-mixam-*`, `preview-*` v3–v6 iterations…) + artifact debris (`scripts/browser-test-screenshots/` 27 PNGs, `scripts/output/`, `public/prize-cards/_orig-backup/`).
- **Suggestion:** create `scripts/archive/` (gitignored), sweep everything not in the keeper list into it, add a `scripts/README.md` listing the keepers.

### ⚠️ Do NOT delete
Stripe Connect anything (dormant by design) · `generatePrizeCardsA3Jpeg` (live in print-orders) · untracked `schema/show-breeds.ts` + `ALL_BREED_SHOWS_PLAN.md` (parked all-breed work) · working-tree modifications (parked pending-deploys per 2026-06-08 memory) · `secretary.updateShowSponsor` · CSS-imported "unused" deps.

---

## Part 3 — Structural Debt

### The 10 largest files
| Lines | File | Verdict |
|-------|------|---------|
| 7,173 | `routers/secretary.ts` | **Split urgently** — 132 procedures; M1/M2 hide in here precisely because it's unreviewable. Split into domain sub-routers (classes, judges, sponsors, refunds, checklist, sundries) |
| 2,378 | `sponsors/page.tsx` | Rebuild already queued (Amanda flagged the flow) |
| 2,238 | `shows/[id]/enter/page.tsx` | Split cart/validation/payment |
| 2,080 | `shows/new/page.tsx` | Shrinks naturally if the UX rec (3-question creation) lands |
| 1,702/1,569 | `show-schedule.tsx` / `-multibreed.tsx` | ~60% shared — merge shared sections |
| 1,672 | `catalogue-front-matter.tsx` | Cohesive; leave |
| 1,563 | `routers/dogs.ts` | Mild — split public profile vs CRUD |
| 1,489 | `schedule-settings-form.tsx` | Section components would help |
| 1,483 | `dog-form.tsx` | Borderline; leave |

### The 5 worst consistency debts
1. **Money formatting** — `formatCurrency` lives in `date-utils.ts`(!), duplicated as `formatFee` + `formatPence`, plus **37 raw `(x/100).toFixed(2)` sites across 12 files**. One `lib/money.ts`.
2. **Resend usage** — shared instance + **7 inline `new Resend(...)`** constructions; error checked at 3 of ~23 sites (→ M4).
3. **Ownership checks** — `verifyShowAccess` exists but the check is re-implemented inline ≥6 times; `feedback.ts`/`backlog.ts` re-implement adminProcedure as inline role checks. M2 is the direct result.
4. **Public-data gating** — four different rules for "when can the public see entry-derived data" across procedures. H2/L1 exist because there's no single `isPubliclyVisible(show)` helper.
5. **Date handling** — `parseLocalDate` exists to avoid the UTC off-by-one, yet **76 raw `toLocaleDateString` sites**, and `orders.ts:220` does raw `new Date(show.startDate)` in **age-eligibility validation** — can shift show day by one day at UTC midnight.

---

## Part 4 — Suggested cleanup sequence (when you give the go)

1. **Hotfix (same day):** C1 public-safe org columns + H1 status allowlist + H2 dog-profile filters + unmount `payments` router. Tests for each (bug → test first, per house rule).
2. **Dead-code commit 1 (zero risk):** `show-detail.tsx` + its 2 transitive components + 3 transitive shows procs (~1,950 lines, all certain).
3. **Dead-code commit 2:** remaining dead components, dead procs, dead services, `routers/index.ts` stub, unused deps.
4. **Scripts sweep:** archive folder + README of keepers.
5. **Hardening pass:** M1–M5, L1–L6.
6. **Consistency pass:** `lib/money.ts`, `sendOrThrow`, shared public-visibility helper, ownership-check helper adoption.
7. **Structural (background, ongoing):** split `secretary.ts` into sub-routers; merge schedule renderers.

Estimated total: ~5,100 lines deleted, ~165 scripts archived, 5 deps removed, 4 security holes closed, and the codebase becomes substantially easier to audit — which is itself a security control.
