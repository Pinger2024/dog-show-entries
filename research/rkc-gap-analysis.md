# RKC Regulations vs Remi -- Definitive Gap Analysis

> Generated: 2026-03-16
> Source: `research/rkc-regulations-comprehensive.md` mapped against Remi's current schema, enums, templates, and features.
> Priority key: **P1** = blocks real shows, **P2** = important for compliance, **P3** = nice to have, **P4** = future/edge case

---

## 1. SHOW SETUP

| Status | Category | Regulation | What Remi Has | What's Needed | Priority |
|--------|----------|-----------|---------------|---------------|----------|
| ✅ | 1.1 Show Types | Championship, Open, Premier Open, Limited, Companion show types (F.4) | `showTypeEnum` has all 6: companion, primary, limited, open, premier_open, championship | Complete | -- |
| ✅ | 1.1 Show Types | Show scope (single breed, group, general) | `showScopeEnum` has single_breed, group, general | Complete | -- |
| ❌ | 1.1 Show Types | Matches (elimination one-against-one competition) | No match show type in enum or workflow | Add 'match' to `showTypeEnum`; build match-specific workflow | P4 |
| ❌ | 1.1 Show Types | Partnership shows (shared venue, separate licences) | No concept of linked/partnership shows | Add ability to link shows as partnership events | P4 |
| 🔄 | 1.1 Show Types | Limited show eligibility: CC holders + 5 RCC holders (2026) ineligible | No entry eligibility validation against CC/RCC history | Need eligibility check: block limited show entries from CC/5-RCC holders | P2 |
| ➖ | 1.2 Licence | 12-month licence application deadline | External RKC process | Not applicable -- Remi doesn't manage RKC licence applications | -- |
| ✅ | 1.2 Licence | RKC licence number stored | `shows.kcLicenceNo` field exists | Complete | -- |
| ➖ | 1.2 Licence | Licence fees, new society restrictions | External RKC process | Not applicable | -- |
| ➖ | 1.3 Society Registration | Registration of Title, MOT fees, annual returns | External RKC process | Not applicable | -- |
| ✅ | 1.3 Society Registration | Organisation/club data model | `organisations` table with name, KC reg number, contact details, Stripe, logo | Complete | -- |
| ⚠️ | 1.3 Society Registration | Committee/officer tracking | `scheduleData.officers` stores name+position as JSONB, but no dedicated committee table | Consider promoting to proper table for multi-show reuse; current approach works | P4 |
| ➖ | 1.4 Insurance | Public liability insurance must be displayed | Physical show-day requirement | Not applicable for digital platform | -- |
| ✅ | 1.4 Insurance | Insurance tracking in checklist | `showChecklistItems` with `requiresDocument`, `hasExpiry`, `documentExpiryDate`, `fileUploadId` -- can track insurance cert | Complete | -- |
| ➖ | 1.4 Insurance | Risk assessment required | Physical planning document | Could add as checklist template item | P4 |
| ➖ | 1.5 Facilities | Ring dimensions, wet weather, gangways, grooming areas | Physical venue requirements | Not applicable -- venue/physical logistics | -- |
| ✅ | 1.5 Facilities | Ring management | `rings` table with number, show day, start time; linked to judge assignments | Complete | -- |
| ⚠️ | 1.6 Benching | Benching now optional (2026); if provided, rules apply | `scheduleData.isBenched` and `scheduleData.benchingRemovalTime` exist | Working; should ensure schedule PDF reflects 2026 optional language | P3 |
| ✅ | 1.7 Sponsorship | Sponsor management | Full 3-tier sponsor system: `sponsors` (directory), `showSponsors` (show-level), `classSponsorships` (class-level) with tiers, ad images, prize money | Complete | -- |
| ❌ | 1.7 Sponsorship | Judge-linked sponsorship prohibition enforcement | No validation preventing judge-conditional sponsorship | Low risk -- informational only; add warning in sponsor UI | P4 |

---

## 2. ENTRIES

