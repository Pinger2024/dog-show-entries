# Buying extras without a dog — design (15 Oct 2026)

Mandy approved this on 15 Oct 2026 (Telegram 7999–8005). It came from Shirley (GSDL-BRG) after the Midland regional:
"enter a JH / buy a catalogue / buy sponsorship without a dog". Built in slices, and each slice goes on the demo before
the next.

## What the exhibitor sees (all slices)

- **One way in: Enter This Show.** Step 1, "What type of entry?", gets a third card: **"Just extras, no dog"**, with the
  line "Buy a catalogue, parking pass or other extras without entering a dog."
- Enter a Dog and Junior Handler stay behind login, as now. A junior handler is entered by a parent or guardian from
  their own account.
- The extras card goes straight to Review. There they tick or count the extras, pay, and get a confirmation. There is
  no dog declaration, because there is no dog.
- Slice 2 (later): someone who isn't signed in sees the three cards first. The extras card asks only for name and email
  (no password). Slice 3 (later): adverts and sponsorship, where the purchase lands in the secretary's lists.

## Slice 0 — a sundry's KIND has one owner

Today the kind of a sundry is guessed from its NAME in a dozen places, and they disagree:

- `isCatalogueItem` and `CATALOGUE_NAME_PATTERN` (substring). Any "Catalogue Advert" counts as a catalogue purchase and
  unlocks the online catalogue.
- `includes('print')` decides printed vs online in show-metrics and report-queries. A bare "Catalogue" counts as ONLINE
  there, but the enter page tells the exhibitor to collect a PRINTED one.
- `isParkingSundry` and `PARKING_NAME_PATTERNS` (word boundary). "Car Park Pass" is NOT recognised.
- `isDonationName` (substring) in settlement-itemisation.
- The enter page's own online regex, and sv-show-schedule's `includes('catalogue')`.

**The new rule:**

- `sundry_items.kind` is a pgEnum `sundry_kind` with the values `printed_catalogue | online_catalogue | parking |
  donation | membership | advert | sponsorship | other`. It is NOT NULL and defaults to `other`.
- `src/lib/sundry-kind.ts` is the ONE module that knows what a kind means. It holds:
  - The type, the labels ("Printed catalogue", "Online catalogue", "Parking pass", "Donation", "Club membership",
    "Advert", "Sponsorship", "Something else").
  - `inferSundryKindFromName(name)`, used ONLY for the one-time backfill, for golden or legacy fixtures that lack a kind,
    and as a suggestion in the secretary's form.
  - Predicates: `isCatalogueKind`, `grantsOnlineCatalogueAccess(kind)`, `isParkingKind`, `isDonationKind`. Also the SQL
    lists for queries, e.g. `ONLINE_CATALOGUE_ACCESS_KINDS`.
- `inferSundryKindFromName` checks in this order:
  1. advert (`\badvert`) → advert.
  2. sponsor or banner → sponsorship.
  3. parking (`\bparking\b`, `\bcar\s*(park\s*)?pass\b`) → parking.
  4. catalogue → online if online/digital/pdf/download/e-catalogue, otherwise printed. A bare "Catalogue" = printed.
  5. donation → donation.
  6. membership → membership.
  7. Anything else → other.
- On every prod name (checked 15 Oct) this gives exactly today's behaviour:
  - printed: "Printed Catalogue", "Printed Catalogue + pen", "Printed Catalogue - £5 on the day".
  - online: "Online Catalogue".
  - parking: "Pre Paid Car Parking - BRG Members ONLY".
  - advert: "Advert", "A5 full colour advert", "Colour Advert", "Colour A5 Advert ".
  - sponsorship: "Class Sponsorship" (and spacing variants), "Special Award Sponsorship", "Sponsorship - Banners",
    "Customised banner".
  - membership: "Club Membership — Sole/Joint/Family".
  - donation: "Donation".
- **Online catalogue access stays as it is today.** A printed OR online catalogue unlocks the online PDF and the
  show-morning email. That is `grantsOnlineCatalogueAccess`, the one place to change if Mandy decides otherwise (asked
  15 Oct).
