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

## Mandy's answer, 15 Oct 13:29Z: printed and online catalogues

- A hard copy ALSO gets the online copy ("a nice touch"), but we don't broadcast it, otherwise people share it instead
  of buying a hard copy.
  - Access is unchanged: `grantsOnlineCatalogueAccess` = printed | online, and the show-morning email still goes.
  - The order email's "Online Catalogue Purchased" box shows only for an online_catalogue purchase
    (`announcesOnlineCatalogue`).
  - Nothing shown at purchase time may say that printed includes online.

## Slice 2 — buying extras without signing in (design, 16 Oct 2026)

Mandy's ruling (15 Oct): someone who isn't signed in sees the three cards first. "Just extras, no dog" asks only for a
name and an email, with no password. Enter a Dog and Junior Handler still need a sign-in.

Mapped on 16 Oct by four read-only workers: the wizard, the checkout server, sign-in and register, and what a buyer can
reach afterwards. Prod facts on 16 Oct:
- every users.email is already lower-case and trimmed, with no case duplicates;
- 101 of 174 live users have no password (they sign in by emailed link or Google);
- no enabled extra costs £0;
- 0 orders are pending payment.

### The person behind the order: one owner

`orders.exhibitor_id` is NOT NULL → users, and every email, the payment report and the parking pass read the buyer from
that row. So a signed-out buyer gets a users row, found or created by email. They are **never signed in** by it.

- NEW `src/server/services/people.ts` holds all of it:
  - `normaliseEmail()`: trim + lower-case.
  - `findPersonByEmail(db, email)`: `lower(users.email) = normaliseEmail(email)`. Not `ilike`, where `_` and `%` are
    wildcards.
  - `findOrCreatePersonByEmail(db, { email, name })`:
    - It never changes a row that already exists, so a typed name can't rename someone's account.
    - A new row gets the normalised email, the typed name and `onboardingCompletedAt = now()`. The last one is so that
      signing in later, to see the order, lands on My Entries and not on the welcome wizard, which demands an address.
      `passwordHash` and `emailVerified` stay null.
    - It re-selects on a 23505 race.
- **Every existing lookup moves onto it.** Today there are six copies:
  - the credentials `authorize` in lib/auth.ts (`ilike`);
  - password-reset (`ilike`);
  - the register route (`eq`, already lower-cased);
  - `manualEntryExhibitor` (`eq(lower)`, no trim);
  - invitations (`eq(lower)`);
  - the secretary's add-steward (`eq(lower)`).
  - Guard test: no `eq(users.email` / `ilike(users.email` outside people.ts (scripts and tests excepted).
  - On prod data the change in behaviour is nil (everything is lower-case), apart from the wildcard fix.

### Server: `orders.guestCheckout` (publicProcedure)

- **Input:** showId, sundryItems (min 1), referralSource, `buyer { name, email }`, and optional
  `previousOrder { orderId, clientSecret }`. There is **no entries field at all**, so the guest path can't buy a dog
  entry even from a hand-made API call.
- It refuses a caller who IS signed in (BAD_REQUEST). One path per state: signed-in users use `checkout`.
- **Rate limit** (none exists today). NEW `lib/rate-limit.ts`, an in-memory sliding window; prod runs one web instance.
  - Keyed on the client IP (`cf-connecting-ip`, then the first `x-forwarded-for`) at 10 per 10 minutes, and on the
    email at 5 per hour.
  - The tRPC context gains `clientIp`.
  - Error: TOO_MANY_REQUESTS, "Too many tries. Please wait a few minutes and try again."
  - Note: a card-tester can already register with any email and use `checkout`, so this matches the existing exposure
    rather than adding a new one.
- **The checkout body has ONE owner.** The `checkout` mutation's body moves verbatim into
  `placeOrder(db, exhibitorId, input, { cancelStaleOrders })` in orders.ts. `ctx.session.user.id` becomes
  `exhibitorId` (8 places, the only other ctx use besides db). `checkout` calls it with the session user and
  `cancelStaleOrders: true`. `guestCheckout` builds its input through the same zod schema (`entries: []`), so every
  default and the extras-only blanking apply, then calls it with the person's id and `cancelStaleOrders: false`.
- **Why the guest path can't use the stale cleanup:** it cancels every pending or failed order of that user at that
  show. On the guest path the user is whoever owns the typed email, so anyone could cancel someone else's open payment
  by typing their address. Instead, the guest path cancels only an order it can PROVE is its own.
  - The browser sends back the `orderId` and `clientSecret` from its last checkout.
  - The server requires that order to be pending, for this show and this person, and requires
    `stripe.paymentIntents.retrieve(pi).client_secret === clientSecret`.
  - It then cancels through the same helper the stale cleanup uses: one owner for "cancel an abandoned order".