| Status | Category | Regulation | What Remi Has | What's Needed | Priority |
|--------|----------|-----------|---------------|---------------|----------|
| ⚠️ | 2.1 Eligibility | Minimum age 4 months for exhibition, 6 months for competition | `classDefinitions.minAgeMonths` exists but no global entry-level age check | Add entry-level age validation: reject dogs under 4 months on show date; validate class age limits | P1 |
| ✅ | 2.1 Eligibility | NFC entries | `entries.isNfc` boolean; `shows.scheduleData.acceptsNfc`; `shows.nfcEntryFee` | Complete | -- |
| 🔄 | 2.1 Eligibility | NFC minimum age lowered to 12 weeks (2026) | NFC age not explicitly validated | Add NFC age validation: 12 weeks minimum (was 4 months pre-2026) | P2 |
| ✅ | 2.1 Eligibility | RKC registration | `dogs.kcRegNumber` field; `users.kcAccountNo` field | Complete (stores reg numbers) | -- |
| ❌ | 2.1 Eligibility | NAF/TAF/CNAF support for pending registrations | No field to indicate registration status is pending | Add registration status field to `dogs` (registered/naf/taf/cnaf) | P2 |
| ❌ | 2.1 Eligibility | ATC (Authority to Compete) for overseas dogs | No ATC number field | Add ATC field to `dogs`; validate for entries | P3 |
| ❌ | 2.1 Eligibility | Surgical alterations -- "Permission to Show" form | No field for surgical alteration status | Add field/flag for surgical alteration with permission reference | P3 |
| ❌ | 2.1 Eligibility | Docked dog restrictions | No docking status field on dogs | Add `isDocked` boolean to dogs; enforce exhibition restrictions based on venue country and public admission | P3 |
| ❌ | 2.1 Eligibility | Disqualified persons check | No disqualification tracking | Add field or reference; low priority as RKC maintains this list | P4 |
| ❌ | 2.1 Eligibility | Savage disposition disqualification | No tracking | Edge case -- RKC Board decision | P4 |
| ❌ | 2.1 Eligibility | Handler contact details must be available (2025) | `entries.handlerId` links to users but no explicit handler contact requirement | Users table has address/phone -- ensure handler details are captured at entry time | P3 |
| ✅ | 2.2 Entry Process | Entry closing date | `shows.entryCloseDate` with timezone | Complete | -- |
| ✅ | 2.2 Entry Process | Online vs postal entry support | `shows.acceptsPostalEntries` boolean; `shows.postalCloseDate` | Complete | -- |
| ✅ | 2.2 Entry Process | Separate entry per exhibitor | `entries` table with `exhibitorId` per entry | Complete | -- |
| ❌ | 2.2 Entry Process | Joint ownership / partnership entries | `dogOwners` table exists but no validation for member status at time of entry for joint-owned dogs | Add joint ownership entry validation for limited shows (all partners must be members) | P3 |
| ❌ | 2.2 Entry Process | Judge conflict check (12-month rule) | No validation against judge-dog relationship history | Add validation: warn/block if entered dog was owned/handled/boarded/prepared by judge in prior 12 months | P2 |
| ❌ | 2.2 Entry Process | Judge-bred dog check | No breeder-judge conflict validation | Add validation: warn/block if judge bred the entered dog | P2 |
| ✅ | 2.2 Entry Process | Payment in advance | Stripe integration; `orders` with payment intent; `payments` table | Complete | -- |
| ❌ | 2.2 Entry Process | Entry extensions (14 days before show) | No mechanism to reopen entries with RKC notification | Add "extend entries" feature with audit trail | P3 |
| ➖ | 2.2 Entry Process | Lost-in-post claims | Only relevant to postal entries | Not applicable for online platform | -- |
| ➖ | 2.2 Entry Process | Entry fee refunds | RKC doesn't regulate; society's discretion | Remi has refund capability via Stripe | -- |
| ❌ | 2.2 Entry Process | Win counting / date for estimating awards won (7th day before closing) | No win history tracking for eligibility validation | Would need integration with RKC records or manual entry of win history | P3 |
| ✅ | 2.3 NFC | NFC entry type | `entries.isNfc` boolean; separate NFC fee | Complete | -- |
| ✅ | 2.3 NFC | NFC policy in schedule | `scheduleData.acceptsNfc` controls whether NFC shown in schedule | Complete | -- |
| ✅ | 2.4 Withdrawal | Entry withdrawal | `entryStatusEnum` has 'withdrawn'; `entryAuditActionEnum` has 'withdrawn' and 'reinstated' | Complete | -- |
| ⚠️ | 2.4 Withdrawal | Withdrawal reasons (judge change, illness, etc.) | Audit log tracks action but not specific withdrawal reasons | Add withdrawal reason field to audit log | P3 |
| ✅ | 2.4 Withdrawal | Absent marking | `entries.absent` boolean | Complete | -- |
| ❌ | 2.5 Transfer | Class transfer for ineligible entries | No class transfer mechanism | Add ability to transfer entry between classes (wrong age/sex/breed to equivalent or Open) | P2 |

---

## 3. PRE-SHOW

