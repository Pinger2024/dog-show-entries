# Register of duplicated rules — 11 September 2026

A register of rules, computations and render paths implemented in **more than one place** in Remi.
It exists because a rule written down twice will eventually disagree with itself, and here that
surfaces as a wrong printed document or a wrong figure on a club's money. The standing rule is
**One owner per rule** in [CLAUDE.md](../CLAUDE.md).

**How this was produced.** Five parallel read-only sweeps on 11 Sept 2026 (entry rules, money,
render paths, derived values, access control), then verification of the load-bearing claims by
reading the code directly.

**Status key.** Each entry is marked:

- **VERIFIED** — the code was read directly during this audit and the finding confirmed.
- **REPORTED** — surfaced by a sweep and not independently re-checked. Treat as a strong lead, not
  as fact; confirm before acting.

**How to use it.** Work down from the top. When you collapse a duplication, delete the entry and
note the commit. Adding a rule to one more place without deleting its copies is how this list grew.

> The lesson that produced this register: on 11 Sept the pedigree clear-guard was collapsed into
> `lib/dog-pedigree.ts` and wired into the three paths that were known about. There were five.
> Writing the shared function is not the fix — deleting every copy is.

---

## Sweep of 18 September 2026 — 17 further rules, all given one owner

**Status: fixed on branch `one-owner-weekend`; full suite 264 files / 2904 tests green; on demo;
NOT pushed to production.**

Found by a second, read-only sweep of the whole codebase (14 parallel agents), independently of this
register. Each finding was re-checked before being fixed; the two highest-stakes ones — the
championship Open+Limit disagreement and the regional multi-dog scale — were verified by hand rather
than taken on the sweep's word. Fixed carefully, one rule per commit, each with a test that was proven
failing against the pre-fix code and a guard test that fails the suite if a second copy reappears.

Above these sit two fee-scale fixes on the branch underneath (`fix-regional-multidog-across-orders`),
listed here because they are the same disease: a rule read its input from whatever was in front of the
caller instead of asking the one function that knows.

### The rules