- **Backfill.** startup-migrations creates the type (`CREATE TYPE` has no IF NOT EXISTS, so use a DO block) and adds
  the column nullable. It fills NULLs in TypeScript with `inferSundryKindFromName`, then sets the default and NOT NULL.
  - It is idempotent: later boots find no NULLs, so a secretary's deliberate choice is never overwritten.
  - It must tolerate TWO services booting at once (web + cron run the same code): `UPDATE … WHERE id = $1 AND kind IS
    NULL`, and `SET NOT NULL` only when no NULLs remain.
  - Re-export the pgEnum from schema/index.ts.
  - On the test DB, apply the startup-migration function itself to rehearse the prod write. Do NOT lean on
    `db:push:test`, which can drop tables.
- **Fixtures.** The golden fixture loader (`src/__tests__/helpers/show-fixture.ts` ~157) inserts sundry rows as they
  are. It must fill a missing kind with `inferSundryKindFromName`, or every golden show's catalogue counts drop to 0.
  Test factories: `makeSundryItem` takes a `kind`, inferred from the name when not given.
- **Proof that real shows don't change.** For every golden fixture, before vs after: `paidPrintedCatalogueCount`,
  `paidOnlineCatalogueCount`, `hasUserPurchasedCatalogue`, parking pass yes/no, and the settlement donation line.
  - The ONLY expected difference is the synthetic fixture's bare "Catalogue" (online → printed).
  - Write it as a test.
- **Secretary.** Every preset carries its kind. The add/edit dialog has "What is this?", a select with the labels. It is
  suggested from the name as they type, and they can change it. createSundryItem and bulkCreateSundryItems require a
  kind; updateSundryItem accepts one.
- **Guard test.** Fails if a name heuristic for catalogue, parking or donation appears outside `lib/sundry-kind.ts`
  (`includes('catalogue')`, `'%catalogue%'`, `isParkingSundry`, `isDonationName`, `includes('print')` on a sundry name,
  …).

## Slice 1 — a signed-in user buys extras with no entry

The new shape is a paid order with ZERO entries. The maps of 15 Oct found that money is already order-keyed:
show-metrics, settlement itemisation, reconciliation, refunds, catalogue lists, the extras summary, the parking pass
and the online catalogue access all see such an order. The work is the checkout gate, the wizard, the emails, and the
few entry-keyed views listed below.

### Server

- `orders.checkout`: `entries` loses `.min(1)`. A refine requires `entries.length > 0 || sundryItems.length > 0`
  ("Choose a dog, a junior handler or at least one extra").
  - With no entries, the server ignores the entry-only fields: regionalMembership and number, firstTimeExhibitor,
    discountGroupId, donationPence (the regional donation box is part of the hidden entry block), catalogueRequested and
    withholdFromPublication.
  - The **judge-conflict check** (orders.ts ~504-519) runs only when there are entries, like the dog checks. A judge
    may buy a catalogue or sponsor a class.
  - The order total = the sundries. The platform fee is the usual `calculatePlatformFee`.
  - It still runs `entryWindowOpen` and `validateSundrySelection`.
  - The stale-order cleanup stays as it is (one pending checkout per person per show; a paid order is never touched).
- **Emails.** These are the same functions (one owner for "the receipt for an order"), with an extras-only variant when
  the order has no entries.
  - `sendEntryConfirmationEmail`: subject "Your order for {show}", "Thank you for your order", the items table, the
    catalogue or parking note, and the CTA "View my entries and orders". No share block.
  - `sendSecretaryNotificationEmail`: subject "New order (extras, no dog) — {name} → {show}", listing the items.
- **Secretary payment report** (`getPaymentReport`): orders with no entries but with sundries get a row. The exhibitor
  comes from the order. The status comes from the ORDER status, never `statusFromEntries([])` (which says
  "withdrawn").
- **show-metrics** `livePendingOrderIds`: a `pending_payment` order with no entries counts as live pending (the
  "Awaiting payment" tile).
- **Secretary show layout:** the stat-card row is shown when there are dogs entered OR paid orders.
- **Financial page** refund dialog: with no entries, it doesn't say "cancel every entry on this order".
- **Parking-pass email** copy: "View my entries and orders", not "your entries page".