| Status | Category | Regulation | What Remi Has | What's Needed | Priority |
|--------|----------|-----------|---------------|---------------|----------|
| ✅ | 3.1 Schedule | Schedule generation | Schedule PDF generation; `shows.scheduleUrl`; `scheduleData` JSONB with comprehensive fields | Complete | -- |
| ✅ | 3.1 Schedule | Front cover: society name, type, venue, date | Show name, type, venue, dates all stored | Complete | -- |
| ✅ | 3.1 Schedule | Secretary contact info | `shows.secretaryName`, `secretaryEmail`, `secretaryAddress`, `secretaryPhone` | Complete | -- |
| ✅ | 3.1 Schedule | Group system flag | `scheduleData.judgedOnGroupSystem` | Complete | -- |
| ✅ | 3.1 Schedule | Docking statement | `scheduleData.country` determines appropriate docking statement | Complete | -- |
| ✅ | 3.1 Schedule | Wet weather statement | `scheduleData.wetWeatherAccommodation` | Complete | -- |
| ✅ | 3.1 Schedule | Entry form wording (RKC-approved) | Entry form generated digitally | Complete (online entry replaces paper form) | -- |
| ✅ | 3.1 Schedule | Judge names per breed | `judgeAssignments` with breed and judge references | Complete | -- |
| ⚠️ | 3.1 Schedule | Class definitions in Annex A order | `classDefinitions.sortOrder` exists; templates follow standard order | Verify sort order exactly matches F(A) Annex A order | P2 |
| ✅ | 3.1 Schedule | Sponsorship/donation with sponsor names | Sponsor system with show-level and class-level assignments | Complete | -- |
| ✅ | 3.1 Schedule | Closing date, fees, prize money | `entryCloseDate`, `firstEntryFee`, `subsequentEntryFee`, `nfcEntryFee`; `scheduleData.prizeMoney` | Complete | -- |
| ❌ | 3.1 Schedule | Date for estimating awards won | No dedicated field | Add `awardsEstimateDate` field (7th day before first closing date) | P3 |
| ❌ | 3.1 Schedule | 10-minute group/BIS admission announcement | Not in schedule template | Add to schedule PDF template for championship shows | P3 |
| ✅ | 3.1 Schedule | Show opening time | `shows.showOpenTime` | Complete | -- |
| ✅ | 3.1 Schedule | Latest dog reception time | `scheduleData.latestArrivalTime` | Complete | -- |
| ⚠️ | 3.1 Schedule | Benching removal times | `scheduleData.benchingRemovalTime` exists but may not cover early removal conditions/pass requirements | Extend to include early removal conditions if benched | P3 |
| ❌ | 3.1 Schedule | Show closing statement (half hour after judging) | Not in schedule data | Add to schedule template | P3 |
| ⚠️ | 3.1 Schedule | NFC acceptance statement in schedule | `acceptsNfc` flag exists; verify it appears in generated schedule PDF | Ensure NFC statement appears in PDF output | P2 |
| ⚠️ | 3.1 Schedule | Referee for each breed (championship) | `judgeAssignments` has judge but no separate referee field | Add referee support to judge assignments | P3 |
| ✅ | 3.2 Judge Contracts | Three-part written contract | `judgeContracts` with stages: offer_sent, offer_accepted, confirmed, declined; token-based acceptance flow | Complete | -- |
| ⚠️ | 3.2 Judge Contracts | Contract wording must include JEP compliance confirmation | Contract system exists but specific RKC-mandated wording not verified | Ensure offer email includes required RKC wording re: F(1)20b / JEP compliance | P2 |
| ❌ | 3.2 Judge Contracts | CC judge approval 12 months before show | No tracking of CC approval status/dates | Add CC approval tracking to judge assignments for championship shows | P3 |
| ❌ | 3.2 Judge Contracts | 9-month BIS/BPIS interval rule | No judge appointment interval checking | Add validation: warn if BIS/BPIS judge was appointed within 9 months at another championship show | P3 |
| ✅ | 3.3 Veterinary | On-call vet info | `shows.onCallVet` field | Complete | -- |
| ⚠️ | 3.3 Veterinary | Vet practice name/address/phone in catalogue | `onCallVet` is free text; may not have structured address/phone | Ensure vet details are structured enough for catalogue output | P3 |

---

## 4. SHOW DAY

| Status | Category | Regulation | What Remi Has | What's Needed | Priority |
|--------|----------|-----------|---------------|---------------|----------|
| ⚠️ | 4.1 Documentation | Documents required at show (licence, insurance, regulations, breed standards, schedule, catalogue, entry forms, incident book) | Checklist system can track these; catalogue and schedule generation built in | Pre-populate checklist with all F.9 required documents; ensure all are downloadable | P2 |
| ➖ | 4.2 Welfare | Dog welfare rules (prohibited collars, punitive handling, disease, mating, chalking) | Physical show-day conduct rules | Not applicable -- enforced at venue, not digitally | -- |
| ➖ | 4.3 Exhibition | Leads, gangways, double handling, exhibit identification | Physical ring conduct rules | Not applicable -- enforced at venue | -- |
| ✅ | 4.3 Exhibition | Ring number display | Ring numbers generated as print product; `entries.catalogueNumber` | Complete | -- |
| ➖ | 4.4 Exclusion | Dog exclusion powers and process | Physical show-day process | Not applicable for digital platform | -- |
| ❌ | 4.4 Exclusion | Exclusion reporting to RKC within 7 days | No incident/exclusion reporting module | Add incident reporting feature with RKC submission tracking | P3 |
| ➖ | 4.5 Vet Checks | Breed Watch Category 3 BOB vet checks | Physical vet examination at championship shows | Not applicable for digital platform | -- |
| ⚠️ | 4.5 Vet Checks | Category 3 breed flagging | Breeds table has no Breed Watch category field | Add `breedWatchCategory` (1/2/3) to breeds table; flag BOB winners of Cat 3 breeds | P3 |
| ➖ | 4.6 Free Passes | Exhibitor free passes, partnership passes | Physical ticket/pass management | Not applicable for digital platform | -- |
| ➖ | 4.7 Judging Conduct | Judge by breed standard, penalise exaggeration, impartiality | Physical judging standards | Not applicable -- enforced by RKC, not digitally | -- |
| ❌ | 4.8 Group/BIS Timing | 10-minute admission rule for groups/BIS | No show-day timing system | Could add to live show-day mode in future | P4 |

---

## 5. POST-SHOW