- PaymentIntent metadata gains `buyer: 'guest'`. The response has the same shape whether the email was new or already
  had an account, so it can't be used to discover accounts.
- The webhook, `sendOrderPaidEmails`, show-metrics and the reports are unchanged (all keyed on the order).

### Wizard

- **middleware:** `/shows/[id]/enter` leaves `authRequiredPatterns`. The entry-edit route stays there.
- **Signed out** (`useSession` status `unauthenticated`; nothing happens while `loading`):
  - Step 1 shows the three cards. Enter a Dog and Junior Handler carry the line "You'll sign in first" and go to
    `/login?callbackUrl=/shows/{id}/enter`.
  - If the show has no extras on sale (no enabled sundry, or the window is shut), or the saved cart holds a dog or
    handler, the page sends them to sign in. That is exactly today's behaviour.
  - The protected queries (dogs.list, validateExhibitorForEntry, regionalPriorDogCount, packagePriorStanding, …) get
    `enabled: signedIn`, so no UNAUTHORIZED calls fire.
- **Review, signed out:** under the extras and the total sits a "Your details" card.
  - Fields: "Your name" and "Your email", with the help line "We'll email your receipt here."
  - A link: "Already on Remi? Sign in".
  - Proceed stays disabled until both are filled in (a valid email). It calls `guestCheckout`.
  - The details are saved in the cart (localStorage) so the 3DS return works. The cart is removed on confirmation, as
    today.
  - The last checkout's `{orderId, clientSecret}` is kept in the cart until confirmation (payment Back no longer
    forgets it), so it can be sent as `previousOrder`.
- **Confirmation:** firstName and email come from the typed details when signed out ("We've emailed your receipt to …").

### After paying, for someone who never signed in

- The receipt and the parking pass (a PDF attachment) arrive by email, so the pass needs no sign-in.
- **Extras-only receipt copy (every buyer, one owner):** "To see your order on Remi, sign in with {email}. We'll email
  you a link, no password needed." The CTA "View my order" goes to /entries, then /login, then the emailed link, then
  My Entries.
- **Catalogue page, signed out:** today it's a dead end ("Please sign in to view your catalogue" + Browse Shows). It
  gets a "Sign in" button with `callbackUrl` back to the catalogue. The show-morning email links there.
- **Login:** OAuthAccountNotLinked (Google on an email that already has a row without Google) today says "Sign-in
  failed". It will say "This email is already on Remi. Use 'Email me a sign-in link' instead." The same happens today
  to password users who try Google. Turning on Google email-linking is a security setting for Michael, not done here.
- **Register on an email that already has a row with NO password:**
  - Today it's 409 "Try signing in instead".
  - It will send the existing set-password email (`requestPasswordReset`, which already works for a passwordless row)
    and say "This email is already on Remi. We've emailed you a link to set your password."
  - Rows with a password keep the 409.
  - Register already reveals that an account exists, so this reveals nothing new.

### Tests (each proven failing first)

- Journey: guestCheckout with a new email creates one lower-cased row (named, onboarded, no password), then the
  webhook, then the order is paid and the receipt goes to that email.
- An existing email typed in another case: the order is filed under that account, its name is unchanged, and the
  response is the same shape.
- The schema refuses entries and an empty cart. A signed-in caller is refused.
- previousOrder: a correct proof cancels it; a wrong secret, another person's order, or a signed-in user's pending dog
  order on the same email are all untouched.
- Rate limit by IP and by email.
- people.ts: the race, the trim, `_` not a wildcard. The guard test for a second copy. Credentials sign-in,
  password-reset, register, invitations and add-steward still work through it.
- Register on a passwordless row sends the set-password email. Middleware: enter is public, edit still needs a
  sign-in.
- 390px walk on the demo, signed out: three cards → extras → details → Stripe test card → confirmation → receipt →
  sign in by link → My Entries.

### Not in slice 2

- Adverts and sponsorship creating catalogue_adverts rows, and the artwork email (slice 3).
- A token link that opens the catalogue without a sign-in (forwardable, which Mandy wants avoided).
- Pre-existing blank-name fallbacks (`name ?? '—'` doesn't catch ''; 9 prod users have a blank name). Guest rows
  always carry a name.