### Exhibitor pages

- **My Entries** (`(dashboard)/entries/page.tsx`): an "extras-only order" is one that is paid, has at least one sundry
  line, and has NO entry with `deletedAt IS NULL` (a withdrawn dog keeps its normal card). A show where the user has
  one gets a card
  (show name and date, the items, the online catalogue link and the parking pass when they apply). The empty state shows
  only when there are no entries AND no extras-only orders. The data comes from a new order-keyed query (e.g.
  `orders.myExtrasOnlyOrders`); entries.list is not bent to fit.

### Wizard (`shows/[id]/enter/page.tsx`, `use-entry-cart.ts`)

- **Extras-only is DERIVED, not a flag:** `isExtrasOnly = completeEntries.length === 0` while on review, payment or
  confirmation. One helper owns it.
- **Step 1:**
  - The third card shows when the show has at least one enabled sundry AND `entryWindowOpen(show)` (the same owner the
    server uses), so nobody hits "Show is not accepting entries" at the end. `shows.getSundryItems` is enabled at
    `entry_type`.
  - Clicking it goes to `cart_review`.
  - The auto-skip of step 1 now happens only when there is exactly ONE option (no JH classes AND no sundries).
- **Review, extras-only:**
  - The heading is "Choose your extras". The entry cards, add-a-dog buttons, discount groups, regional membership and
    donation block, the RKC/BRG dog declaration and the withhold-from-catalogue card are all hidden.
  - The sundry panel is shown with the total and the booking fee.
  - Proceed is disabled only while nothing at all is in the cart. `membershipNumberMissing` and the declaration ticks
    never disable it here, because their block is hidden. Back goes to step 1.
- **Step indicator, extras-only:** Type → Review → Payment → Confirmed.
- **Profile gate** (name + address): applies only on the dog or JH path, never at step 1 or on the extras-only path.
- **Persistence and 3DS:** `loadSavedState` and the payment-snapshot recovery accept a cart with sundries and no
  complete entries (today they throw it away, the same bug class as the April BAGSD 3DS fix). The beforeunload warning
  and the cart badge count sundries.
- **Confirmation, extras-only:** "Thank you, {firstName}!", "Your order is confirmed", the items, the catalogue or
  parking note, then "View my entries and orders" and "Back to the show". No "You're entered", no share card, no "Enter
  more dogs".

### Tests for slice 1 (each proven failing first)

- Journey: an RKC show AND a regional show. Extras-only checkout → webhook → the order is paid with zero entries. The
  order total and platform fee are right.
- Both email variants (customer and secretary) for an order with no entries.
- The payment report has a row for an extras-only order, with the ORDER status and the exhibitor.
- show-metrics with a paid extras-only order: printed count, `clubReceivablePence`, platform fee. A pending one is in
  the awaiting-payment figures.
- `reconcileSettlement` is ok on a show containing an extras-only order. `refundOrder` works on one.
- A judge with no dog can buy an extra.
- The checkout refuses an empty cart (no entries, no sundries). With no entries it ignores donationPence, membership and
  discount group.
- Cart restore: `loadSavedState` keeps a cart with sundries and no entries (including the Stripe-return branch).
- My Entries data: the extras-only orders query returns paid, zero-live-entry orders with sundries, and not a withdrawn
  dog's order.
- Also: tsc error count vs main (`next build` ignores type errors), and a 390px look at step 1 (three cards), the
  extras-only review and the confirmation.

### Not in slice 1 (on purpose)

- Signed-out buyers (slice 2). Adverts/sponsorship creating catalogue_adverts rows (slice 3).
- Add-more-extras to an extras-only order: they just place another extras-only order.
- The settlement line "0 via Remi + 0 direct = 0" on a show with ONLY extras orders is cosmetic and unrealistic.
- Slice 1 already SELLS sponsorship and adverts (they are ordinary sundries in the same panel). Until slice 3, the
  receipt carries no secretary email or artwork deadline. Tell Mandy this with the demo.

## Open question for Mandy (asked 15 Oct)

- Should a PRINTED catalogue also unlock the ONLINE one? Today it does, and the order email says "Online Catalogue
  Purchased" to printed buyers.