| Status | Category | Regulation | What Remi Has | What's Needed | Priority |
|--------|----------|-----------|---------------|---------------|----------|
| ✅ | 5.1 Catalogue | Catalogue generation | `catalogues` table with format, status, PDF generation; print shop integration | Complete | -- |
| ⚠️ | 5.1 Catalogue | Marked-up catalogue with awards | Results system records placements; catalogue generation exists | Add post-show "marked catalogue" export with all awards/absentees marked | P2 |
| ❌ | 5.1 Catalogue | Championship: submit to RKC within 14 days | No RKC submission workflow | Add RKC submission tracking/reminder to post-show checklist | P2 |
| ❌ | 5.1 Catalogue | Catalogue retention (indefinite for open/limited) | No document retention policy enforcement | Add to checklist; generated PDFs stored permanently in system | P4 |
| ❌ | 5.2 Incidents | Incident book recording | No incident tracking module | Add incident recording feature with timestamp, details, people involved | P2 |
| ❌ | 5.2 Incidents | Biting incident reporting | No specific biting incident workflow | Include as incident type with urgent flag | P3 |
| ❌ | 5.2 Incidents | RKC incident submission within 14 days | No submission tracking | Add RKC submission deadline tracking | P3 |
| ❌ | 5.3 Conduct | Fraudulent/discreditable conduct reporting | No conduct reporting feature | Add conduct report form with RKC submission tracking | P3 |
| ❌ | 5.4 Cancellation | Show cancellation notification to RKC | `showStatusEnum` has 'cancelled' but no RKC notification workflow | Add cancellation form with Regional Support Advisor notification | P3 |
| ➖ | 5.5 Abandonment | Show abandonment process | Emergency physical decision | Not applicable for digital platform | -- |

---

## 6. DOCUMENTS

| Status | Category | Regulation | What Remi Has | What's Needed | Priority |
|--------|----------|-----------|---------------|---------------|----------|
| ✅ | 6.1 Schedule | Schedule PDF generation with required content | Built and functional; schedule data model covers most required fields | See Section 3.1 gaps for specific missing items | -- |
| ✅ | 6.2 Catalogue | Catalogue front cover (society, type, secretary, group system, wet weather) | Catalogue generation exists with show data | Complete | -- |
| ⚠️ | 6.2 Catalogue | Championship catalogue: breeds with CCs, judge/referee per breed, alphabetical exhibitor index | Catalogue generated but may not include all championship-specific requirements | Verify catalogue PDF includes: CC breeds flagged, referee, alphabetical exhibitor index with full entry particulars | P1 |
| ⚠️ | 6.2 Catalogue | Exhibitor names/addresses in catalogue | Users have name, address, postcode; `entries` link to exhibitors | Ensure catalogue output includes exhibitor addresses (unless withheld) per RKC requirement | P2 |
| ❌ | 6.2 Catalogue | Vet practice details in catalogue (if no vet present) | `shows.onCallVet` exists but not guaranteed to be in catalogue PDF | Add vet details to catalogue PDF template | P3 |
| ❌ | 6.2 Catalogue | Supported Entry Open Show statement in catalogue | No supported entry tracking | Add supported entry flag and breed club name to show/class config | P4 |
| ❌ | 6.3 Critiques | Judge critique writing for first 2 placings per breed class | No critique system | Add critique text entry for judges (per placement); link to RKC Critique Website or export | P3 |
| ⚠️ | 6.3 Critiques | Critique text field exists on results | `results.critiqueText` field exists | Field exists but no dedicated UI flow for judges to write and submit critiques | P3 |
| ⚠️ | 6.4 Marked Catalogues | Post-show marked catalogue with awards and absentees | Results system tracks placements; `entries.absent` tracks absentees | Need export feature: generate marked-up catalogue PDF showing all awards and absences | P2 |
| ❌ | 6.4 Marked Catalogues | Absentee report for championship shows | `entries.absent` field exists | Generate absentee report document from absent entries | P2 |
| ❌ | 6.4 Marked Catalogues | Additional fee form (championship) | No additional fee tracking | Add to post-show document generation | P3 |
| ✅ | 6.4 Marked Catalogues | Entry form retention (12 months) | Digital entries stored permanently in DB | Complete -- digital entries retained indefinitely | -- |
| ❌ | 6.5 Certificates | Best of Sex / Reserve Best of Sex certificates (2024) | Results system has `specialAward` but no certificate generation | Add certificate generation for BOS/RBOS with judge signature placeholder | P3 |
| ✅ | 6.5 Certificates | Results approval by judge | `judgeAssignments` has `approvalToken`, `approvalStatus`, `approvedAt` flow | Complete | -- |

---

## 7. PEOPLE

