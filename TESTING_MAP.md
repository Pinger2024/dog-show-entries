# Remi Testing Map

A living inventory of every distinct user journey across every role. Each row is a
discrete user goal we want covered by an integration test. Tick journeys ✅ as
their tests land. New journeys go in the relevant section as the app grows.

**Priority key:** 🔴 show-day-critical (if this breaks during a real show, the
secretary is stranded) · 🟡 important (revenue, comms, primary flows) · 🟢
nice-to-have (admin, edge cases).

**Status key:** ✅ covered · 🟠 partial · ⬜ missing.

Test files live in `src/__tests__/integration/`. See `src/__tests__/helpers/` for
factories and the test caller.

---

## Exhibitor

| # | Journey | Procedures / Routes | Pri | Status | Notes |
|---|---|---|---|---|---|
| 1 | Sign up + register account | NextAuth (Google or password) | 🟡 | ⬜ | Google OAuth path needs a stubbed strategy |
| 2 | Complete onboarding profile | `onboarding.saveProfile`, `onboarding.complete` | 🟡 | ⬜ | Auto-fills from `dogOwners`; gates entry validation |
| 3 | Add a dog | `dogs.create` (+ `dogOwners` row with isPrimary) | 🔴 | ⬜ | Feeds every downstream entry flow |
| 4 | Update dog | `dogs.update`, `dogs.updateOwner` | 🟡 | ⬜ | Soft-delete + photo handling |
| 5 | Upload dog photo | `POST /api/upload/dog-photo` → S3 → `dogs.updatePhotoCaption` | 🟡 | ⬜ | Mobile-Safari html-to-image fix recently |
| 6 | Validate profile before entry | `entries.validateExhibitorForEntry` | 🔴 | ⬜ | Critical gate; blocks checkout if profile incomplete |
| 7 | Browse + filter shows | `shows.list` with breed/status/date filters | 🟡 | ⬜ | Breed filter uses exists() subquery |
| 8 | View show detail + classes | `shows.getById`, `shows.getClasses` | 🟡 | ⬜ | showScope affects placement rules |
| 9 | Enter dog into show (live path) | `orders.checkout` | 🔴 | 🟠 | `breed-validation.test.ts` exercises the breed/age path; need broader checkout test for sundries, JH details, multi-entry carts. **Note**: `payments.createIntent` and `entries.create` are not called from the UI but still have tests guarding any future re-use |
| 10 | Validate dog eligibility (age, breed, JH vs standard) | `orders.checkout` checks | 🔴 | ✅ | `breed-validation.test.ts` — primary + fallback breed paths, class-level enforcement, JH bypass, age 4mo / 6mo / 12wk gates |
| 11 | Detect judge conflict (can't exhibit under assigned judge) | `entries.create` fuzzy name match | 🟡 | ⬜ | Case-insensitive trim — fuzzy match risk |
| 12 | Enter multiple classes in one entry | `entries.create` array of classIds | 🟡 | ⬜ | Duplicate-class guard; fee summing |
| 13 | Complete payment via Stripe | `POST /api/webhooks/stripe` (payment_intent.succeeded) | 🔴 | ✅ | `stripe-webhook.test.ts` — legacy single-entry + order-level + idempotent re-delivery |
| 14 | Receive entry confirmation email | `sendEntryConfirmationEmail` (async post-webhook) | 🟡 | ⬜ | Fire-and-forget; assert payload shape only |
| 15 | View my entries (active + past) | `entries.list` | 🟡 | ⬜ | Soft-delete filter; per-exhibitor scoping |
| 16 | View entry detail | `entries.getById` | 🟡 | ⬜ | Non-secretary callers see only own entries |
| 17 | Edit entry classes (swap/add pre-show) | `entries.update` | 🟡 | ⬜ | Recalculates fees; payment or refund as needed |
| 18 | Handle fee adjustment (add/remove class) | `entries.update` feeDiff path | 🟡 | ⬜ | New PaymentIntent or auto-refund |
| 19 | Withdraw from show | `entries.withdraw` | 🟡 | ⬜ | Sets status='withdrawn'; audit log |
| 20 | View show schedule PDF | `GET /api/schedule/[showId]` | 🟡 | ⬜ | React-PDF generation |
| 21 | Purchase catalogue | `orders.checkout` (catalogue line item) | 🟡 | ⬜ | Separate from entry payment |
| 22 | View purchased catalogue | `shows.getCatalogueAccess` + `GET /api/catalogue/[showId]/[format]` | 🟡 | ⬜ | Gated on purchase or secretary role |
| 23 | View dog results post-show | `dogs.getShowResults`, `dogs.getWinSummary` | 🟢 | ⬜ | Depends on `results.publishedAt` |
| 24 | Create timeline post for dog | `timeline.createPost` | 🟡 | ⬜ | S3 photo; privacy toggle |
| 25 | Delete timeline post | `timeline.deletePost` (own only) | 🟡 | ⬜ | Soft-delete |
| 26 | Follow / unfollow a dog | `follows.create`, `follows.delete` | 🟢 | ⬜ | Simple relation |
| 27 | View title progress (Champion, etc.) | `dogs.getTitleProgress`, `dogs.checkLimitedShowEligibility` | 🟢 | ⬜ | RKC achievement counting |
| 28 | Add external result (won outside Remi) | `dogs.addExternalResult` | 🟢 | ⬜ | Manual entry; counted in title progress |
| 29 | View user dashboard | `users.getDashboard` | 🟡 | ⬜ | Next shows, recent entries, trial status |
| 30 | Update profile | `users.updateProfile` | 🟡 | ⬜ | Validated before entry |
| 31 | Set / change password | `users.setPassword`, `users.changePassword` | 🟡 | ⬜ | Old-password verification |
| 32 | Submit feedback widget | `feedback.submit` (+ optional attachment) | 🟢 | ⬜ | Web entry into feedback table |

---

## Secretary

| # | Journey | Procedures / Routes | Pri | Status | Notes |
|---|---|---|---|---|---|
| 33 | Accept secretary invitation | `invitations.accept` | 🟡 | ⬜ | Promotes role; route to /secretary (0ea4cc6) |
| 34 | View dashboard (orgs + shows summary) | `secretary.getDashboard` | 🟡 | ⬜ | Aggregates entry counts, revenue |
| 35 | View organisation + members | `secretary.getOrganisation`, `secretary.orgMembers` | 🟡 | ⬜ | Active-membership filter |
| 36 | Create new show (full wizard) | many `secretary.*` mutations | 🔴 | 🟠 | `show-creation.test.ts` covers create+venue+ring; class wizard + checklist seed remain |
| 37 | — Create / select venue | `secretary.createVenue`, `secretary.listVenues` | 🟡 | ✅ | `show-creation.test.ts` (no-postcode path; geocoding fetch not exercised) |
| 38 | — Define show details (type, breed, dates, fees) | `shows.create` | 🔴 | ✅ | `show-creation.test.ts` — happy path, classes (combined + separate sex), slug uniqueness, subscription gate, non-member rejection |
| 39 | — Seed checklist from defaults | `secretary.seedChecklist` | 🟡 | ⬜ | Default items + due dates |
| 40 | — Bulk-create classes from template | `secretary.bulkCreateClasses` | 🟡 | ⬜ | Auto catalogue numbering (9aad79a) |
| 41 | — Manage sundry items | `secretary.createSundryItem`, `secretary.bulkCreateSundryItems` | 🟡 | ⬜ | Programmes, discs, etc. |
| 42 | Send judge offers (single + bulk) | `secretary.sendJudgeOffer`, `secretary.sendBulkJudgeOffers` | 🟡 | ⬜ | Email with contract token |
| 43 | Search RKC + assign judges | `secretary.kcJudgeSearch`, `secretary.kcJudgeProfile`, `secretary.addJudge` | 🟡 | ⬜ | Firecrawl→fetch refactor (922d74d) |
| 44 | Update judge (breed/sex assignments) | `secretary.updateJudge` | 🟡 | ⬜ | |
| 45 | View judge contract status | `secretary.getJudgeContracts` | 🟡 | ⬜ | Tracks offered/opened/approved/declined |
| 46 | Resend judge offer | `secretary.resendJudgeOffer` | 🟡 | ⬜ | Resend SDK error guard (be9c661) |
| 47 | View judge coverage report | `secretary.getJudgeCoverage` | 🟡 | ⬜ | Highlights breed gaps |
| 48 | View show entries (all statuses) | `entries.getForShow` (or secretary equivalent) | 🟡 | ⬜ | Paginated; includes audit log |
| 49 | Issue refund | `secretary.issueRefund` | 🟡 | ⬜ | Stripe refund + payments record |
| 50 | Auto / manual catalogue numbering | `secretary.assignCatalogueNumbers` | 🟡 | ⬜ | Auto on first secretary visit |
| 51 | Open entries (status → entries_open) | Status transition | 🟡 | ⬜ | Phase-blocker gated |
| 52 | Close entries | Status transition | 🟡 | ⬜ | Manual or entryCloseDate trigger |
| 53 | Edit schedule data (sponsors, judge bios, etc.) | `secretary.updateScheduleData` | 🟡 | ⬜ | JSON form; autosave (a3de5cd) |
| 54 | Create / quote print order (Mixam) | `printOrders.createDraftOrder`, `printOrders.getQuote` | 🟡 | ⬜ | Tradeprint→Mixam migration (d092a93) |
| 55 | Pay for print order | `printOrders.initiatePayment` → Stripe → Mixam submission | 🟡 | ⬜ | Webhook submits to Mixam (non-blocking) |
| 56 | Download catalogue PDF | `GET /api/catalogue/[showId]/[format]` | 🟡 | ⬜ | Formats: standard, by-class, judges-book |
| 57 | Download schedule PDF | `GET /api/schedule/[showId]` | 🟡 | ⬜ | |
| 58 | Download absentee report | `GET /api/absentee-report/[showId]` | 🟡 | ⬜ | Built from steward `markAbsent` data |
| 59 | Download prize cards PDF | prize-cards route | 🟡 | ⬜ | Home-print gated to admin (b020229) |
| 60 | Download judges' book | judges-book route | 🟡 | ⬜ | Dense write-in format |
| 61 | Download ring numbers / ring board | ring-numbers, ring-board routes | 🟡 | ⬜ | 6-up cards; logistics overview |
| 62 | Assign / remove stewards | `secretary.assignSteward`, `secretary.setStewardBreeds`, `secretary.removeSteward` | 🟡 | ⬜ | Breed-specific assignments |
| 63 | Assign judge to class / breed / sex | `secretary.assignJudge` | 🟡 | ⬜ | Complex breed fallback |
| 64 | Add ring | `secretary.addRing` | 🟡 | ✅ | `show-creation.test.ts` |
| 65 | Manage org people (officers, trustees) | `secretary.createOrgPerson` etc. | 🟡 | ⬜ | Surface in catalogue front matter |
| 66 | Manage sponsors (CRUD + assignment) | `secretary.createSponsor` etc., `secretary.assignClassSponsorship`, `secretary.assignShowSponsor` | 🟡 | ⬜ | Logos/names on catalogue + schedule |
| 67 | Record achievement manually | `secretary.recordAchievement` | 🟡 | ⬜ | For hand-recorded specials |
| 68 | View audit log of entry changes | `secretary.getAuditLog` | 🟡 | ⬜ | |
| 69 | View financial / sundry / entry reports | `secretary.getPaymentReport`, `secretary.getEntryReport`, `secretary.getSundryItemReport` | 🟡 | ⬜ | |
| 70 | View results publication status | `secretary.getResultsPublicationStatus` | 🟡 | ⬜ | Show-level + per-class |
| 71 | Publish results (whole show) | `secretary.publishResults` | 🔴 | ✅ | `publish-results.test.ts` |
| 72 | Publish per-class results | `secretary.publishClassResults` | 🟡 | ⬜ | Incremental |
| 73 | Unpublish results (whole show) | `secretary.unpublishResults` | 🔴 | ✅ | Same file |
| 74 | Unpublish per-class results | `secretary.unpublishClassResults` | 🟡 | ⬜ | |
| 75 | Mark / unmark RKC submission | `secretary.markRkcSubmitted`, `secretary.unmarkRkcSubmitted` | 🟡 | ⬜ | Final lock |
| 76 | Manage show checklist (add/check/delete) | `secretary.addChecklistItem`, `secretary.updateChecklistItem`, `secretary.deleteChecklistItem` | 🟡 | ⬜ | |
| 77 | Auto-detect checklist completion | `secretary.getChecklistAutoDetect` | 🟡 | ⬜ | Marks done when conditions met |
| 78 | Delete show (drafts only) | `secretary.deleteShow` | 🟡 | ⬜ | |

---

## Steward

| # | Journey | Procedures / Routes | Pri | Status | Notes |
|---|---|---|---|---|---|
| 79 | View my assigned shows | `steward.getMyShows` | 🔴 | ✅ | `steward-record-result.test.ts` |
| 80 | View show classes in my ring | `steward.getShowClasses` | 🔴 | ⬜ | Breed-filtered if assigned |
| 81 | View entries in a class | `steward.getClassEntries` | 🔴 | ⬜ | JH name handling (8c62cb6) |
| 82 | Record placement (1–7 or withheld/unplaced) | `steward.recordResult` | 🔴 | ✅ | `steward-record-result.test.ts` |
| 83 | Update existing result | `steward.recordResult` (re-call) | 🔴 | ✅ | Same file (upsert test) |
| 84 | Mark entry absent | `steward.markAbsent` | 🟡 | ✅ | Same file |
| 85 | Remove a recorded result | `steward.removeResult` | 🟡 | ✅ | Same file |
| 86 | Lock check before edit | `assertResultsNotLocked` (called inside recordResult) | 🔴 | ✅ | Same file (record + remove lock tests) |
| 87 | View live results | `steward.getLiveResults` | 🟢 | ⬜ | |
| 88 | View results summary | `steward.getResultsSummary` | 🟡 | ⬜ | Aggregated for ringside |
| 89 | View judge approval status | `steward.getJudgeApprovalStatus` | 🟡 | ⬜ | Gates publish |
| 90 | Record achievement (BoB, CC, RCC, etc.) | `steward.recordAchievement` | 🟡 | ⬜ | Keyed by ACHIEVEMENT_TYPES |
| 91 | Remove achievement | `steward.removeAchievement` | 🟡 | ⬜ | |
| 92 | Submit results for judge approval | `steward.submitForJudgeApproval` | 🟡 | ⬜ | Token email to judge |
| 93 | Update winner photo | `steward.updateWinnerPhoto` | 🟢 | ⬜ | S3 upload |

---

## Judge (token-authed flows)

| # | Journey | Procedures / Routes | Pri | Status | Notes |
|---|---|---|---|---|---|
| 94 | Accept judge offer | `GET /api/judge-contract/[token]` (form submit) | 🟡 | ⬜ | No NextAuth — token-only |
| 95 | Decline judge offer | Same endpoint, decline path | 🟡 | ⬜ | |
| 96 | Approve steward-submitted results | `GET /api/results-approval/[token]` | 🟡 | ⬜ | Gates secretary publish |

---

## Admin

| # | Journey | Procedures / Routes | Pri | Status | Notes |
|---|---|---|---|---|---|
| 97 | View admin dashboard | `adminDashboard.getDashboard` | 🟢 | ⬜ | Platform metrics |
| 98 | Manage breeds (CRUD + reorder) | `admin.createBreed`, `admin.updateBreed`, `admin.deleteBreed`, `admin.reorderBreedGroups` | 🟡 | ⬜ | Cascades |
| 99 | Manage breed groups | `admin.createBreedGroup`, `admin.updateBreedGroup` | 🟡 | ⬜ | |
| 100 | Manage class definitions | `admin.createClassDefinition`, `admin.updateClassDefinition`, `admin.deleteClassDefinition`, `admin.listClassDefinitions` | 🟡 | ⬜ | Global templates |
| 101 | Manage feedback inbox | `feedback.list`, `feedback.get`, `feedback.updateStatus`, `feedback.updateNotes` | 🟡 | ⬜ | Admin-only at /feedback |
| 102 | Manage backlog | `backlog.list`, `backlog.updateStatus`, `backlog.updateNotes`, `backlog.updateResponse` | 🟢 | ⬜ | Internal tool |
| 103 | Impersonate user | `POST /api/admin/impersonate`, `POST /api/admin/stop-impersonate` | 🟡 | ⬜ | Real-user role check critical |
| 104 | View system stats | `admin.getStats` | 🟢 | ⬜ | |

---

## Cross-cutting: Auth & Role Resolution

| # | Journey | Procedures / Routes | Pri | Status | Notes |
|---|---|---|---|---|---|
| 105 | Google OAuth login | NextAuth Google strategy | 🟡 | ⬜ | Hard to test; consider stub |
| 106 | Forgot password (send link) | `POST /api/auth/forgot-password` | 🟡 | ⬜ | Resend; token expiry |
| 107 | Reset password from token | `POST /api/auth/reset-password` | 🟡 | ⬜ | |
| 108 | JWT/DB role lag (freshly-promoted user) | `resolveCurrentRole` in `src/server/trpc/procedures.ts:20` | 🔴 | ✅ | `role-lag.test.ts` (3e9bc93 regression guard) |
| 109 | Impersonation never grants admin | `isAdmin` middleware uses real session | 🟡 | ✅ | `permission-guards.test.ts` — admin impersonating secretary keeps admin powers; secretary procedure runs as the impersonated user |

---

## Cross-cutting: Permission Guards

| # | Journey | Procedures / Routes | Pri | Status | Notes |
|---|---|---|---|---|---|
| 110 | secretaryProcedure: foreign-org user blocked | All secretary procedures + `verifyShowAccess` | 🔴 | ✅ | `permission-guards.test.ts` (middleware sweep); also publishResults, show-creation tests for verifyShowAccess/verifyOrgAccess specifically |
| 111 | stewardProcedure: only assigned stewards | All steward procedures + `stewardAssignments` check | 🔴 | ✅ | `permission-guards.test.ts` (middleware sweep); `steward-record-result.test.ts` for assignment check |
| 112 | adminProcedure: real role check | All admin procedures | 🟡 | ✅ | `permission-guards.test.ts` |
| 113 | protectedProcedure: rejects unauthed | All `protectedProcedure` | 🟡 | ✅ | `permission-guards.test.ts` (admin/secretary/steward sweeps cover unauthed); `payments-create-intent.test.ts` |
| 114 | Exhibitor cannot view others' entries | `entries.getById` | 🟡 | ⬜ | Needs separate test for entry-level scoping |

---

## Cross-cutting: Results Lock Enforcement

| # | Journey | Procedures / Routes | Pri | Status | Notes |
|---|---|---|---|---|---|
| 115 | Publish locks results (sets resultsLockedAt) | `secretary.publishResults` | 🔴 | ✅ | publish-results.test.ts |
| 116 | Steward cannot edit after publish | `steward.recordResult` + `assertResultsNotLocked` | 🔴 | ✅ | `steward-record-result.test.ts` (record + remove lock tests) |
| 117 | Unpublish unlocks for further edits | `secretary.unpublishResults` | 🔴 | ✅ | publish-results.test.ts |
| 118 | RKC submission as final lock | `secretary.markRkcSubmitted` | 🟡 | ⬜ | Beyond unpublish |

---

## Cross-cutting: Payment & Webhook Pipeline

| # | Journey | Procedures / Routes | Pri | Status | Notes |
|---|---|---|---|---|---|
| 119 | Create entry payment intent | `payments.createIntent` | 🔴 | ✅ | payments-create-intent.test.ts |
| 120 | payment_intent.succeeded → confirm entry | `POST /api/webhooks/stripe` | 🔴 | ✅ | `stripe-webhook.test.ts` |
| 121 | payment_intent.payment_failed → mark failed | Same webhook | 🟡 | ✅ | `stripe-webhook.test.ts` |
| 122 | checkout.session.completed → activate subscription | Same webhook | 🟡 | ⬜ | Pro plan |
| 123 | Resend inbound email → feedback row + admin notification | `POST /api/webhooks/resend` | 🟡 | ⬜ | Svix sig verification + Resend SDK fetch |
| 124 | Order checkout (entries + sundries bundled) | `orders.checkout` | 🟡 | ⬜ | |
| 125 | Print order checkout → Mixam submission | `printOrders.initiatePayment` + Stripe webhook | 🟡 | ⬜ | Async non-blocking Mixam call |

---

## Cross-cutting: Notifications

| # | Journey | Procedures / Routes | Pri | Status | Notes |
|---|---|---|---|---|---|
| 126 | Entry confirmation email | `sendEntryConfirmationEmail` | 🟡 | 🟠 | Mock invoked in `stripe-webhook.test.ts`; payload not asserted |
| 127 | Secretary new-entry notification | `sendSecretaryNotificationEmail` | 🟡 | 🟠 | Mock invoked in `stripe-webhook.test.ts`; payload not asserted |
| 128 | Judge offer email | `secretary.sendJudgeOffer` | 🟡 | ⬜ | Token link |
| 129 | Exhibitor results emails | `sendExhibitorResultsEmails` | 🟡 | 🟠 | Mock invoked; live payload not asserted |
| 130 | Follower results notifications | `sendFollowerResultsNotifications` | 🟡 | 🟠 | Same |
| 131 | Results milestone timeline posts | `createResultsMilestonePosts` | 🟡 | 🟠 | Same |
| 132 | Print order confirmation email | `sendPrintOrderConfirmationEmail` | 🟡 | ⬜ | |

---

## Cross-cutting: File Upload

| # | Journey | Procedures / Routes | Pri | Status | Notes |
|---|---|---|---|---|---|
| 133 | Presign S3 upload URL | `POST /api/upload/presign` | 🟡 | ⬜ | Per-type endpoints |
| 134 | Dog photo upload | `POST /api/upload/dog-photo` | 🟡 | ⬜ | Mobile Safari hardening |
| 135 | Judge / timeline / feedback / checklist photo upload | per-type endpoints | 🟢 | ⬜ | Validation in `storage.ts` |

---

## Cross-cutting: Soft-Delete & Status

| # | Journey | Procedures / Routes | Pri | Status | Notes |
|---|---|---|---|---|---|
| 136 | Deleted entries excluded from queries | `isNull(entries.deletedAt)` everywhere | 🟡 | ⬜ | Sweep test |
| 137 | Deleted dogs excluded from owner views | `isNull(dogs.deletedAt)` | 🟡 | ⬜ | But still visible in past entries |
| 138 | Withdrawn vs cancelled vs deleted distinctions | entries.status enum vs deletedAt | 🟡 | ⬜ | Easy to confuse — sweep test |

---

## Cross-cutting: Show Phase & Breed Validation

| # | Journey | Procedures / Routes | Pri | Status | Notes |
|---|---|---|---|---|---|
| 139 | Single-breed show validates dog breed | `orders.checkout` show.breedId primary, fallback to classes (6ec1d6f) | 🔴 | ✅ | `breed-validation.test.ts` — both primary and legacy fallback; permissive when no breed info anywhere |
| 140 | Class breed restriction enforced | `orders.checkout` per-class breed check | 🟡 | ✅ | `breed-validation.test.ts` — wrong breed in restricted class rejected; JH classes always exempt |
| 141 | Phase blockers gate status transitions | `secretary.getPhaseBlockers`, `getShowPhaseContext` | 🟡 | ⬜ | Checklist-driven |

---

## Fragility hotspots (from recent git history)

Areas with clusters of fix commits — bias test priority here:

1. ~~**Show breed validation** — `6ec1d6f` shifted primary source to `show.breedId`; legacy fallback path still active~~ ✅ — covered in `breed-validation.test.ts` (primary + fallback paths)
2. **JWT role lag** — `3e9bc93` added DB fallback; the only thing standing between freshly-promoted users and FORBIDDEN
3. **Placement display** — `adec801`, `c8ed1bd` show recurring fixes around placementStatus across PDF, secretary view, steward filter
4. **Mobile Safari PDF gen** — `013eb7f`, `1d130eb`, `0bbea64` switched html2canvas → html-to-image; brittle
5. **Mixam print integration** — `d092a93` migrated from Tradeprint; new third-party surface
6. **Catalogue layout** — `57cfa7c`, `c89b358`, `b781b93` orphan headers, cover overflow, pagination — fragile to content changes
7. **Junior Handler** — `81ff63a`, `da06126`, `a3de5cd` recurring JH-specific edge cases
8. **Resend webhook handling** — `be9c661` added SDK error guard; signature verification + parsing not tested
9. **Soft-delete vs status confusion** — easy place to filter on the wrong column

---

## Coverage summary

| Section | Total | ✅ | 🟠 | ⬜ |
|---|---:|---:|---:|---:|
| Exhibitor | 32 | 3 | 1 | 28 |
| Secretary | 46 | 5 | 1 | 40 |
| Steward | 15 | 6 | 0 | 9 |
| Judge | 3 | 0 | 0 | 3 |
| Admin | 8 | 0 | 0 | 8 |
| Auth & roles | 5 | 2 | 0 | 3 |
| Permission guards | 5 | 4 | 0 | 1 |
| Results lock | 4 | 3 | 0 | 1 |
| Payment / webhooks | 7 | 3 | 0 | 4 |
| Notifications | 7 | 0 | 5 | 2 |
| File upload | 3 | 0 | 0 | 3 |
| Soft-delete | 3 | 0 | 0 | 3 |
| Phase / breed | 3 | 2 | 0 | 1 |
| **TOTAL** | **141** | **28** | **7** | **106** |

🔴 show-day-critical journeys still uncovered: ~7.

---

## Suggested session order

1. ~~**Steward show-day** (#79–86) + **lock-edit guard** (#116) + **JWT role lag** (#108)~~ ✅
2. ~~**Payment webhook → entry confirmed** (#120)~~ ✅
3. ~~**Show-creation wizard** (#36–41)~~ ✅ (partial — wizard sub-steps remain)
4. ~~**First true journey test**: secretary creates show → exhibitor enters → steward records → secretary publishes~~ ✅ — `show-day-journey.test.ts`
5. ~~**Permission guard sweep** (#110–114)~~ ✅ — `permission-guards.test.ts` (16 tests + impersonation invariants)
6. **Catalogue / schedule / print PDFs** (#56–61) — most fragile per git history
7. **Notifications sweep** (#126–132) — assert payloads, not HTML
8. **Edge-case sweeps**: breed validation paths, soft-delete consistency, JH lifecycle
9. **Bulk classes + checklist seed** (#39, #40) — finish the show-creation wizard
10. **Judge contract / approval flow** (#42–46, 94–96) — token-based external flow

Tick journeys ✅ as their tests land. Add new journeys when you discover them.