| # | Rule | Where duplicated | Disagreement | One owner now | Guard test | Commit(s) |
|---|---|---|---|---|---|---|
| — | Regional (SV/WUSV) multi-dog scale is per exhibitor per show, not per basket | `orders.checkout`, `entries.update`, `secretary.createManualEntry`, client fee preview each built the scale's input from the dogs in front of them | **Disagreed** — an exhibitor's later dog priced as a 1st instead of a 3rd/4th; `createManualEntry` ran no regional engine at all (NE Regional: 4 dogs entered one at a time, £20 each, scale says £20/£20/£16/£0) | `countPriorRegionalPayingDogs` — `src/server/services/regional-pricing.ts` | `regional-pricing-one-owner.test.ts` | `76de8746`, `a23a80df` |
| — | Follow-up: which prior entries hold a scale place | same function | **Disagreed** — counted entries in orders still `pending_payment`/`failed`; `orders.checkout` sweeps those baskets before pricing, so a preview quoted a free dog checkout would then charge for (member 3rd dog quoted £0.00) | same — now counts only settled orders (`paid`/`refunded`) or entries with no order | included in the same test file | `70268231` |
| A1 | Limited-show CC/RCC bar | `orders.checkout` hardcoded `['cc','dog_cc','bitch_cc']`/RCC list vs `dogs.checkLimitedShowEligibility`'s `effectiveCcType` (Mandy's 2026-07-09 ruling) | **Disagreed** — a dog whose only CC was an *effective* one (single-breed championship Best Dog) was warned on the enter page but accepted at checkout | `getLimitedShowEligibility` — `src/server/services/limited-show-eligibility.ts` | `limited-show-eligibility-one-owner.test.ts` | `d0818967` |
| A2 | Special Award Class flat-fee pricing | `orders.checkout`, `entries.update`, `secretary.createManualEntry`, enter-page fee preview each checked `classDefinition.type === 'special'` only | **Disagreed** — `type: 'special'` is nine other ordinary classes too (Special Beginners, AVNSC, Variety Class, Good Citizen…); a dog in one of those was charged the flat SAC fee (2500p) instead of first+subsequent (3000p) | `specialAwardClassFee` — `src/lib/class-labels.ts` | `special-award-class-fee-one-owner.test.ts` | `72cafa2c` |
| A3 | Pricing a class change on an existing entry | `entries.update` ran the real pricing engine; the edit page summed raw `class.entryFee` itself | **Disagreed** — wrong whenever RKC tiers/regional scale/SAC fees/discount/multi-dog package applied; the top-up payment screen showed the client's wrong figure while Stripe charged the server's correct one | `priceEntryClassChange` — `src/server/services/entry-change-pricing.ts` | `entry-change-pricing-one-owner.test.ts` | `d62e30d6` |
| A4 | Sundry item purchase rules (existence/show/enabled/`maxPerOrder` cap) | `orders.checkout` enforced all four; `secretary.createManualEntry` enforced only the first three | **Disagreed** — the per-order cap that stops an exhibitor over-buying was simply absent on the manual-entry path | `validateSundrySelection` — `src/server/services/sundry-selection.ts` (half-fixed by design — see §C below) | `sundry-selection-one-owner.test.ts` | `87da2c5f` |
| B1 | Judge coverage complete | `getJudgeCoverage` (dashboard) vs `getChecklistAutoDetect` (checklist tick) | **Disagreed** — the checklist copy had no Special-Award-Classes lane and let a breedless assignment match any breed, so a SAC-only judge ticked "Judges assigned" while the dashboard still showed breed classes uncovered | `computeJudgeCoverage` — `src/server/services/judge-coverage.ts` | `judge-coverage-one-owner.test.ts` | `4461a0d8` |
| B2 | Age in completed months | `getWinSummary` vs `getTitleProgress` (`routers/dogs.ts`) | **Disagreed** — `getTitleProgress` omitted the day-of-month floor `getWinSummary` had, overstating age by a month for roughly the first three weeks of every month; dropped the Junior Warrant row entirely for a 17-month-20-day-old dog | `ageInCompletedMonths` — `src/lib/date-utils.ts` | `age-in-months-one-owner.test.ts` | `8a32e0cb` |
| B3 | What status a show displays as after its close date | `shows-list.tsx` had its own fix; secretary dashboard, lifecycle banner, show detail badge, catalogue-page banner, public show page, both share-image renderers each hand-wrote `entryCloseDate < now` again | **Disagreed** — some checked `<=`, some didn't check at all; a secretary could see "Entries open" hours after checkout would refuse a new entry, and a share image could carry a stale "Closing soon" badge | `effectiveShowStatus` — `src/lib/show-status.ts` (was dead code; one site deliberately excluded, see §C) | `show-display-status-one-owner.test.ts` | `d3c56d5d`, `0b67657a` |
| B4 | Championship Open+Limit-per-breed-per-sex readiness | Client (`class-manager.tsx`) grouped by breed name and folded any null-`breedId` row into the show's one implicit breed; server (`getChecklistAutoDetect`) grouped by breed id and skipped null-`breedId` rows entirely | **Disagreed** — a fully-classed single-breed show whose class rows carried no breed FK read as NOT ready on the server checklist while the client's live warning showed nothing wrong (proven failing before the fix) | `missingChampionshipClasses` / `championshipClassesComplete` — `src/lib/championship-class-requirements.ts` | `championship-classes-one-owner.test.ts` | `b5a9d10b`, `ec059725` |
| B5 | Judge breed/classification label ("Breed:"/"Classification:") | `judge-section.tsx` (assignments card, offer-email preview) rebuilt the grouping inline instead of calling the function `secretary.ts`/`steward.ts`/`judge-contract-pdf.ts` already shared | **Disagreed** — see the two visible wording changes at §D | `buildJudgeBreedAndClassification` — `src/lib/judge-breed-classification.ts` | `judge-label-one-owner.test.ts` | `2d638922` |
| C1 | "Does this entry count" (confirmed, not soft-deleted) | 13 hand-typed copies (one inverted) across 9 files | Identical — drift risk only | `isLiveEntry` — `src/lib/entry-counts.ts` | `live-entry-one-owner.test.ts` | `cc09403a` |
| C2 | Which classes are exempt from catalogue numbering | `shows.create`'s own closure admitted it "mirrors" `secretary.ts`'s copy | Identical — drift risk only | `isUnnumberedClassDef` — `src/lib/class-labels.ts` | `class-numbering-one-owner.test.ts` | `596b8160` |
| C3 | "Already paid / advanced" print-order status list | Stripe print-order webhook (twice) and `admin-dashboard.ts`'s `PRINT_PAID_STATUSES` | Identical — drift risk only | `PRINT_ORDER_PAID_STATUSES` / `isPrintOrderPaid` — `src/lib/print-products.ts` | `print-order-status-one-owner.test.ts` | `f7a7d5ee` |
| C4 | Judge contract offer-link expiry | GET and POST handlers of `api/judge-contract/[token]/route.ts` | Identical — drift risk only | `isContractOfferExpired` — `src/lib/judge-contract-offer.ts` | `judge-contract-offer-one-owner.test.ts` | `eda10665` |
| C5 | Guarantor minimum (6 championship / 3 open, WUSV-waived) + "fees configured" | `getChecklistAutoDetect` and `getPhaseBlockers` | Identical — drift risk only | `requiredGuarantorCount` / `hasEnoughGuarantors` / `showFeesConfigured` — `src/lib/show-setup-requirements.ts` | `show-setup-requirements-one-owner.test.ts` | `25570f60` |
| C6 | NFC 12-week minimum age | `entries.create`, `orders.checkout`, enter-page "too young to enter at all" gate | Identical — drift risk only | `NFC_MIN_AGE_WEEKS` / `isOldEnoughForNfc` / `nfcMinAgeMessage` — `src/lib/date-utils.ts` | `nfc-min-age-one-owner.test.ts` | `02044eb5` |
| C7 | Class results "published" state | `getClassSummaries` and `getClassEntries` (`routers/steward.ts`) | Identical — drift risk only | `classResultsPublishState` — `src/lib/class-results-publish-state.ts` | `class-results-publish-state-one-owner.test.ts` | `f1408d78` |
| C8 | Non-standard-fee class display grouping ("Special Award classes £3") | `show-preview.tsx` byte-for-byte mirror of the schedule renderer's grouping | Identical — drift risk only | `buildEntryFeeGroups` — `src/components/schedule/shared/entry-fee-groups.ts` | `entry-fee-groups-one-owner.test.ts` | `9bbeeceb` |