| Status | Category | Regulation | What Remi Has | What's Needed | Priority |
|--------|----------|-----------|---------------|---------------|----------|
| ⚠️ | 7.1 Judges | Judge data model | `judges` table with name, kcNumber, contactEmail | Missing: JEP level, qualification history, breeds approved for | P2 |
| ❌ | 7.1 Judges | JEP level tracking (Levels 1-6) | No JEP level field on judges | Add `jepLevel` integer field and `approvedBreeds` relation to judges | P2 |
| ❌ | 7.1 Judges | Judge qualification validation | No validation of judge qualifications against show type/class count | Add validation: Level 1 can only judge up to 3 classes (4 with puppy) at open/limited; Level 2+ for unlimited | P2 |
| ❌ | 7.1 Judges | Hands-on experience tiers | No breed-tier tracking | Future feature -- would need breed popularity data | P4 |
| ❌ | 7.2 Judge Appointments | 2026 simplified judge qualification rules | No validation against JEP level or CC approval status | Implement: championship non-CC requires Level 2+ or CC-approved; open/limited 3+ classes requires Level 2+ | P2 |
| ❌ | 7.2 Judge Appointments | Overseas judge requirements | No overseas judge tracking | Add overseas flag and ATC/qualification verification | P4 |
| ❌ | 7.3 Judge Restrictions | Cannot exhibit at shows where officiating | No validation preventing judge from entering as exhibitor at their own shows | Add cross-check: block judge from entering shows they're judging | P2 |
| ❌ | 7.3 Judge Restrictions | 12-month ownership/handling rule | No historical relationship tracking | Would need relationship history data -- complex to implement | P3 |
| ❌ | 7.3 Judge Restrictions | Cannot judge dog they bred | No breeder-judge cross-check | Add validation using `dogs.breederName` against judge name | P2 |
| ✅ | 7.3 Judge Restrictions | 2026: Partnership show restriction REMOVED | No partnership show restriction exists | Correctly absent (regulation removed) | -- |
| ➖ | 7.4 Traditional Route | Questionnaire route ending (Dec 2025 last nominations) | External RKC process | Not applicable | -- |
| ✅ | 7.5 Stewards | Steward assignment system | `stewardAssignments` table with show, user, ring links; `stewardBreedAssignments` for breed-level | Complete | -- |
| ❌ | 7.5 Stewards | Steward JEP credit tracking (full day requirement, 2/12 day counts) | No stewarding day tracking | Add stewarding day counter for JEP compliance | P4 |
| ✅ | 7.6 Veterinary | Vet details | `shows.onCallVet` | Complete | -- |
| ✅ | 7.7 Officers | Show officers and committee | `scheduleData.officers` and `scheduleData.guarantors` | Complete (stored as JSONB) | -- |
| ➖ | 7.8 Scottish KC | Scotland delegation rules | External RKC/SKC process | Not applicable | -- |

---

## 8. FINANCIAL

| Status | Category | Regulation | What Remi Has | What's Needed | Priority |
|--------|----------|-----------|---------------|---------------|----------|
| ➖ | 8.1 Licence Fees | Show licence fees (GBP 45 open/premier) | External RKC payment | Not applicable | -- |
| ➖ | 8.2 Society Fees | Registration/MOT fees | External RKC payment | Not applicable | -- |
| ✅ | 8.3 Entry Fees | Entry fee configuration | `shows.firstEntryFee`, `subsequentEntryFee`, `nfcEntryFee`; per-class fees via `showClasses.entryFee` | Complete | -- |
| ✅ | 8.3 Entry Fees | Payment in advance | Stripe integration with orders and payment intents | Complete | -- |
| ⚠️ | 8.4 Awards | Minimum 4 awards per class | `KC_PLACEMENTS` has 7 placement types (1st through Commended) | No enforcement that minimum 4 are configured per class; Remi allows any number of placements | P3 |
| ✅ | 8.4 Awards | Printed awards (prize cards) | Print shop has prize card product with specs and ordering | Complete | -- |
| ❌ | 8.5 Breeders Competition | Breeders' competition at general/group championship shows | No breeders' competition class type | Add breeders' competition class and reimbursement tracking | P4 |
| ❌ | 8.6 Special Beginners | Special Beginners class with RKC reimbursement | Class template has 'Special Beginners' in companion template but not in championship/open templates | Add Special Beginners to championship/open templates; add reimbursement tracking | P3 |
| ➖ | 8.7 Penalties | Fines and disqualification | External RKC enforcement | Not applicable | -- |

---

## 9. CLASSES

