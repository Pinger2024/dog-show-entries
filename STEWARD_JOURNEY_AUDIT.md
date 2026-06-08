# Steward Journey — Event-Day Walkthrough Audit (Phase 5)

Browser-free, code-level walk of the **whole steward journey** — login → find my ring →
run a class (placements, grades, absentees) → special awards (BOB/BIS) → publish → submit
for the judge's approval — across all 21 `steward.*` procedures, the 3 steward pages, and
the steward shell. Run as a 5-step journey fan-out, each functional finding then
**adversarially verified by re-reading the code** (2 candidate findings were refuted as
by-design and dropped). The steward results-lock guards and the achievement
delete-by-(show,type) fix from the bug hunt (commit `d678d8f`) were excluded.

Generated 2026-06-08 during the autonomous run. **Chrome MCP was down**, so the pure
on-the-day mobile feel (taps-per-placement, layout at 375px, thumb reach) couldn't be
exercised live — those items are tagged *needs visual pass*. The journey *structure*,
*functional correctness*, and *code-visible friction* were all assessable from the code.

Result: **4 fixed**, **7 functional/security documented**, **10 UX/journey documented**,
2 refuted.

---

## ✅ FIXED THIS RUN  (commit 13ce692, +5 tests, suite 807 green)

### F1 · Absent dog still shows as a class WINNER  (HIGH · data-integrity)
Place a dog 1st, then mark it absent → `markAbsent` set `entries.absent=true` but left the
recorded placement, and `getLiveResults` didn't filter absent entries — so an absent dog
surfaced as the winner on the public/live results page (and the social-share text). **Fix:**
`getLiveResults` now excludes absent entries from the placement list — read-side and
non-destructive (no recorded placement is deleted, so toggling absent back off restores it).
*Live-data bug on current GSD shows.*

### F2 · Cross-club pre-judging leak  (MEDIUM · security)
`getLiveResults` / `getPublicShowAchievements` granted "see unpublished results + BOB/BIS" by
**global role**, so any steward/secretary of club A could pass club B's public showId and read
B's unpublished placements and top awards before publication — exactly the pre-judging leak the
"no entered dogs / no pre-judging" privacy invariant forbids. **Fix:** privilege is now scoped
to the show (admin, a steward *assigned* to it, or the *host-org* secretary) via a non-throwing
check, and **downgrades rather than throws** — a logged-in steward of another show still
receives club B's *published* results (they're not 403'd off the public page).

### F3 · Unpublished achievements over-fetched on the wire  (MEDIUM · data-integrity)
`getLiveResults` returned **all** achievements (incl. unpublished BOB/BIS) in its JSON even
though no UI renders them. **Fix:** mirror `getPublicShowAchievements`' `publishedAt` filter for
non-privileged callers. (Composes with F2 — a cross-club caller is now both downgraded *and*
achievement-filtered.) *Wire-only over-fetch, not user-visible — but real confidentiality.*

### F4 · Breed-scoped steward loses Junior Handling / any-breed classes  (MEDIUM · functional)
`getShowClasses`' breed filter required `sc.breedId && assigned`, dropping every breed-null
class (JH, Stakes, any-breed awards) — so a steward assigned to a breed would **never see the
show's JH classes** to record them. **Fix:** keep breed-null classes visible to breed-scoped
stewards. (This is the *read-side* counterpart to the *write-side* breed enforcement documented
in D4/D5 below.)

---

## 📋 DOCUMENTED — functional / security (rank first)

### D1 · Two dogs can hold the same placement in one class  (HIGH · data-integrity)
`recordResult` upserts by `entryClassId` (one result per entry) but nothing enforces one
**winner per placement per class** — there's no `(showClassId, placement)` constraint and no
sibling-placement check. The normal UI (`nextOpenSlot`) avoids it, but a double-tap race,
concurrent calls, or a direct call can record two 1sts. **Why deferred:** the robust fix is a
*partial unique index* on `(showClassId, placement)` — but `results` has **no `show_class_id`
column today** (placement→class resolves via the entry_class join), so it needs a schema change;
and a naïve app-level "reject if taken" blocks the legitimate *correction/swap* case (moving B
to 1st to bump A). Needs the index + a swap-aware UX. *Rank: top of the documented set.*

