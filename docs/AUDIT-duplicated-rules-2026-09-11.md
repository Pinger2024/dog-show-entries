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

**Status: VERIFIED** · **Cost: an absent dog is graded and ranked in a document sent to the club and judges**

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

**Status: VERIFIED** · **Cost: breaks one-number-per-dog on a printed, locked catalogue**

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