| Status | Category | Regulation | What Remi Has | What's Needed | Priority |
|--------|----------|-----------|---------------|---------------|----------|
| ✅ | 9.1 Age Classes | Baby Puppy (4-6 months, breed club only) | Not in default templates but `classDefinitions` can define it with `minAgeMonths`/`maxAgeMonths` | Can be added manually; consider adding to breed club template | P3 |
| ✅ | 9.1 Age Classes | Minor Puppy (6-9 months) | In championship_standard and all GSD templates | Complete | -- |
| ✅ | 9.1 Age Classes | Puppy (6-12 months) | In all templates | Complete | -- |
| ✅ | 9.1 Age Classes | Junior (6-18 months) | In all templates | Complete | -- |
| ✅ | 9.1 Age Classes | Yearling (12-24 months) | In championship_standard and GSD templates | Complete | -- |
| ✅ | 9.1 Age Classes | Veteran (7+ years) | In all templates | Complete | -- |
| ❌ | 9.1 Age Classes | Special Minor Puppy, Special Puppy, Special Junior, Special Yearling (restricted by colour/sex/weight/height) | Not in templates; no restriction mechanism | Add "Special" variants to class definition system with configurable restrictions | P3 |
| ✅ | 9.1 Win Classes | Novice | In open_standard template | Complete | -- |
| ✅ | 9.1 Win Classes | Undergraduate | In GSD templates | Complete | -- |
| ✅ | 9.1 Win Classes | Graduate | In championship_standard template | Complete | -- |
| ✅ | 9.1 Win Classes | Post Graduate | In multiple templates | Complete | -- |
| ✅ | 9.1 Win Classes | Mid Limit | In GSD templates | Complete | -- |
| ✅ | 9.1 Win Classes | Limit | In multiple templates | Complete | -- |
| ✅ | 9.1 Win Classes | Open | In all templates | Complete | -- |
| ❌ | 9.1 Win Classes | Minor Limit | Not in any template | Add Minor Limit class definition | P3 |
| ❌ | 9.1 Win Classes | Win-based eligibility enforcement | `classDefinitions.maxWins` exists but no actual win history checking at entry time | Would need win history data to validate class eligibility | P3 |
| ⚠️ | 9.1 Win Classes | Maiden class | In championship_standard but definition needs verification against F(A) | Verify Maiden definition matches RKC: "not won a first prize" | P3 |
| ❌ | 9.1 Important Notes | Awards estimation date (7th day before first closing) | No automatic calculation | Calculate and display on show setup; use for entry validation | P3 |
| ❌ | 9.1 Important Notes | Variety class wins don't count for breed classes | No win tracking system | Informational -- add to class descriptions | P4 |
| ❌ | 9.2 Special Classes | Brace, Team, Stud Dog, Brood Bitch (stakes classes) | No stakes class type in `classTypeEnum` | Add 'stakes' to `classTypeEnum`; add class definitions for these | P3 |
| ❌ | 9.2 Special Classes | Sweepstake classes (restricted to specific class types) | No sweepstake support | Add sweepstake class type with eligibility restrictions | P4 |
| ✅ | 9.2 Special Classes | Junior Handling classes | `entryTypeEnum` has 'junior_handler'; `juniorHandlerDetails` table; YKC and JHA templates | Complete | -- |
| ❌ | 9.2 Special Classes | Baby Puppy class (4-6 months, breed club shows only, no progression) | Can create class definition but no "no progression" enforcement | Add `noProgression` flag to class definitions; restrict to breed club shows | P3 |
| ❌ | 9.2 Special Classes | Special Beginners class (owner/handler/exhibit not won CC/RCC) | In companion template but not championship/open; no eligibility checking | Add to more templates; add eligibility validation | P3 |
| ⚠️ | 9.3 Class Counts | Minimum class requirements per show configuration | No validation of minimum class counts | Add validation: 12 min for single breed, 16 for multi-breed, 8 per CC breed, etc. | P2 |
| ⚠️ | 9.3 Class Counts | CC breeds must include Open + Limit for each sex | `classSexArrangementEnum` has 'separate_sex'; class templates include Open and Limit | Add validation: when CCs offered, ensure Open + Limit exist for both Dog and Bitch | P1 |
| ❌ | 9.3 Class Counts | General canine limited show max 100 classes | No class count limit enforcement | Add validation for limited show 100-class maximum | P3 |
| ❌ | 9.4 Supported Entry | Supported Entry Open Show designation | No supported entry tracking | Add `isSupportedEntry` flag with breed club reference | P4 |
| ❌ | 9.5 SACs | Special Award Classes (3 per sex, separate judges, breed club only) | No SAC support | Add SAC class type with specific rules | P4 |
| ❌ | 9.6 AV Classes | AVNSC and AV Imported Breed Register classes | No AVNSC/AV IBR class types | Add AV class types; enforce group system requirements | P3 |
| ✅ | 9.7 Class Ordering | Sex grouping first (Dog then Bitch), then age before achievement | `showClasses.sortOrder` with `classSexArrangement`; documented convention | Complete | -- |

---

## 10. BREEDS

| Status | Category | Regulation | What Remi Has | What's Needed | Priority |
|--------|----------|-----------|---------------|---------------|----------|
| ✅ | 10.1 Breed Groups | 7 breed groups | `breedGroups` table with sortOrder | Complete | -- |
| ✅ | 10.1 Breed Groups | Breeds linked to groups | `breeds` table with `groupId` FK to `breedGroups` | Complete | -- |
| ⚠️ | 10.1 Breed Groups | 217 recognised breeds | `breeds` table exists but breed count not verified | Verify all 217 RKC breeds are seeded | P2 |
| ✅ | 10.2 Registration | RKC registration number | `dogs.kcRegNumber` | Complete | -- |
| ❌ | 10.2 Registration | NAF/TAF/CNAF status | No pending registration status field | Add `registrationStatus` enum (registered/naf/taf/cnaf) to dogs | P2 |
| ❌ | 10.2 Registration | Authority to Compete (ATC) for imported dogs | No ATC field | Add `atcNumber` to dogs | P3 |
| ❌ | 10.3 Breed Watch | Breed Watch categories (1/2/3) per breed | No Breed Watch field on breeds table | Add `breedWatchCategory` integer (1/2/3) to breeds | P3 |
| ❌ | 10.3 Breed Watch | Category 3 BOB vet check requirement flagging | No Category 3 flagging | Add flag/alert when BOB is recorded for a Category 3 breed | P3 |
| ❌ | 10.4 Stud Book | Stud book bands (A-E) per breed | No stud book band data | Add `studBookBand` (a/b/c/d/e) to breeds; use for qualifying placement identification | P3 |
| ❌ | 10.4 Stud Book | Stud book number qualification from placements | No automatic stud book qualification tracking | Add stud book qualification logic based on band and placement | P4 |
| ❌ | 10.5 Rare Breeds | Rare breed elevation stages | No rare breed stage tracking | Add to breed metadata | P4 |

---

## 11. AWARDS & CERTIFICATES