### D2 · Judge-approved results can be silently edited after approval  (HIGH · functional)
Every steward result mutation gates on `assertResultsNotLocked` (which checks
`shows.resultsLockedAt`, set only by the secretary's *publish*), **not** on the judge's
`approvalStatus`. So in the "approved but not yet published" window a steward can re-edit a
placement; the judge's sign-off silently goes stale with no re-approval, no audit, no
notification. **Why deferred:** the guard must key specifically on `approvalStatus==='approved'`
— blocking on *any* non-null status would break the legitimate **decline → correct → resend**
loop the approval route already supports. Genuine state-machine care. **Recommend:** an
`assertJudgeApprovalNotActive` guard (only when an assignment is `approved`) in the result
mutations, or fold judge approval into the publish/lock logic.

### D3 · submitForJudgeApproval overwrites an existing approval → resets to 'pending'  (MEDIUM · functional)
`submitForJudgeApproval` unconditionally regenerates the token and sets `approvalStatus='pending'`
for the judge, with no guard against re-submitting after they've **already approved** (the UI
hides the button on stale/cached `approvalStatus`, but a second tab / the decline→resubmit window
reaches it). It silently invalidates a recorded approval and emails the judge a second link.
Pairs with D2. **Recommend:** reject when any assignment for that judge/show is already `approved`.

### D4 · Breed scoping is enforced on READ only — steward can MUTATE another breed's results  (MEDIUM · security)
`getShowClasses` filters classes to the steward's assigned breeds, but **every mutation**
(`recordResult`, `setClassGrades`, `markAbsent`, `removeResult`, `publish/unpublishClassResults`,
`updateWinnerPhoto`) checks only show-level `verifyStewardAssignment` — never the class's breed.
A breed-X steward can record/alter results for breed Y by passing an out-of-breed
`entryClassId` (the public `getLiveResults` hands those IDs out). **Why deferred:** latent —
current prod shows are single-breed GSD; this bites once multi-breed/all-breed ships, and it
touches the in-flight all-breed work. **Recommend:** a shared `verifyBreedAssignment(db,
assignmentId, breedId)` helper (allow-all when the steward has no breed rows) front-loaded into
every mutating procedure — mirrors the existing read-side filter.

### D5 · recordResult has no breed-assignment check  (MEDIUM · functional)
Same root as D4, called out for the single most-used mutation. Fix together.

### D6 · SV grade not validated against class type server-side  (LOW · functional)
`recordResult` and `setClassGrades` accept any of the 10 SV grades via `z.enum` without checking
it's permitted for the class (e.g. an adult `V` on a Puppy class). `allowedSvGradesForClass`
runs **client-only** (the enum comment even claims it's "enforced" there). Normal UI is safe;
a stale client / direct call isn't. *(Verifier note: the "disqualified on a puppy" repro is
impossible — disqualified is valid everywhere; the real bad combos are V-on-non-Working and
adult/under-12 crossover. `recordResult`, not just `setClassGrades`, has the gap.)* **Recommend:**
reuse `allowedSvGradesForClass` server-side and reject out-of-range grades.

### D7 · Award recipient eligibility not validated server-side  (LOW · functional)
`recordAchievement` checks only that the dog is entered + sex matches the award — not placement
(BOB/BIS for a non-winner) or age (Best Puppy for a >12mo dog). **Why low:** the actor is a
trusted, show-scoped steward who also controls the placements a check would validate against
(so it only catches *accidental* mis-entry, not misuse), and nothing is public until the
secretary publishes. **Recommend:** cheap guards — age check for puppy/veteran via
`dog.dateOfBirth`, placement check for BOB/BIS.

---

## 🎨 DOCUMENTED — UX & journey (the on-the-day experience)

> The user asked specifically for "how the process will function for a steward" — these are the
> friction points and dead-ends in the day's flow. Most need a visual pass to confirm the fix.

**Rank-first journey gaps:**
- **J1 · The day dead-ends with no "you're done" nudge (HIGH, journey-gap).** After the final
  class, the "Next Class" control is an empty `<div/>` — no completion card, no "now publish &
  submit to the judge" prompt, no visible back button. A steward can finish recording and walk
  away **without ever submitting to the judge**. *needs visual pass.*
- **J2 · Three publish/submit steps are unprompted & unsequenced (HIGH, journey-gap).** Completing
  a show needs (1) publish each class, (2) publish show-level awards (BOB/BIS), (3) submit to the
  judge — spread across two pages with no order, dependency, or checklist. Easy to do 1 and leave.
  **Recommend:** a "Results submission progress" checklist on the show page (publish classes X/Y ·
  publish awards X/Y · submit to judge: pending/sent/approved). *needs visual pass.*