### C. Found during the fix — not changed, needs a decision

- **`secretary.createManualEntry` still doesn't enforce the sundry `over_max` cap** — `src/server/services/sundry-selection.ts`. Whether a secretary path should refuse or warn-and-let-through on rule violations is being decided on branch `feat-entry-requirements-one-gate` ("secretary warns, exhibitor refuses"); that branch owns wiring `over_max` into this call site.
- **`schedule-settings-form.tsx`'s guarantor figure has no WUSV waiver** — `src/app/(secretary)/secretary/shows/[id]/_components/schedule-settings-form.tsx:680` (`requiredGuarantors = showType === 'championship' ? 6 : 3`). The WUSV case is instead handled by hiding the banner, and its `SectionSummary` line isn't gated on `isWusvShow` — plugging in the real owner would change what that summary displays for a WUSV show, so it was left alone.
- **`catalogue-snapshot.ts`'s `isEligibleAbsentee` is a hand-mirror of the SQL absentee rule** — `src/server/services/catalogue-snapshot.ts:681`. It checks `status === 'confirmed'` but has no `deletedAt` guard at all, plus unrelated paid-order/entryType/absent conditions. Possible bug; left for a human to judge separately from the mechanical `isLiveEntry` extraction.
- **`getPhaseBlockers`'s `no_judge` blocker is a different, weaker rule than judge coverage** — `src/server/trpc/routers/secretary.ts` (~line 4197). It only checks "any judge assigned at all", with no breed/sex matching, unlike `computeJudgeCoverage`. Left as is, noted for anyone revisiting it.
- **`validateRkcSchedule`'s `cc_breed_open_limit` is a related but different rule** — `src/lib/rkc-schedule-compliance.ts`. It only checks CC-offered breeds on multi-breed shows and returns early for single-breed shows, so it is not the same rule as the championship Open+Limit check (§B4) and was left alone.
- **The exhibitor "Edit Classes" button uses raw show status, not `effectiveShowStatus`** — `src/app/(shows)/shows/[id]/entries/[entryId]/edit/page.tsx`. This is an action gate, not a display, and belongs with the entry-gate consolidation on `feat-entry-requirements-one-gate`, not this sweep.
- **Admin show pages don't select `entryCloseDate`** — so they can't call `effectiveShowStatus` even where it would apply. Left unwired rather than widening their queries speculatively.
- **The RKC multi-dog package (`src/lib/fee-calc.ts`) is priced per order, not per exhibitor per show** — the same shape of bug as the regional scale fix above, but for RKC shows. Awaiting the co-founder's decision before touching it.
- **The demo environment's Stripe webhook secret is a placeholder** — no demo payment has completed since 11 Sept as a result. Awaiting Michael.
- **One display site was deliberately kept on raw status, not `effectiveShowStatus`** — the secretary catalogue page's "won't be generated until entries close" banner (`0b67657a`, following up `d3c56d5d`). It is not a label but a statement about the close *transition*: the hourly cron, not the close date, is what re-sorts and locks catalogue numbers and schedules the render. In the gap between the close instant and the cron running, the catalogue genuinely isn't final, so the banner has to stay up until the DB status itself flips — reverted back to raw status with the reason written down at the call site and as an exception in `effectiveShowStatus`'s doc comment.