| Status | Category | Regulation | What Remi Has | What's Needed | Priority |
|--------|----------|-----------|---------------|---------------|----------|
| ✅ | 11.1 CCs | Challenge Certificate tracking | `achievementTypeEnum` has cc, dog_cc, bitch_cc, reserve_cc, reserve_dog_cc, reserve_bitch_cc | Complete | -- |
| ❌ | 11.1 CCs | Champion title confirmation (3 CCs under 3 different judges, 1 after 12 months) | Achievements tracked but no Champion title calculation | Add automatic Champion title detection: count distinct judges, verify age requirement | P3 |
| 🔄 | 11.2 RCCs | 5 RCCs (different judges) = limited show ineligibility (2026) | RCCs tracked in achievements but no 5-RCC rule enforcement | Add validation: count RCCs under different judges; flag for limited show ineligibility | P2 |
| ✅ | 11.3 BOB | Best of Breed | `achievementTypeEnum` has `best_of_breed`; `SPECIAL_AWARDS` includes 'Best of Breed' | Complete | -- |
| ✅ | 11.3 BOB | Best Opposite Sex | `SPECIAL_AWARDS` includes 'Best Opposite Sex' | Complete | -- |
| ❌ | 11.3 BOB | BOB must be from first prize winners in breed classes | No validation that BOB candidate won a first prize | Add validation: BOB candidates must have a 1st place in breed class | P2 |
| ❌ | 11.3 BOB | Where separate sex classes: Best Dog and Best Bitch must be declared | No enforcement of Best Dog/Best Bitch before BOB | Add workflow: record Best Dog, Best Bitch, then BOB from those | P2 |
| ❌ | 11.4 Junior Warrant | JW point tracking (25 points, 6-18 months, min splits) | No JW point calculation system | Add JW point tracking: 3pts per CC championship BOB, 1pt per open show BIS/RBIS/BPIS; 25 total needed | P3 |
| ❌ | 11.5 ShCEx | Show Certificate of Excellence point tracking | No ShCEx system | Add ShCEx point tracking (50 pts from open shows, 5 from groups) | P4 |
| ❌ | 11.6 VW | Veteran Warrant point tracking | No VW system | Add VW tracking (25 pts from AV veteran classes at open shows) | P4 |
| ✅ | 11.7 Competition Structure | Breed > Group > BIS hierarchy | Results system with class placements and special awards; achievement types cover full hierarchy | Complete | -- |
| ⚠️ | 11.7 Competition Structure | Group competition (BOB winners compete by group) | Achievement types exist (group_placement) but no structured group competition workflow | Add group competition flow: collect BOB winners, record group 1st-4th, then BIS | P2 |
| 🔄 | 11.8 Best Veteran | Best Veteran in Breed/Group/Show (NEW 2026) | `achievementTypeEnum` has `best_veteran_in_breed` | Missing: Best Veteran in Group, Best Veteran in Show achievement types; no competition workflow | P2 |
| ❌ | 11.8 Best Veteran | Best Veteran competition structure (Breed > Group > Show) | No structured veteran competition workflow | Add best_veteran_in_group and best_veteran_in_show to achievement types; add competition flow | P2 |
| ❌ | 11.9 Crufts | Crufts qualification tracking | No Crufts qualification system | Add Crufts qualification checking based on results and achievements | P4 |
| ❌ | 11.9 Crufts | Crufts restrictions (docked dogs, cropped ears, RFG for certain breeds) | No Crufts-specific restriction tracking | Future feature -- only relevant if supporting Crufts entries | P4 |

---

## 12. 2025 REGULATION AMENDMENTS

| Status | Category | Regulation | What Remi Has | What's Needed | Priority |
|--------|----------|-----------|---------------|---------------|----------|
| ➖ | 12 | BIS scheduling flexibility (may follow BPIS/BVIS) | Show-day scheduling is manual | Not applicable | -- |
| ❌ | 12 | 9-month BPIS appointment interval | No interval checking | Add validation in judge appointment workflow | P3 |
| ⚠️ | 12 | Undergraduate class clarification (excepted classes listed) | Class definitions exist but exception list not explicitly coded | Verify Undergraduate eligibility rules match 2025 clarification | P3 |
| ➖ | 12 | Appeals deadline 14 days | External RKC process | Not applicable | -- |
| ❌ | 12 | Handler contact details available on request | Users have address/phone but no entry-level handler contact enforcement | Ensure handler contact details captured during entry process | P3 |
| ➖ | 12 | Licence application 12 months before | External RKC process | Not applicable | -- |

---

## 13. 2026 REGULATION AMENDMENTS

| Status | Category | Regulation | What Remi Has | What's Needed | Priority |
|--------|----------|-----------|---------------|---------------|----------|
| 🔄 | 13 | NFC age lowered to 12 weeks | NFC supported but no age validation | Add 12-week minimum age validation for NFC entries | P2 |
| 🔄 | 13 | 5 RCC rule for limited show ineligibility | No RCC-based eligibility checking | Implement 5-RCC rule for limited show entry validation | P2 |
| ➖ | 13 | Match regulations rewrite | No match support | Low priority -- matches are informal club events | P4 |
| ✅ | 13 | Benching now optional | `scheduleData.isBenched` is already optional (boolean flag) | Complete -- already treats benching as optional | -- |
| ✅ | 13 | Partnership show judge restrictions REMOVED | No partnership restriction in codebase | Correctly absent | -- |
| 🔄 | 13 | Best Veteran in Show (new regulation) | `best_veteran_in_breed` achievement exists | Add best_veteran_in_group and best_veteran_in_show; add competition workflow | P2 |
| 🔄 | 13 | Judge qualification streamlined (JEP level or CC-approved) | No JEP validation | Add JEP level field to judges; validate against appointment rules | P2 |
| ➖ | 13 | CC judge approval simplified | External RKC process | Not applicable | -- |