- **J3 · Progress bar never reaches 100% for a breed-scoped steward (MEDIUM, journey-gap).**
  `getResultsSummary` is a `publicProcedure` counting **all** show classes, so a steward judging 4
  of 20 classes sees "3 of 20" forever — demoralising and confusing. **Recommend:** make it
  steward-aware and breed-filter the total to the steward's assigned classes. *(Also note J9.)*

**Clarity / state friction:**
- **J4 · Empty class list shows no explanation (MEDIUM, ux).** When a steward's classes list is
  empty (no classes yet, or breed filter matched zero), they get a blank page under a grey
  progress bar — no empty-state like the my-shows page has. *needs visual pass.*
- **J5 · Achievement "publish" semantics unclear (MEDIUM, ux).** Toast says "now live to the
  public" but doesn't explain when it's actually visible, whether it can be undone, or what
  happens if the secretary unpublishes. For a 60+ steward, "is this saved / live / undoable?"
  uncertainty mid-show is real friction. *needs visual pass.*
- **J6 · Multi-day show: steward sees all days' breeds, not just today (LOW, ux).** The show page
  calls `getShowClasses` without a `date`, so per-day breed scoping isn't applied. **Recommend:**
  pass the current date, or add day tabs.
- **J7 · No in-page progress feedback while recording (LOW, ux).** After each `recordResult` the
  steward must navigate back to see overall progress; ringside rapid-fire recording has no running
  "5/12 placed" tally. *needs visual pass.*
- **J8 · Double-tap is data-safe (idempotent upsert) but can flicker / double-toast (LOW, ux).**
  Consider disabling the control while the mutation is pending. *needs visual pass.*
- **J9 · Public progress bar advances on PRIVATE data (LOW, ux).** `getResultsSummary` counts a
  class as "judged" on any recorded result regardless of `publishedAt`, so the public "X of Y
  judged" bar moves before the public can see those results — counter and visible results diverge.
  **Recommend:** count only published results.
- **J10 · Results-lock error could guide next steps (LOW, ux).** The lock message is accurate but
  doesn't say *who* can unlock (secretary) or *what triggered it*. *needs visual pass.*

---

## Journey narrative (as a steward on the day)

> My Shows → open my show (classes grouped by breed, a progress bar, a Best-of-Breed section, a
> Judge-Approval button) → tap into a class → record placements with tap-to-place / tap-to-status,
> mark absent, give special awards → move class-by-class with Previous/Next → **finish the last
> class and hit a blank dead-end** (no "done", no next-step) → manually backtrack to the show page
> → discover three **unsequenced** publish/submit actions spread across two pages with no
> step-by-step guidance. For a breed-scoped steward the progress bar reads "X of 20" even after
> finishing their 4 classes. The recording itself is quick and the show-day lock correctly hides
> exhibits until the morning; the weak links are the **seams between steps** (J1/J2) and the
> **progress/empty-state signals** (J3/J4), not the per-class recording.

---

## Refuted (dropped — by design)

- **"Published achievements aren't reset when the secretary unpublishes results."** Intentional:
  `achievements.publishedAt` is decoupled from the results-publish lifecycle (Amanda 2026-05-28 —
  stewards release top awards class-by-class). Auto-clearing them on every unrelated placement
  correction would yank correctly-announced awards off the public page. Stewards can
  `unpublishAchievement` a specific award.
- **"Achievement cascade has no sequence/prerequisite validation."** By design — `recordAchievement`
  records the awards a judge actually made in the ring, in ring-driven order, not a simulated
  hierarchy. A prerequisite check would break the documented class-by-class release workflow.

---

## Coverage & method

- **Journey steps walked (5):** arrive/navigate (getMyShows, shell, my-shows + show pages) · run a
  class (getClassEntries, recordResult, setClassGrades, markAbsent, removeResult, updateWinnerPhoto)
  · special awards + publish (recordAchievement, publish/unpublish class + achievement,
  getResultsLockStatus) · judge approval + public surfaces (submitForJudgeApproval,
  getJudgeApprovalStatus, getLiveResults, getResultsSummary, getPublicShowAchievements) ·
  whole-journey seams.
- **Adversarial verification** confirmed 11 functional/security findings and refuted 2 by-design ones.
- **Still pending a working browser (Chrome MCP down):** the on-the-day mobile feel — taps per
  placement, 375px layout, thumb reach, the dead-end and checklist screens (J1/J2/J4/J5/J7/J8/J10).