### D. Visible wording changes to confirm with Mandy

Both are the client catching up to behaviour `buildJudgeBreedAndClassification` already had everywhere
else (offer email, contract PDF) — not a deliberate difference that was preserved:

1. **Secretary judge card, general/multi-breed shows, no assignments yet** — the breed line used to
   fall back to the show's **name**; it now falls back to the **breed list**, matching the offer email
   and contract PDF.
2. **Secretary judge card, Special Award Classes judge on a general show** — the classification used
   to read bare "Special Award Classes"; it now gets the **breed prefix**, again matching the offer
   email and contract PDF.

### Lessons

- Run the **whole** suite after a series of one-owner extractions, not just each change's own tests —
  two guard tests ended up pointed at code that had moved (`79d96f7b`), and one of them was already red
  on `main` before this weekend started.
- When applying a new helper "everywhere" a sweep found a copy, check whether one of those sites is the
  one place the *raw* value is actually the truth (the catalogue-page banner, §C above) before wiring
  it in regardless.
- Read the original code's semantics before "fixing" an agent's extraction — the championship
  Open+Limit follow-up (`ec059725`) came within one step of introducing a real regression by treating
  "no classes yet" as "not ready" instead of the original's deliberate "not applicable = complete".
- Agents must not `git stash` in this repo — a stash is shared across worktrees and an old WIP stash
  nearly got popped onto this branch by an agent doing a stash/pop round-trip mid-task.

---

## 0. Impersonation cookie trusted without an admin check — FIXED 11 Sept (`39c9544e`)

**Status: VERIFIED** · **Was: any logged-in account could act as any user it could name**

Kept at the top of the register as the clearest case of what this document is for: the rule was
right in two readers and absent in the third, and the third was the one every server layout and PDF
route depends on.

`remi_impersonate_user` holds a raw, unsigned user id (`lib/impersonation.ts`). `httpOnly` stops
JavaScript, not devtools or curl, and the admin check on `/api/admin/impersonate` is not the guard —
an attacker sets the cookie directly.