---

## 14. 2024 REGULATION AMENDMENTS (HISTORICAL)

| Status | Category | Regulation | What Remi Has | What's Needed | Priority |
|--------|----------|-----------|---------------|---------------|----------|
| ✅ | 14 | Minimum NFC age lowered to 4 months (now further lowered to 12 weeks in 2026) | NFC supported; age validation needed | See 2026 section -- 12 weeks is current rule | -- |
| ❌ | 14 | Baby Puppy classes introduced (4-6 months, breed club only) | Not in templates; can create manually via class definitions | Add Baby Puppy to breed club template with no-progression flag | P3 |
| ❌ | 14 | BIS/Group/BPIG judge must be JEP Level 4+ | No JEP level validation | Add JEP level check for BIS/Group judge appointments | P2 |
| ⚠️ | 14 | Critique publication via RKC Critique Website | `results.critiqueText` exists | No export/publication mechanism to RKC Critique Website | P3 |
| ❌ | 14 | Group judge cannot judge breed classes in their group | No cross-assignment validation | Add validation: group judge cannot also be assigned breed classes in same group | P2 |
| ✅ | 14 | Certificate signing (Best of Sex / Reserve Best of Sex) | Judge results approval system exists | Complete (approval workflow covers this) | -- |
| ➖ | 14 | Conduct penalties | External RKC enforcement | Not applicable | -- |

---

## 15. 2022 REGULATION AMENDMENTS (HISTORICAL)

| Status | Category | Regulation | What Remi Has | What's Needed | Priority |
|--------|----------|-----------|---------------|---------------|----------|
| ✅ | 15 | Two open shows per year for general canine societies | No enforcement (external RKC process) | Not applicable for Remi | -- |
| ✅ | 15 | CC breeds: Open + Limit for each sex | `classSexArrangementEnum` with 'separate_sex'; templates support sex-split classes | Validation exists conceptually; enforce explicitly | P1 |
| ➖ | 15 | Puppy awards discretionary | Physical judging decision | Not applicable | -- |
| ➖ | 15 | BIS selection restructured | Physical judging flow | Not applicable | -- |
| ❌ | 15 | AV class differentiation (championship/open vs limited) | No AV class system | Add AV class requirements by show type | P3 |
| ❌ | 15 | Sweepstake class restrictions | No sweepstake support | Add sweepstake class type with eligibility rules | P4 |
| ❌ | 15 | Special class prize exemption (wins don't count) | No win counting system | Informational -- add to class descriptions | P4 |

---

## Summary: Priority Distribution

| Priority | Count | Description |
|----------|-------|-------------|
| **P1** | 3 | Blocks real shows: age validation at entry, CC breed Open+Limit per sex enforcement, championship catalogue completeness |
| **P2** | 27 | Important for compliance: judge qualification tracking, 2026 regulation updates, entry eligibility checks, class count validation, marked catalogue export, post-show document generation |
| **P3** | 38 | Nice to have: ATC/docked dogs, incident reporting, critique publishing, JW/VW/ShCEx tracking, special class variants, Breed Watch categories |
| **P4** | 18 | Future/edge case: match shows, partnership shows, Crufts qualification, stud book bands, rare breed tracking |
| **Not applicable** | 26 | Physical venue requirements, external RKC processes, manual show-day conduct |
| **Implemented** | 43 | Working correctly in Remi |

---

## Top 10 Action Items (by impact)

1. **P1: Entry age validation** -- Enforce 4-month exhibition minimum and class-specific age limits at entry time. Without this, shows could accept underage dogs.

2. **P1: CC breed class structure enforcement** -- When CCs are offered, validate that Open + Limit classes exist for both Dog and Bitch. Missing this makes championship shows non-compliant.

3. **P1: Championship catalogue completeness** -- Verify catalogue PDF includes: CC breeds flagged, referee per breed, alphabetical exhibitor index with addresses and full entry details.

4. **P2: Judge JEP level tracking** -- Add JEP level to judges table. This unlocks validation for: judge appointment eligibility, class count limits per level, BIS/Group judge requirements.

5. **P2: 2026 NFC age (12 weeks)** -- Update NFC age validation from 4 months to 12 weeks.

6. **P2: 5 RCC limited show rule (2026)** -- Implement the new rule that 5 RCCs under different judges makes a dog ineligible for limited shows.

7. **P2: Best Veteran in Show (2026)** -- Add missing achievement types (best_veteran_in_group, best_veteran_in_show) and competition workflow.

8. **P2: NAF/TAF/CNAF registration status** -- Add pending registration status to dogs so entries with pending registrations are properly tracked.

9. **P2: Judge conflict validation** -- Warn when an entered dog has a breeder/ownership conflict with the assigned judge (12-month rule, breeder rule).

10. **P2: Post-show marked catalogue and absentee report** -- Generate marked-up catalogue with all awards and absences; generate standalone absentee report for RKC submission.
