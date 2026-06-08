# Bug Hunt — Deferred / For-Review (11 of 27)

16 bugs were fixed + tested + committed on `fix/bug-hunt-2026-06-04` (all critical + high
severity + the impactful mediums). The 11 below were **deliberately not auto-fixed** during the
unattended run — each is a product-judgment call, a delicate accounting change where a wrong fix
mis-states real money, or a catalogue/financial display fix that needs heavier component work and a
visual check. Full repro/why for each is in `BUGHUNT_FINDINGS.md`. This file adds the verdict +
recommended fix + why it was held back.

Generated 2026-06-08 during the autonomous run. Verdicts are from reading the actual code.

---

## #8 (HIGH) — Joint-owner visibility is non-functional  ·  VERDICT: REAL (not a false positive)
- **Confirmed:** `dogs.list` matches joint owners via `dog_owners.user_id`, but neither `dogs.create`
  (sets `userId` only for `i===0`) nor `addOwner` (omits `userId`) ever populates it for a
  non-creating owner. So a joint owner never sees the dog in "My Dogs" — the feature shipped in
  `50273dd` does nothing for anyone but the creator.
- **Why deferred:** the real fix is *feature work*, not a contained bug fix — resolve a joint owner's
  email to a user account and set `user_id`, AND link on future sign-up (the owner may not have an
  account yet). Both have UX/edge-case decisions (wrong-email match, account created later).
- **Recommended:** (a) contained partial — in `create`/`addOwner`, look up `users` by `ownerEmail`
  and set `userId` when it matches an existing account; (b) full — on user sign-up, back-fill
  `dog_owners.user_id` for rows whose `ownerEmail` matches the new account.

## #11 (MED) — Same dog enterable twice in one cart (non-WUSV)  ·  PRODUCT JUDGMENT
- A non-WUSV checkout can include the same `dogId` twice (same classes) → double charge + duplicate
  catalogue rows. WUSV already blocks this; standard shows don't.
- **Why deferred:** need to confirm there's no legitimate case (e.g. one NFC + one graded entry for
  the same dog) before rejecting.
- **Recommended:** reject duplicate `(dogId)` among **standard** entries in one cart (mirror the WUSV
  guard in `orders.checkout`), allowing NFC/JH alongside.

## #12 (MED) — show-metrics double-subtracts a class-downgrade refund  ·  REAL, DELICATE ACCOUNTING
- On a downgrade the entry's `totalFee` is lowered AND a partial refund is recorded. `show-metrics`
  adds the (already-lowered) `totalFee` *and* subtracts `refundAmount` again, understating
  `clubReceivablePence` by the refund. Per-entry **cancellations** are correct (fee kept gross, then
  subtracted), so the two refund kinds are handled inconsistently.
- **Why deferred:** this aggregation was explicitly revised before (see memory; comment at the
  refund-bucket block). A wrong fix mis-pays real clubs. Needs the accounting owner.
- **Recommended:** only subtract a partial refund when it corresponds to a **cancelled** entry (gross
  fee retained); a **downgrade** refund on a still-confirmed entry is already reflected in the lowered
  `totalFee`. Requires linking refund rows to entry status/reason.

## #13 (MED) — By-breed catalogue lists a dog twice  ·  DISPLAY (needs component work + visual check)
- A dog entered in both a sexed class and a sex-neutral class appears twice in the by-breed layout.
- **Recommended:** dedupe by `dogId` when building the by-breed grouping in `catalogue-by-breed.tsx`.

## #16 (MED) — JH labelled JHA in entry pages but 13/14 on the SV classification page  ·  DISPLAY
- One catalogue contradicts itself: Junior Handling is JHA/JHB on entry pages but numbered 13/14 on
  the SV classification page.
- **Recommended:** drive both surfaces from `buildClassLabelMap` / the `isUnnumberedClassDef` rule
  (the same single-source helper added for #5) so JH/SAC are never numbered.

## #17 (MED) — Sexed Special Award Class mis-numbered as a breed class on the SV classification page
- A sexed SAC is counted as a breed class on `sv-front-matter.tsx`, inflating the class count and
  shifting JH numbers. Same root family as #5/#16.
- **Recommended:** exclude SAC from the numbered breed sequence on the classification page using the
  shared unnumbered rule.

## #19 (MED) — Entry confirmation email "Total Paid" omits the platform fee  ·  PRODUCT JUDGMENT
- The email's "Total Paid" shows the entry+sundry subtotal, not the amount actually charged
  (subtotal + £1+1% handling fee). Arguably understates what left the customer's card.
- **Why deferred:** whether to show the handling fee in the total (or as a separate line) is a wording
  / product decision for Michael + Mandy.
- **Recommended:** add a "Handling fee" line and a true "Total charged", or relabel.

## #20 (MED) — Re-publishing results re-sends every email  ·  REAL, NEEDS POLICY + STATE
- `publishResults` guards against double-publish, but `unpublish → fix one result → republish`
  re-emails **all** exhibitors + followers, not just the affected one.
- **Why deferred:** the right behaviour is a product decision (notify nobody / only-changed / all on
  republish) and needs tracking state (e.g. `results_notified_at`, a schema change).
- **Recommended:** add `results_notified_at`; default republish to `sendNotifications:false`, or send
  only to exhibitors not previously notified.

## #21 (MED) — Follower results notification skips any follower who is also an exhibitor  ·  JUDGMENT
- The skip (meant to avoid double-emailing exhibitors, who get the exhibitor email) is too broad: it
  skips a follower even for dogs they don't own.
- **Recommended:** only skip when the follower is an exhibitor **of the followed dog**, not any
  exhibitor at the show. (Confirm intended behaviour with Michael.)

## #22 (MED) — OrderRefundCard picks a refund row instead of the original payment  ·  DISPLAY
- The secretary financial page computes paid/refunded/remaining off a refund payment row rather than
  the original `initial` payment → wrong figures shown for refunded orders.
- **Recommended:** select the `type:'initial'` payment for the order as the basis; treat refund rows
  only as deductions. Needs a visual check on `financial/page.tsx`.

## #26 (LOW) — Financial per-class/per-breed revenue vs headline don't reconcile  ·  DISPLAY
- Per-class/per-breed revenue excludes withdrawn entries while the headline entry-fee total includes
  them, so the breakdown doesn't sum to the total.
- **Recommended:** make `class-breakdown.ts` and the headline agree on withdrawn-entry treatment
  (likely include withdrawn, since the club keeps that fee — matches show-metrics).