| Reader | Checked the real caller was admin |
|---|---|
| `server/trpc/init.ts:58` | yes |
| `api/dog-autosave/[dogId]/route.ts:118` | yes |
| **`lib/auth-utils.ts` `getCurrentUser()`** | **no — fixed `39c9544e`** |

Reachable through `requireAuth`/`requireRole`/`requireAnyRole` (the dashboard, secretary and steward
layouts), `/api/parking-pass/[orderId]` (any exhibitor's pass) and `authenticatePdfRequest`, which
passed the forged id to `resolvePdfAccessForUser` — a membership test — yielding another club's
secretary-only documents. `permission-guards.test.ts` builds `ctx.impersonating` directly and never
exercised the cookie path, so it stayed green throughout.

---

## 1. Pedigree can still be cleared — two write paths the 11 Sept fix never reached

**Status: VERIFIED** · **Cost: catalogue prints with blank sire/dam/breeder**

The rule (sire, dam, breeder, colour cannot be blanked once set) lives in `lib/dog-pedigree.ts`.
Five paths write those columns; two do not call it.

| Path | Guarded |
|---|---|
| `dogs.update` (`routers/dogs.ts`) | yes |
| `/api/dog-autosave/[dogId]` | yes (11 Sept) |
| `components/dogs/dog-form.tsx` | yes (11 Sept, client) |
| **`secretary.updateDog` (`routers/secretary.ts:1284`)** | **no** |
| **`secretary.registerDogForExhibitor` (`routers/secretary.ts:3463`)** | **no — creates blank** |

`secretary.updateDog` accepts `sireName: z.string().optional()` (an empty string passes) and writes
`.set(input.changes)` with no guard. `registerDogForExhibitor` inserts `sireName ?? null` with no
requirement check, and its form has no Breeder or Colour field at all.

Note `dogs.create` also hand-rolls its own copy of the *required* check (`routers/dogs.ts:452`)
rather than calling `pedigreeMissingForEntry` — same content today, third copy.

---

## 2. `secretary.createManualEntry` runs almost none of the entry gates

**Status: VERIFIED** · **Cost: an ineligible dog is entered, catalogued and printed**

> **18 Sept update:** the Limited-show CC/RCC bar and the sundry `maxPerOrder` cap each now have one
> owner (`getLimitedShowEligibility` `d0818967`; `validateSundrySelection` `87da2c5f` — see the sweep
> above), but neither is wired into `createManualEntry` yet. Both rows in the table below stay open;
> closing them is scoped to `feat-entry-requirements-one-gate`.

The secretary's manual/postal entry tool validates: show accepts entries, dog exists, classes belong
to the show, no duplicate class, sundries valid. Compared with `orders.checkout` and
`entries.create` it is missing:

| Rule | `orders.checkout` | `entries.create` | `createManualEntry` |
|---|---|---|---|
| Pedigree completeness | yes | yes | **no** |
| SV/regional requirements | yes | yes | **no** |
| Breed vs show/class | yes | yes | **no** |
| Age eligibility | yes | yes | **no** |
| Judge conflict of interest | yes | yes | **no** |
| Coat type vs SV class | **no** (see §7) | yes | **no** |
| WUSV one-class-per-dog | yes | yes | **no** |
| Limited-show CC/RCC bar | yes | **no** | **no** |
| Entry window | status + close date | status + close date | **3 statuses, no close date** |

Its one duplicate-class guard carries the comment *"the manual path didn't [have this] — Mirror the
checkout guard here"*: the pattern was recognised for a single rule and not extended.

---

## 3. Three computations of "what the club is owed"; the payout ledger is unguarded

**Status: VERIFIED** · **Cost: secretary shown a figure that disagrees with her invoice**

- `computeShowMetrics().clubReceivablePence` (`services/show-metrics.ts:514`) — from `entries.totalFee`
- `settlement-itemisation`'s `viaRemi.totalPence` — becomes the invoice
- `listPayouts` (`routers/admin-dashboard.ts:586`) — `SUM(orders.totalAmount)` in raw SQL, drives
  `/admin/payouts` and therefore the BACS transfer

`reconcileSettlement` (added `fe38c179`) is called **only** from `admin-invoices.ts` at issue and
supersede. The payout ledger is cross-checked against nothing; it agrees with the invoice only
because both happen to read `orders.totalAmount`.

`clubReceivablePence` is blind to an order-level multi-dog discount, and it is what the secretary is
shown on her financial page (*"£X was collected by Remi for you"*). The £40 vs £35 divergence is
already pinned by `settlement-itemisation-withdrawn.test.ts:234`.

---

## 4. The official SV results report reads the wrong absent flag

**Status: FIXED 22 Sept on branch `fix-sv-absent-and-manual-number` (`eae91bea`), not yet pushed** — per-class flag now on `SvEntryClassInput`; entry-level flag removed from the input type; guard in `sv-results.test.ts`. The two-implementations note below still stands. Was: **VERIFIED** · **Cost: an absent dog is graded and ranked in a document sent to the club and judges**

`entry_classes.absent` is authoritative per class; `entries.absent` is a roll-up that is true only
when **every** class is absent (schema comment, `schema/entry-classes.ts:18`, Mandy 2026-08-12).

- `services/sv-results-data.ts:81` passes `e.absent` — the roll-up — into `computeClassMembers`
  (`lib/sv-results.ts:258`), a per-class graded report.
- The public results page uses the per-class flag via `computeSvClassRatings` (`lib/sv-grading.ts:144`).

A dog absent from her graded class but shown in a Special Award class is dropped from the public
page and graded in the official PDF/xlsx.

Separately, `computeClassMembers` and `computeSvClassRatings` are two independent implementations of
the same "group by grade, sort by placement, number 1..n" algorithm.

**Open question, not a defect:** `sh01-absentee.ts` also reads the roll-up. The schema comment names
the SH01 dog count as a deliberate roll-up reader, but does not say whether that covers the
*absentee* figure. Needs Mandy; relates to the existing open SH01 absentee question.

---

## 5. Schedule judge aggregation — three implementations of a module built to prevent exactly this

**Status: VERIFIED** · **Cost: the same judge prints with a different role on different documents**

`lib/schedule-judges.ts` exists, in its own words, to keep "the catalogue's two render paths (HTTP
route + print pipeline) — and the schedule — in lockstep instead of each re-implementing the same
loop (Michael 2026-06-19)".

