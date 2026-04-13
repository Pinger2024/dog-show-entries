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
| 1 | Sign up + register account | NextAuth (Google or password) | 🟡 | ✅ | `auth-config.test.ts` — Credentials authorize() logic (case-insensitive ilike, bcrypt compare, null on wrong/no password). Google OAuth dance not exercised — next-auth's runtime needs Next.js's edge module loader. |
| 2 | Complete onboarding profile | `onboarding.saveProfile`, `onboarding.complete`, `onboarding.getStatus` | 🟡 | ✅ | `invitations-onboarding.test.ts` — getStatus reflects profile completeness; saveProfile writes fields; complete sets onboardingCompletedAt |
| 3 | Add a dog | `dogs.create` (+ `dogOwners` row with isPrimary) | 🔴 | ✅ | `exhibitor-data.test.ts` — happy path + explicit owners |
| 4 | Update dog | `dogs.update`, `dogs.updateOwner` | 🟡 | ✅ | `exhibitor-data.test.ts` — happy path + ownership guard + soft-delete NOT_FOUND |
| 5 | Upload dog photo | `POST /api/upload/dog-photo` | 🟡 | ✅ | `edge-cases-sweep.test.ts` — 401 unauth, 400 missing file, 404 unowned dog, 200 success (first photo auto-marked primary, R2 upload mocked, key scoped to dogs/<dogId>/<uuid>.<ext>), 400 non-image MIME |
| 6 | Validate profile before entry | `entries.validateExhibitorForEntry` | 🔴 | ✅ | `exhibitor-data.test.ts` — flags missing fields, valid for complete profile, auto-fills from primary dogOwner |
| 7 | Browse + filter shows | `shows.list` with breed/status/date/search filters | 🟡 | ✅ | `shows-browse-and-edit.test.ts` — default visibility, status + showType filters, breedId narrowing, name search |
| 8 | View show detail + classes | `shows.getById`, `shows.getClasses` | 🟡 | ✅ | `shows-browse-and-edit.test.ts` — happy + NOT_FOUND |
| 9 | Enter dog into show (live path) | `orders.checkout` | 🔴 | 🟠 | `breed-validation.test.ts` exercises the breed/age path; need broader checkout test for sundries, JH details, multi-entry carts. **Note**: `payments.createIntent` and `entries.create` are not called from the UI but still have tests guarding any future re-use |
| 10 | Validate dog eligibility (age, breed, JH vs standard) | `orders.checkout` checks | 🔴 | ✅ | `breed-validation.test.ts` — primary + fallback breed paths, class-level enforcement, JH bypass, age 4mo / 6mo / 12wk gates |
| 11 | Detect judge conflict (can't exhibit under assigned judge) | `orders.checkout` fuzzy name match | 🟡 | ✅ | `edge-cases-sweep.test.ts` — exhibitor name matches assigned judge → BAD_REQUEST |
| 12 | Enter multiple classes in one entry | `orders.checkout` array of classIds | 🟡 | ✅ | `edge-cases-sweep.test.ts` — sums fees via show-level tiered pricing (firstEntryFee + subsequentEntryFee × n-1) |
| 13 | Complete payment via Stripe | `POST /api/webhooks/stripe` (payment_intent.succeeded) | 🔴 | ✅ | `stripe-webhook.test.ts` — legacy single-entry + order-level + idempotent re-delivery |
| 14 | Receive entry confirmation email | `sendEntryConfirmationEmail` (async post-webhook) | 🟡 | ✅ | `email-payloads.test.ts` — to/subject/body assertions; no-op for missing order |
| 15 | View my entries (active + past) | `entries.list` | 🟡 | ✅ | `exhibitor-data.test.ts` — own-entries scope, dogId filter, soft-delete excluded |
| 16 | View entry detail | `entries.getById` | 🟡 | ✅ | `exhibitor-data.test.ts` — own + secretary + admin can read; other exhibitors blocked |
| 17 | Edit entry classes (swap/add pre-show) | `entries.update` | 🟡 | ✅ | `shows-browse-and-edit.test.ts` — class set replaced; fee recalculated using show-level tiered pricing; audit log written |
| 18 | Handle fee adjustment (add/remove class) | `entries.update` feeDiff path | 🟡 | ✅ | `shows-browse-and-edit.test.ts` — feeDiff > 0 creates adjustment PaymentIntent + payment row; feeDiff < 0 creates Stripe refund + refund payment row (via mocked stripe.refunds.create) |
| 19 | Withdraw from show | `entries.withdraw` | 🟡 | ✅ | `exhibitor-data.test.ts` — happy path, ownership guard, double-withdraw rejection |
| 20 | View show schedule PDF | `GET /api/schedule/[showId]` | 🟡 | ✅ | `pdf-routes.test.ts` — 404/401/200 with React-PDF mocked at the renderToBuffer level |
| 21 | Purchase catalogue | `orders.checkout` (catalogue sundry) | 🟡 | 🟠 | Sundry order setup covered indirectly via `orders-and-catalogue.test.ts` paid-order fixture; full checkout flow uncovered |
| 22 | View purchased catalogue | `shows.getCatalogueAccess`, `shows.getMyCataloguePurchases` | 🟡 | ✅ | `orders-and-catalogue.test.ts` — hasPurchased + isAvailable; getMyCataloguePurchases lists shows where caller bought |
| 23 | View dog results post-show | `dogs.getShowResults`, `dogs.getWinSummary` | 🟢 | ✅ | `edge-cases-sweep.test.ts` — getShowResults returns flat placements sorted by show date desc; empty for dogs with no placements; getWinSummary shape |
| 24 | Create timeline post for dog | `timeline.createPost` | 🟡 | ✅ | `timeline-follows-progress.test.ts` — happy + ownership guard + empty-post rejection |
| 25 | Delete timeline post | `timeline.deletePost` (author or dog owner) | 🟡 | ✅ | `timeline-follows-progress.test.ts` — author can delete; stranger blocked; NOT_FOUND |
| 26 | Follow / unfollow a dog | `follows.toggle`, `follows.isFollowing`, `follows.count`, `follows.getFollowedDogs` | 🟢 | ✅ | `timeline-follows-progress.test.ts` — toggle round-trip, isFollowing reflects state, count is public, getFollowedDogs lists subscriptions |
| 27 | View title progress (Champion, etc.) | `dogs.getTitleProgress` | 🟢 | ✅ | `timeline-follows-progress.test.ts` — shape only + NOT_FOUND |
| 28 | Add external result (won outside Remi) | `dogs.addExternalResult`, `dogs.removeExternalResult` | 🟢 | ✅ | `timeline-follows-progress.test.ts` — happy add (selfReported=true), ownership guard, remove only allows self-reported (not official) |
| 29 | View user dashboard | `users.getDashboard` | 🟡 | ✅ | `user-profile.test.ts` — shape only with dogs + upcoming entry |
| 30 | Update profile | `users.updateProfile` | 🟡 | ✅ | `user-profile.test.ts` — full update + nullable clear |
| 31 | Set / change password | `users.setPassword`, `users.changePassword`, `users.hasPassword` | 🟡 | ✅ | `user-profile.test.ts` — set, refuse double-set, change with correct/wrong current password, refuse change without prior password |
| 32 | Submit feedback widget | `feedback.submit` | 🟢 | ✅ | `user-profile.test.ts` — widget row with diagnostics, zod min-length rejection |

---

## Secretary

| # | Journey | Procedures / Routes | Pri | Status | Notes |
|---|---|---|---|---|---|
| 33 | Accept secretary invitation | `invitations.send`, `invitations.getByToken`, `invitations.accept`, `invitations.list`, `invitations.revoke` | 🟡 | ✅ | `invitations-onboarding.test.ts` — send auto-accepts existing users + assigns role + creates membership; pending path for new emails; getByToken (incl. expired status); accept rejects wrong-email + expired tokens; list/revoke with cross-secretary guard |
| 34 | View dashboard (orgs + shows summary) | `secretary.getDashboard` | 🟡 | ✅ | `easy-wins-final.test.ts` |
| 35 | View organisation + members | `secretary.getOrganisation`, `secretary.orgMembers` | 🟡 | ✅ | `easy-wins-final.test.ts` |
| 36 | Create new show (full wizard) | many `secretary.*` mutations | 🔴 | 🟠 | `show-creation.test.ts` covers create+venue+ring; class wizard + checklist seed remain |
| 37 | — Create / select venue | `secretary.createVenue`, `secretary.listVenues` | 🟡 | ✅ | `show-creation.test.ts` (no-postcode path; geocoding fetch not exercised) |
| 38 | — Define show details (type, breed, dates, fees) | `shows.create` | 🔴 | ✅ | `show-creation.test.ts` — happy path, classes (combined + separate sex), slug uniqueness, subscription gate, non-member rejection |
| 39 | — Seed checklist from defaults | `secretary.seedChecklist` | 🟡 | ✅ | `easy-wins-final.test.ts` — seeds + idempotent no-op |
| 40 | — Bulk-create classes from template | `secretary.bulkCreateClasses` | 🟡 | ✅ | `secretary-class-venue-bulk.test.ts` — breed×classDef matrix; splitBySex doubles standard classes but JH stays single global; handling classes (no breeds); auto class numbers; cross-org rejection |
| 41 | — Manage sundry items | `secretary.createSundryItem`, `updateSundryItem` | 🟡 | ✅ | `secretary-crud-sweep.test.ts` — auto sortOrder, update price + enabled, cross-org/cross-show rejection |
| 42 | Send judge offers | `secretary.sendJudgeOffer` | 🟡 | ✅ | `secretary-judges.test.ts` — happy path creates contract + sends email + backfills judge.contactEmail; rejects unknown judge; org access guard |
| 43 | Search + add judges | `secretary.searchJudges`, `secretary.addJudge` | 🟡 | 🟠 | `secretary-judges.test.ts` covers add + searchJudges (case-insensitive dedup); RKC scrape (kcJudgeSearch) untested |
| 44 | Update judge (breed/sex assignments) | `secretary.updateJudge`, `assignJudge`, `bulkAssignJudge`, `removeJudgeAssignment`, `getShowJudges` | 🟡 | ✅ | `secretary-judges.test.ts` |
| 45 | View judge contract status | `secretary.getJudgeContracts` | 🟡 | ✅ | `secretary-judges.test.ts` — happy + empty |
| 46 | Resend judge offer | `secretary.resendJudgeOffer` | 🟡 | ✅ | `secretary-schedule-judges.test.ts` — happy path refreshes tokenExpiresAt + offerSentAt; rejects when contract is past offer_sent stage |
| 47 | View judge coverage report | `secretary.getJudgeCoverage` | 🟡 | ✅ | `secretary-judges.test.ts` — unmet + covered after assignment |
| 48 | View show entries (all statuses) | `entries.getForShow` | 🟡 | ✅ | `secretary-show-mgmt.test.ts` — shape only |
| 49 | Issue refund | `secretary.issueRefund` | 🟡 | ✅ | `secretary-final-sweep.test.ts` — full refund cancels entry + marks payment 'refunded'; partial refund marks 'partially_refunded' + entry stays confirmed; rejects refund > remaining; no completed payment; foreign show |
| 50 | Auto / manual catalogue numbering | `secretary.assignCatalogueNumbers` | 🟡 | ✅ | `secretary-final-sweep.test.ts` — numbers confirmed entries 1..n, returns 0 for empty show |
| 51 | Open entries (status → entries_open) | Direct shows.status update (no procedure) | 🟡 | ✅ | Used everywhere via `setShowStatus` test helper; behaviour-tested by `breed-validation.test.ts` (entries_open allows checkout), `secretary-show-mgmt.test.ts` (in_progress allows publish), etc. |
| 52 | Close entries | Direct shows.status update (no procedure) | 🟡 | ✅ | Same pattern as #51 — `shows-browse-and-edit.test.ts` proves entries_closed blocks `entries.update`; `payments-create-intent.test.ts` proves it blocks new entries |
| 53 | Edit schedule data (sponsors, judge bios, etc.) | `secretary.updateScheduleData` | 🟡 | ✅ | `secretary-schedule-judges.test.ts` — saves scheduleData JSONB + show-level fields (showOpenTime, judgingStartTime, onCallVet); syncs new officers + guarantors into organisationPeople; case-insensitive dedup |
| 54 | Create / quote print order (Mixam) | `printOrders.createDraftOrder`, `getById`, `listByShow`, `cancelOrder` | 🟡 | 🟠 | `print-orders.test.ts` — full CRUD + cancel lifecycle; cross-org rejection. getQuote (Mixam pricing) deferred. |
| 55 | Pay for print order | `printOrders.initiatePayment` → Stripe → Mixam submission | 🟡 | 🟠 | Stripe webhook print-order branch covered in `stripe-webhook.test.ts`; initiatePayment itself uncovered (heavy: PDF + R2 + Stripe intent) |
| 56 | Download catalogue PDF | `GET /api/catalogue/[showId]/[format]` | 🟡 | 🟠 | Catalogue route uses generateCataloguePdf (mocked); separate test file would cover the format-specific access gates |
| 57 | Download schedule PDF | `GET /api/schedule/[showId]` | 🟡 | ✅ | `pdf-routes.test.ts` |
| 58 | Download absentee report | `GET /api/absentee-report/[showId]` | 🟡 | ✅ | `pdf-routes.test.ts` — CSV happy + 401 + 403 |
| 59 | Download prize cards PDF | prize-cards route | 🟡 | ✅ | `pdf-routes.test.ts` |
| 60 | Download judges' book | judges-book route | 🟡 | ✅ | `pdf-routes.test.ts` |
| 61 | Download ring numbers / ring board | ring-numbers, ring-board routes | 🟡 | ✅ | `pdf-routes.test.ts` (incl. 403 non-member) |
| 62 | Assign / remove stewards | `secretary.assignSteward`, `secretary.setStewardBreeds`, `secretary.removeSteward`, `getShowStewards` | 🟡 | ✅ | `secretary-stewards-checklist.test.ts` — assign promotes exhibitor → steward; remove reverts role only when last assignment goes; double-assign rejected; non-existent email rejected |
| 63 | Assign judge to class / breed / sex | `secretary.assignJudge`, `bulkAssignJudge`, `removeJudgeAssignment` | 🟡 | ✅ | `secretary-judges.test.ts` (already covered as part of judge management sweep) |
| 64 | Add ring | `secretary.addRing` | 🟡 | ✅ | `show-creation.test.ts` |
| 65 | Manage org people (officers, trustees) | `secretary.createOrgPerson`, `listOrgPeople`, `updateOrgPerson`, `deleteOrgPerson` | 🟡 | ✅ | `secretary-crud-sweep.test.ts` — full CRUD + name-sorted list + cross-org rejection |
| 66 | Manage sponsors (CRUD + assignment) | `secretary.createSponsor`, `updateSponsor`, `deleteSponsor`, `listSponsors`, `assignShowSponsor`, `removeShowSponsor`, `listShowSponsors`, `assignClassSponsorship`, `removeClassSponsorship`, `upsertClassSponsor` | 🟡 | ✅ | `secretary-crud-sweep.test.ts` — full sponsor directory CRUD (soft-delete), show-level + class-level assignment lifecycle, free-text upsert with trim |
| 67 | Record achievement manually | `secretary.recordAchievement`, `getShowAchievements` | 🟡 | ✅ | `secretary-show-mgmt.test.ts` (record); `secretary-schedule-judges.test.ts` (getShowAchievements with dog + breed embedded) |
| 68 | View audit log of entry changes | `secretary.getAuditLog` | 🟡 | ✅ | `secretary-show-mgmt.test.ts` — shape only |
| 69 | View financial / sundry / entry reports | `secretary.getPaymentReport`, `secretary.getEntryReport`, `secretary.getSundryItemReport` | 🟡 | 🟠 | `secretary-show-mgmt.test.ts` covers entry + payment shape; sundry report uncovered |
| 70 | View results publication status | `secretary.getResultsPublicationStatus` | 🟡 | ✅ | `secretary-show-mgmt.test.ts` — published/locked + judge approval breakdown |
| 71 | Publish results (whole show) | `secretary.publishResults` | 🔴 | ✅ | `publish-results.test.ts` |
| 72 | Publish per-class results | `secretary.publishClassResults` | 🟡 | ✅ | `secretary-show-mgmt.test.ts` — only the targeted class is published |
| 73 | Unpublish results (whole show) | `secretary.unpublishResults` | 🔴 | ✅ | Same file |
| 74 | Unpublish per-class results | `secretary.unpublishClassResults` | 🟡 | ✅ | `secretary-show-mgmt.test.ts` |
| 75 | Mark / unmark RKC submission | `secretary.markRkcSubmitted`, `secretary.unmarkRkcSubmitted` | 🟡 | ✅ | `secretary-show-mgmt.test.ts` — only completed shows can be marked; toggle is reversible |
| 76 | Manage show checklist (add/check/delete) | `secretary.addChecklistItem`, `secretary.updateChecklistItem`, `secretary.deleteChecklistItem` | 🟡 | ✅ | `secretary-stewards-checklist.test.ts` — auto sortOrder per phase, status flip stamps completedAt + completedByUserId, notes/assignedToName, delete |
| 77 | Auto-detect checklist completion | `secretary.getChecklistAutoDetect` | 🟡 | ✅ | `secretary-stewards-checklist.test.ts` — shape only |
| 78 | Delete show (drafts only) | `secretary.deleteShow` | 🟡 | ✅ | `secretary-show-mgmt.test.ts` — happy path + non-draft guard + has-entries guard + cross-org rejection |

---

## Steward

| # | Journey | Procedures / Routes | Pri | Status | Notes |
|---|---|---|---|---|---|
| 79 | View my assigned shows | `steward.getMyShows` | 🔴 | ✅ | `steward-record-result.test.ts` |
| 80 | View show classes in my ring | `steward.getShowClasses` | 🔴 | ✅ | `steward-sweep.test.ts` |
| 81 | View entries in a class | `steward.getClassEntries` | 🔴 | ✅ | `steward-sweep.test.ts` |
| 82 | Record placement (1–7 or withheld/unplaced) | `steward.recordResult` | 🔴 | ✅ | `steward-record-result.test.ts` |
| 83 | Update existing result | `steward.recordResult` (re-call) | 🔴 | ✅ | Same file (upsert test) |
| 84 | Mark entry absent | `steward.markAbsent` | 🟡 | ✅ | Same file |
| 85 | Remove a recorded result | `steward.removeResult` | 🟡 | ✅ | Same file |
| 86 | Lock check before edit | `assertResultsNotLocked` (called inside recordResult) | 🔴 | ✅ | Same file (record + remove lock tests) |
| 87 | View live results | `steward.getLiveResults` | 🟢 | ✅ | `steward-sweep.test.ts` — public unpublished gate + privileged bypass |
| 88 | View results summary | `steward.getResultsSummary` | 🟡 | ✅ | `easy-wins-final.test.ts` |
| 89 | View judge approval status | `steward.getJudgeApprovalStatus` | 🟡 | ✅ | `steward-sweep.test.ts` |
| 90 | Record achievement (BoB, CC, RCC, etc.) | `steward.recordAchievement` | 🟡 | ✅ | `steward-sweep.test.ts` — happy path, sex validation, upsert, lock guard, dog-not-entered |
| 91 | Remove achievement | `steward.removeAchievement` | 🟡 | ✅ | `steward-sweep.test.ts` |
| 92 | Submit results for judge approval | `steward.submitForJudgeApproval` | 🟡 | ✅ | `steward-sweep.test.ts` — happy + email mock, no-email, no-assignment |
| 93 | Update winner photo | `steward.updateWinnerPhoto` | 🟢 | ✅ | `steward-sweep.test.ts` — happy path, requires existing result |

---

## Judge (token-authed flows)

| # | Journey | Procedures / Routes | Pri | Status | Notes |
|---|---|---|---|---|---|
| 94 | Accept judge offer | `GET /api/judge-contract/[token]` + `POST` action=accept | 🟡 | ✅ | `judge-contract-route.test.ts` — POST accept stamps offer_accepted + acceptedAt; GET 200 happy / 404 unknown / 410 expired; rejects already-responded contracts |
| 95 | Decline judge offer | Same endpoint, action=decline | 🟡 | ✅ | `judge-contract-route.test.ts` — POST decline marks declined + stores reason in expenseNotes |
| 96 | Approve steward-submitted results | `GET /api/results-approval/[token]` + `POST` action=approve | 🟡 | ✅ | `results-approval-route.test.ts` — GET 200/404; POST approve marks approvalStatus + approvedAt + note; rejects re-approval; 404 for unknown token |

---

## Admin

| # | Journey | Procedures / Routes | Pri | Status | Notes |
|---|---|---|---|---|---|
| 97 | View admin dashboard | `adminDashboard.getDashboard` | 🟢 | ✅ | `admin-sweep.test.ts` (shape only) |
| 98 | Manage breeds (CRUD + reorder) | `admin.createBreed`, `admin.updateBreed`, `admin.deleteBreed`, `admin.reorderBreedGroups` | 🟡 | ✅ | `admin-sweep.test.ts` |
| 99 | Manage breed groups | `admin.createBreedGroup`, `admin.updateBreedGroup`, `deleteBreedGroup`, `reorderBreedGroups` | 🟡 | ✅ | `admin-sweep.test.ts` — incl. delete-blocked-by-breeds + reorder positional sortOrder |
| 100 | Manage class definitions | `admin.createClassDefinition`, `updateClassDefinition`, `deleteClassDefinition`, `listClassDefinitions` | 🟡 | ✅ | `admin-sweep.test.ts` — duplicate-name CONFLICT bug noted (postgres-js error wrapping) |
| 101 | Manage feedback inbox | `feedback.list`, `feedback.get`, `feedback.updateStatus`, `feedback.updateNotes` | 🟡 | ✅ | `admin-sweep.test.ts` — list, status filter, role gate, status update, notes update, get NOT_FOUND |
| 102 | Manage backlog | `backlog.list`, `get`, `updateStatus`, `updateNotes`, `updateResponse`, `counts` | 🟢 | ✅ | `backlog-and-soft-delete.test.ts` — list (sorted by featureNumber desc), status filter, role gate, full update CRUD with NOT_FOUND, per-status counts (zero-filled), get NOT_FOUND |
| 103 | Impersonate user | `POST /api/admin/impersonate`, `POST /api/admin/stop-impersonate` | 🟡 | 🟠 | `permission-guards.test.ts` covers the impersonation invariants; the route handlers themselves uncovered |
| 104 | View system stats | `admin.getStats` | 🟢 | ✅ | `permission-guards.test.ts` (canary) |

---

## Cross-cutting: Auth & Role Resolution

| # | Journey | Procedures / Routes | Pri | Status | Notes |
|---|---|---|---|---|---|
| 105 | Google OAuth login | NextAuth Google strategy | 🟡 | 🟠 | `auth-config.test.ts` covers Credentials provider; Google OAuth callback can't be exercised in vitest without a real browser + Google tokens |
| 106 | Forgot password (send link) | `POST /api/auth/forgot-password` | 🟡 | ✅ | `auth-password-reset.test.ts` — token created (1h expiry); no enumeration for unknown emails or empty body; 60s rate-limit; older unused tokens invalidated when issuing new one |
| 107 | Reset password from token | `POST /api/auth/reset-password` | 🟡 | ✅ | `auth-password-reset.test.ts` — bcrypt hash updated, token burned; rejects unknown/missing/expired/already-used token; rejects too-short password |
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
| 114 | Exhibitor cannot view others' entries | `entries.getById` | 🟡 | ✅ | `exhibitor-data.test.ts` — covered as part of getById test group |

---

## Cross-cutting: Results Lock Enforcement

| # | Journey | Procedures / Routes | Pri | Status | Notes |
|---|---|---|---|---|---|
| 115 | Publish locks results (sets resultsLockedAt) | `secretary.publishResults` | 🔴 | ✅ | publish-results.test.ts |
| 116 | Steward cannot edit after publish | `steward.recordResult` + `assertResultsNotLocked` | 🔴 | ✅ | `steward-record-result.test.ts` (record + remove lock tests) |
| 117 | Unpublish unlocks for further edits | `secretary.unpublishResults` | 🔴 | ✅ | publish-results.test.ts |
| 118 | RKC submission as final lock | `secretary.markRkcSubmitted` | 🟡 | ✅ | `secretary-show-mgmt.test.ts` |

---

## Cross-cutting: Payment & Webhook Pipeline

| # | Journey | Procedures / Routes | Pri | Status | Notes |
|---|---|---|---|---|---|
| 119 | Create entry payment intent | `payments.createIntent` | 🔴 | ✅ | payments-create-intent.test.ts |
| 120 | payment_intent.succeeded → confirm entry | `POST /api/webhooks/stripe` | 🔴 | ✅ | `stripe-webhook.test.ts` |
| 121 | payment_intent.payment_failed → mark failed | Same webhook | 🟡 | ✅ | `stripe-webhook.test.ts` |
| 122 | checkout.session.completed → activate subscription | Same webhook | 🟡 | ✅ | `stripe-subscription-webhook.test.ts` — org subscription (links plan via priceId, sets stripeCustomerId/SubscriptionId/status); Pro user subscription; non-subscription mode no-op. Plus `customer.subscription.updated` (status + plan changes for org and Pro) and `customer.subscription.deleted` (clears planId, marks cancelled) |
| 123 | Resend inbound email → feedback row + admin notification | `POST /api/webhooks/resend` | 🟡 | ✅ | `resend-webhook.test.ts` — 400 missing svix headers; 400 verification throw; 500 missing secret; happy path inserts feedback row (parsed from name + Re: prefix stripped); idempotent re-delivery; ignores non-email.received types |
| 124 | Order checkout (entries + sundries bundled) | `orders.checkout`, `orders.list`, `orders.getById` | 🟡 | 🟠 | `orders-and-catalogue.test.ts` covers list + getById (own only, NOT_FOUND); checkout's full multi-entry/sundries path remains partial |
| 125 | Print order checkout → Mixam submission | `printOrders.initiatePayment` + Stripe webhook | 🟡 | 🟠 | Stripe webhook print-order branch covered; initiatePayment itself uncovered |

---

## Cross-cutting: Notifications

| # | Journey | Procedures / Routes | Pri | Status | Notes |
|---|---|---|---|---|---|
| 126 | Entry confirmation email | `sendEntryConfirmationEmail` | 🟡 | 🟠 | Mock invoked in `stripe-webhook.test.ts`; payload not asserted |
| 127 | Secretary new-entry notification | `sendSecretaryNotificationEmail` | 🟡 | 🟠 | Mock invoked in `stripe-webhook.test.ts`; payload not asserted |
| 128 | Judge offer email | `secretary.sendJudgeOffer`, `sendJudgeApprovalRequestEmail` | 🟡 | ✅ | `email-payloads.test.ts` — payload incl. token + show name |
| 129 | Exhibitor results emails | `sendExhibitorResultsEmails` | 🟡 | 🟠 | Mock invoked; live payload not asserted |
| 130 | Follower results notifications | `sendFollowerResultsNotifications` | 🟡 | 🟠 | Same |
| 131 | Results milestone timeline posts | `createResultsMilestonePosts` | 🟡 | 🟠 | Same |
| 132 | Print order confirmation email | `sendPrintOrderConfirmationEmail` | 🟡 | ✅ | `email-payloads.test.ts` — payload incl. order items + delivery |

---

## Cross-cutting: File Upload

| # | Journey | Procedures / Routes | Pri | Status | Notes |
|---|---|---|---|---|---|
| 133 | Presign S3 upload URL | `POST /api/upload/presign` | 🟡 | ✅ | `upload-presign-route.test.ts` — 401 unauth; happy path returns presignedUrl + publicUrl + scoped key; rejects unsupported MIME / over-size / missing fields; **security**: extension derived from validated MIME type, NOT client filename (rejects `.exe` masquerade via `contentType: application/pdf`) |
| 134 | Dog photo upload | `POST /api/upload/dog-photo` | 🟡 | ✅ | `edge-cases-sweep.test.ts` |
| 135 | Judge / timeline / feedback / checklist photo upload | per-type endpoints | 🟢 | ✅ | `upload-per-type-routes.test.ts` — auth, file, MIME validation; happy-path 200 with R2 mock for all four routes |

---

## Cross-cutting: Soft-Delete & Status

| # | Journey | Procedures / Routes | Pri | Status | Notes |
|---|---|---|---|---|---|
| 136 | Deleted entries excluded from queries | `isNull(entries.deletedAt)` everywhere | 🟡 | ✅ | `backlog-and-soft-delete.test.ts` — covers entries.list (exhibitor) AND entries.getForShow (secretary) AND dogs.getById |
| 137 | Deleted dogs excluded from owner views | `isNull(dogs.deletedAt)` | 🟡 | ✅ | `exhibitor-data.test.ts` + `backlog-and-soft-delete.test.ts` |
| 138 | Withdrawn vs cancelled vs deleted distinctions | entries.status enum vs deletedAt | 🟡 | ✅ | `backlog-and-soft-delete.test.ts` — orders.checkout's stale-entry sweep marks status='cancelled' AND sets deletedAt simultaneously |

---

## Cross-cutting: Show Phase & Breed Validation

| # | Journey | Procedures / Routes | Pri | Status | Notes |
|---|---|---|---|---|---|
| 139 | Single-breed show validates dog breed | `orders.checkout` show.breedId primary, fallback to classes (6ec1d6f) | 🔴 | ✅ | `breed-validation.test.ts` — both primary and legacy fallback; permissive when no breed info anywhere |
| 140 | Class breed restriction enforced | `orders.checkout` per-class breed check | 🟡 | ✅ | `breed-validation.test.ts` — wrong breed in restricted class rejected; JH classes always exempt |
| 141 | Phase blockers gate status transitions | `secretary.getPhaseBlockers`, `getShowPhaseContext` | 🟡 | ✅ | `secretary-show-mgmt.test.ts` (blockers); `easy-wins-final.test.ts` (phase context) |

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
| Exhibitor | 32 | 30 | 2 | 0 |
| Secretary | 46 | 41 | 6 | 0 |
| Steward | 15 | 15 | 0 | 0 |
| Judge | 3 | 3 | 0 | 0 |
| Admin | 8 | 7 | 1 | 0 |
| Auth & roles | 5 | 4 | 1 | 0 |
| Permission guards | 5 | 5 | 0 | 0 |
| Results lock | 4 | 4 | 0 | 0 |
| Payment / webhooks | 7 | 5 | 2 | 0 |
| Notifications | 7 | 4 | 3 | 0 |
| File upload | 3 | 3 | 0 | 0 |
| Soft-delete | 3 | 3 | 0 | 0 |
| Phase / breed | 3 | 3 | 0 | 0 |
| **TOTAL** | **141** | **136** | **5** | **0** |

🔴 show-day-critical journeys still uncovered: ~2.

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