It has **one** consumer: `services/catalogue-snapshot.ts`. Both paths it was written for still
hand-roll their own aggregation:

- `services/pdf-generation.ts:220-286` — the printed schedule
- `app/api/schedule/[showId]/route.ts:135-225` — the public download

**REPORTED:** the route's copy adds breed-name-based Junior-Handling detection
(`juniorBreedSet`/`breedBreedSet`) that the other two lack, so a multi-breed JH judge assigned by
breed is labelled "Junior Handling" on the public schedule and given a breed/sex role on the printed
one.

---

## 6. A dog can be given two catalogue numbers

**Status: FIXED 22 Sept on branch `fix-sv-absent-and-manual-number`, not yet pushed** — `createManualEntry` now calls `syncCatalogueNumbers`; guard in `catalogue-numbering-lock.test.ts` fails on any hand-rolled catalogue number. Was: **VERIFIED** · **Cost: breaks one-number-per-dog on a printed, locked catalogue**

`appendMissingNumbers` (`services/catalogue-numbering.ts:180`) builds a `numberByDog` map so a dog
that already holds a number reuses it — its comment says this exists because *"buying a Special
Award Class on a locked show would hand the dog a second number — the very thing the numbering is
meant to prevent."*

`createManualEntry` (`routers/secretary.ts:3711`) computes `highest + 1` with no dog lookup. On a
locked show, a secretary adding a class for an already-catalogued dog gives it a second number,
which reaches the catalogue, judges book and ring numbers.

---

## 7. Eligibility rules with no server-side owner at all

**Status: sex check VERIFIED; the rest REPORTED**

- **Sex vs class — never checked server-side, anywhere.** Only a client filter in
  `shows/[id]/enter/page.tsx:631`. The structurally identical breed check *is* enforced in both
  `orders.ts` and `entries.ts`.
- **Coat type vs SV class — backwards.** `entries.create` checks it (`entries.ts:308`);
  `orders.checkout`, the live exhibitor path, has no `svCoatType` reference. The client filter it
  relies on is skipped entirely when the dog has no coat type recorded.
- **Junior Handler age — no server check.** `orders.ts:867` stores `handlerDob` unvalidated; both
  enforcement mechanisms are client-only, and one uses the floor-based `isWithinAgeRange` that
  `date-utils.ts` itself says to avoid in favour of `isAgeEligibleOnShowDay`.
- **`entries.update` re-validates nothing** beyond "these classes exist" (`entries.ts:724`), so an
  exhibitor can edit into an ineligible class after checkout.

---

## 8. Regional requirements are declared three times

**Status: VERIFIED**

| Declaration | Runs where | Adds |
|---|---|---|
| `svEntryMissingRequirements` (`lib/sv-entry-validation.ts:38`) | server | reg number, microchip, hip/elbow/DNA, working title |
| `svMissingRequirements` (`lib/sv-entry-readiness.ts:59`) | **client only** | + coat type, registration body, breeder town/postcode, sire/dam reg numbers |
| `regionalRequired` (`components/dogs/dog-form.tsx:736`) | **client only, create only** | its own array again |

Six fields are required by a button and by nothing else. Mandy has already been bitten: 15 dogs
reached the NE Regional with registration body unset and the results spreadsheet column came out
blank — the fix added it to the client list, which the secretary's path does not run.

---

## 9. Money arithmetic performed outside its owning module

**Status: REPORTED**

- **`amount - refundAmount`** (the cap on a real Stripe refund) is hand-written in four places:
  `lib/order-payment-summary.ts:52` (the owner, created after this exact logic caused a live bug on
  31 Aug), `secretary.ts:3322`, `secretary.ts:3401`, and `financial/page.tsx:754`. They agree today.
- **"Revenue"** means gross-charged in `show-metrics.ts:523` and net-of-refund in four
  `admin-dashboard.ts` queries. Different questions, same label, no shared code. Screen only.
- **`print-products.ts:310` vs `:319`** implement `cost * 1.2 * markup` twice with different
  rounding. Dead code today; will disagree by a penny once wired in.

**Doing it right:** `computeOrderFees` / `computeRegionalOrderFees` are used as single owners
everywhere fees are charged. That is the pattern.

---

## 10. Render helpers duplicated across catalogue formats

> **18 Sept 2026:** the Judge Coverage copy is gone. It had been carried verbatim into `server/services/judge-coverage.ts` by the coverage extraction (a local function *shadowing* the canonical name, testing the name prefix only); it now imports `isSpecialAwardClass` from `lib/class-labels.ts`. Prod has six Special Award Class definitions, all `type = 'special'`, so results are unchanged. The other renderers in this section still stand.

**Status: REPORTED**

- **Exhibitor index — two builders, materially different content.** `catalogue-ringside.tsx:320`
  produces a rich per-dog record (DOB, sire, dam, breeder, reg, colour);
  `catalogue-front-matter.tsx:1742` produces name/address/cat-nos/classes only. Same RKC
  back-of-book section, different content depending on which format is printed. Both implement the
  withhold-address rule separately.
- **`isSpecialAwardClass`** — five renderers use the canonical predicate via `sectionClasses`;
  `catalogue-by-class.tsx:739` places its section band with an ad-hoc `/special award/i` name regex.
  A sixth, looser copy shadows the name in `secretary.ts:3112`, dropping the `type === 'special'`
  half; it feeds the Judge Coverage Dashboard.
- **"Is this Junior Handling"** — type-based `isJuniorHandler` (`lib/class-labels.ts:50`) vs
  name-regex `isJuniorHandlingClass` (`catalogue-utils.ts:207`), the latter driving by-class
  ordering and the single-breed cover's class count. A renamed JH class breaks the regex copy only.
  A third private one-liner sits in `schedule/shared/sv-classification.ts:77`.
- **`judgeDisplayList` "Role — Name" parser** re-implemented five times; the code admits the format
  contract is fragile and suggests a structured array instead.
- **Catalogue-number sort** — `sortEntries` (`catalogue-utils.ts:562`) has three users and about ten
  inline copies of the same comparator.
- **"ABS" badge style** duplicated by hand between `catalogue-marked.tsx` and
  `catalogue-by-class.tsx:99`, kept in sync by a comment rather than a shared constant.

---

## 11. Smaller drift risks

**Status: REPORTED**

- **"Are entries still open"** computed three times; `secretary/shows/[id]/catalogue/page.tsx:72`
  omits the close-date check the other two have, so it keeps saying the catalogue will not generate
  until entries close after they have.
  > **18 Sept update:** the other display sites for show status were consolidated into
  > `effectiveShowStatus` (`d3c56d5d`, see the sweep above). This one wasn't — on inspection, the
  > catalogue page's banner is right to lag: it's the hourly cron, not the close date, that makes the
  > catalogue final, so raw status is correct here until the cron runs (`0b67657a`). Not a bug; the
  > row can be closed.
- **Puppy age band** — `top-awards.ts:216` hand-rolls the calendar-month check with bare
  `new Date()` instead of `date-utils.ts`'s `parseLocalDate`; it runs client-side, so it can differ
  at the anniversary boundary for a non-UK browser timezone.
- **`isMember` flag** duplicated verbatim in `entries.ts:866` and `orders.ts:658`.
- **NFC zero-class entries** — `orders.checkout` supports them; `entries.create` and
  `createManualEntry` both declare `classIds.min(1)`, so they cannot exist through those paths.

---

## 12. Access control — remaining items

**Status: REPORTED** (§0 above was the verified one)

- **`verifyShowAccess` fed the wrong session field.** `entries.ts:542` passes
  `ctx.session.user.role`, but `protectedProcedure` has already swapped `ctx.session` to the
  *effective* (possibly impersonated) session — so it reads the impersonated target's role. Around
  a hundred other call sites pass `ctx.callerIsAdmin`, which survives the swap. Direction is
  under-privilege: an admin impersonating a non-admin gets a wrong `FORBIDDEN`. The required
  `callerIsAdmin` parameter exists precisely because call sites "kept forgetting it".
- **`shows.create` has no admin bypass at all** (`shows.ts:519`) — an inline active-membership
  query with no `ctx.callerIsAdmin` escape, unlike the `verifyShowAccess`/`verifyOrgAccess` pattern.
  Denial, not a leak.
- **The active-membership predicate is hand-copied in roughly seven places** rather than calling
  `verifyOrgAccess`: `stripe-connect.ts:16`, `subscription.ts:37/90/179`, `steward.ts:84/157`,
  `shows.ts:305`, plus the plain `/api/*` routes `schedule-autosave`, `judge-contract-pdf`,
  `parking-pass` (those three legitimately cannot reuse a helper that throws `TRPCError`). All
  agree today; a change to the canonical rule would need replicating by hand in each.
- **"Show day reached"** — `isShowDayReached()` is canonical and correctly used by the catalogue
  gates, but `dogs.ts:236` re-derives it inline (agrees), and `dashboard.ts:42` / `shows.ts:382`
  compute "today" as the server's UTC date instead of `todayInLondon()`, so during BST they are a
  day behind for about an hour after UTC midnight. Neither gates privacy.

**Doing it right:** `dogAccessCondition` / `dogRowGrantsAccess` / `userMayActOnDog` are used
consistently, with two documented `ownerId`-only exceptions for destructive actions. And the
"never select the organisation row wholesale" rule is not centralised but *is* pinned by
`public-org-join.test.ts`, which statically scans the tree — 14/14 passing. That is the cheapest
pattern in the codebase for holding a rule that genuinely cannot live in one function: a guard test
that fails the suite when a second copy appears.
</content>
</invoke>
