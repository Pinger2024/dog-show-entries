# User Journeys & Pain Point Analysis: UK Dog Show Entry Platform

## Executive Summary

This document maps the key user journeys and pain points for a UK dog show entry platform, based on research across community forums (Champdogs, PetForums UK), Kennel Club publications, competitor platform analysis, and industry commentary. The findings reveal significant opportunities to build a modern, user-centric platform that addresses deep frustrations with legacy systems like Fosse Data and Higham Press, while tackling the broader challenge of declining dog show participation.

---

## 1. User Personas

### 1.1 Exhibitor / Handler

**Profile:** Individual who enters their dog(s) in conformation shows. Ranges from complete beginners to seasoned campaigners with multiple dogs across breeds. May be owner-handlers or professional handlers.

**Goals:**
- Find suitable upcoming shows (right level, convenient location, preferred judges)
- Enter dogs in the correct classes quickly and accurately
- Pay entry fees with minimal friction
- Manage entries across multiple shows and multiple dogs
- Track results and show record over time
- Download passes and documentation before show day

**Tech Comfort:** Variable. Ranges from digitally native younger exhibitors to older exhibitors who find website changes distressing ("as I have aged I do not like change!!" - Champdogs forum user on Fosse Data redesign).

**Key Frustration:** "I found it really much more difficult to navigate" and "can't find how to view schedules" (Champdogs forum, re: Fosse Data).

---

### 1.2 Show Secretary

**Profile:** Volunteer (usually unpaid) responsible for all administrative aspects of running a show on behalf of a show society. Handles entries, finances, catalogue production, Kennel Club compliance, and post-show reporting.

**Goals:**
- Set up show schedules with correct classes and judges
- Receive and process entries accurately
- Manage entry amendments, withdrawals, and refunds
- Produce accurate catalogues and judges' books
- Handle finances (fees collected, refunds issued)
- Submit post-show reports to the Kennel Club
- Upload results promptly

**Key Challenge:** "Whether you are running a small club limited show or a general championship show with thousands of dogs attending, there is a huge amount of work and administration to be undertaken" (The Kennel Club).

**Tech Comfort:** Often moderate; many are older volunteers who have used the same systems for years.

---

### 1.3 Show Society / Committee

**Profile:** Registered organisation that runs dog shows under Kennel Club licence. May run one or several shows per year. Range from small breed clubs to large general championship show societies.

**Goals:**
- Secure Kennel Club show licences (must apply 12+ months in advance)
- Appoint judges and plan schedules
- Maximise entries and participation
- Manage society finances and show budgets
- Comply with all Kennel Club regulations
- Grow membership and attract new exhibitors

**Key Challenge:** Declining entries, rising costs, difficulty finding judges, and the burden of regulation compliance.

---

### 1.4 Judge

**Profile:** Kennel Club-approved individual who evaluates dogs against the breed standard. May judge at multiple levels from open shows to championship shows.

**Goals:**
- Access accurate entry information and running orders before/during the show
- Record results and placements efficiently
- Submit critiques post-show (mandatory for championship shows)
- Review the catalogue for breed/class information

**Key Frustration:** Paper-based judge's books that must be filled in manually; reliance on ring stewards for accuracy; post-show critique submission is disjointed (must submit separately to Our Dogs and/or the KC Judges' Critiques website).

---

### 1.5 Ring Steward

**Profile:** Volunteer who assists the judge in the ring on show day. Manages the flow of exhibits, records results, and ensures smooth ring operation.

**Goals:**
- Check in exhibitors as they arrive at the ring
- Call classes in the correct order
- Record all gradings and placings accurately in the steward's catalogue
- Maintain backup records in case of judge's book errors
- Manage ring timing and flow

**Key Frustration:** Entirely paper-based workflow. Must maintain manual marked catalogues as backup documentation. Errors in transcription are common and hard to correct after the fact.

---

## 2. User Journey Maps

### 2.1 Exhibitor: Finding and Entering a Show

```
DISCOVER              EVALUATE              ENTER                 PAY                  CONFIRM
   |                     |                    |                    |                     |
   v                     v                    v                    v                     v
Find upcoming      Read schedule,       Select dogs,         Process payment      Receive
shows via          check classes,       choose classes,      (card/cheque)        confirmation
Fosse Data /       identify judge,      fill in entry                             + passes
Higham Press /     check eligibility    form details
KC website /
word of mouth

PAIN POINTS:
- No single           - Schedules are      - Cannot easily      - Some shows        - Passes come
  source of truth       long PDFs            enter multiple       charge MORE         separately
  for all shows         (144 pages for       dogs in one          for online          per dog,
- Must check            Crufts)              transaction          entry (defeats      causing
  multiple           - Class definitions   - Once submitted,      the purpose)        confusion
  websites              are confusing        cannot modify       - No consistent    - Must phone
- No filtering          for newcomers        without phoning      refund policy       Fosse Data
  by location,       - Must cross-          support            - Payment and         to resolve
  breed, or judge       reference KC       - System designed      entry are           any issues
- Shows close           regs to              for single-dog       sometimes
  entries weeks         determine            entries              separate
  in advance            eligibility                               processes
```

#### Detailed Pain Points - Exhibitor Entry Journey:

| Stage | Pain Point | Severity | Source |
|-------|-----------|----------|--------|
| Discovery | No centralised show finder with filtering | HIGH | Multiple forums |
| Discovery | Must visit Fosse Data, Higham Press, KC site, individual society sites separately | HIGH | Petforums, Champdogs |
| Schedule Review | Schedules are enormous PDFs, hard to navigate | MEDIUM | Champdogs forum |
| Schedule Review | Class definitions confusing - "This is what makes me confused: could you please explain WHICH class to enter?" | HIGH | Petforums |
| Schedule Review | KC regulation changes (e.g., 2015, 2024, 2025) make class eligibility rules a moving target | HIGH | KC media, forums |
| Entry | Cannot add dogs to existing entry - must create separate accounts or phone support | CRITICAL | Champdogs forum |
| Entry | No self-service entry modification after submission | CRITICAL | Champdogs forum |
| Entry | Online systems don't validate class eligibility | HIGH | KC statement |
| Payment | Online surcharges (e.g., National Dog Show: GBP 24 online vs GBP 22 postal) | HIGH | Champdogs forum |
| Payment | Inconsistent refund policies across shows | MEDIUM | Petforums |
| Payment | Entry fees rising, discouraging participation | MEDIUM | Multiple sources |
| Confirmation | Separate passes per dog cause anxiety | LOW | Champdogs forum |
| Confirmation | If entry fails, must log out, restart PC, type URL manually | HIGH | Champdogs forum |

---

### 2.2 Exhibitor: Managing Entries Across Shows

```
VIEW ENTERED       AMEND ENTRY          WITHDRAW             TRACK RESULTS
SHOWS
   |                  |                    |                     |
   v                  v                    v                     v
See list of       Change class,        Request               Check results
shows entered     add/remove dogs,     withdrawal,           on Fosse Data
on account        update details       seek refund           or Higham Press

PAIN POINTS:
- No dashboard     - Must phone         - Refund policies    - Results split
  across all         support for any      vary wildly          across Fosse
  entry platforms    amendments           between shows        Data + Higham
- No calendar      - No self-service    - Few shows           Press
  view of            modification         actually refund    - No personal
  upcoming shows   - 37% of entries     - Must produce         results history
- No reminder        are changed or       vet/medical          or win record
  notifications      cancelled            certificate        - Critiques on
                     (PerfDog stat)     - No online            separate KC
                                          withdrawal           website
                                          process
```

---

### 2.3 Show Secretary: Setting Up and Managing a Show

```
PLAN SHOW          CREATE SCHEDULE      OPEN ENTRIES         PROCESS ENTRIES      PRODUCE CATALOGUE
   |                  |                    |                    |                     |
   v                  v                    v                    v                     v
Apply for KC       Define classes,       Set up entry         Receive entries,     Generate
licence (12+       appoint judges,       on Fosse Data        validate details,    catalogue,
months ahead)      set entry fees,       or Higham Press,     handle amendments,   judges' books,
                   determine closing     postal + online      reconcile payments   ring boards
                   dates

PAIN POINTS:
- Licence must     - Manual schedule    - Limited to         - Entries come       - Catalogue
  be applied 12+     creation             Fosse Data or        in via post AND      errors from
  months ahead    - Must conform to       Higham Press         online - two         incorrect
- KC regulations     KC class defs        as providers         streams to           exhibitor
  change yearly    - Judge appointment  - No modern            manage               data
- Heavy admin        rules complex        alternatives       - Manual              - Printing
  burden for      - Partnership show   - Must manually         reconciliation       costs
  volunteers         regulations add      configure all        of payments        - Time pressure
                     complexity           show details       - Amendment            between
                                       - Online and           requests come         entries
                                         postal closing        by phone/email       closing and
                                         dates differ                               show day
                                         (extension
                                         periods)

POST-SHOW:
- Upload results to catalogue printer's website
- Submit reports to Kennel Club
- Reconcile all finances
- Chase judges for critiques
```

---

### 2.4 Show Day: Ring Operations

```
RING SETUP         CHECK-IN             JUDGING              RESULTS
   |                  |                    |                     |
   v                  v                    v                    v
Ring steward       Mark off             Judge evaluates,     Steward records
prepares ring,     exhibitors as        steward calls        placings in book,
has catalogue      they arrive,         classes, manages     results posted
and judges book    note absentees       ring flow            on board

PAIN POINTS:
- Entirely paper-   - Manual check-in   - Paper judge's     - Manual
  based               process             book errors          transcription
- No digital        - No way to know     - No backup if       errors common
  tools for           in advance who       book is lost      - Results take
  ring stewards       will attend        - Steward must        hours/days to
- Heavy reliance  - Late arrivals         maintain parallel    appear online
  on volunteer       cause disruption     paper record       - No live
  accuracy                              - Ring timing          results for
                                          hard to manage       spectators
```

---

## 3. Critical Pain Points: Synthesis

### 3.1 Platform & Technology Pain Points

| # | Pain Point | Impact | Affected Users |
|---|-----------|--------|----------------|
| 1 | **Fragmented ecosystem** - no single platform for finding, entering, and managing shows | HIGH | All exhibitors |
| 2 | **Legacy UX** - Fosse Data website described as slow, confusing, hard to navigate | HIGH | All users |
| 3 | **No multi-dog entry flow** - system designed for single-dog entries; adding dogs requires phone support or separate accounts | CRITICAL | Multi-dog exhibitors |
| 4 | **No self-service amendments** - any change requires phoning support | CRITICAL | All exhibitors |
| 5 | **No mobile optimisation** - websites not designed for mobile use | MEDIUM | Younger exhibitors |
| 6 | **Split results ecosystem** - results across Fosse Data, Higham Press, KC site, Our Dogs | HIGH | All exhibitors |
| 7 | **Paper-based show day** - no digital tools for ring stewards, judges, or check-in | HIGH | Judges, stewards, secretaries |
| 8 | **No real-time validation** - entry systems don't check class eligibility or registration details | HIGH | All exhibitors, secretaries |

### 3.2 Process & Policy Pain Points

| # | Pain Point | Impact | Affected Users |
|---|-----------|--------|----------------|
| 9 | **Class confusion** - exhibitors don't understand which classes their dog is eligible for | HIGH | New exhibitors especially |
| 10 | **Online entry surcharges** - some shows charge MORE for online entry, perversely discouraging digital adoption | HIGH | All exhibitors |
| 11 | **No refund standardisation** - policies vary wildly between shows | MEDIUM | All exhibitors |
| 12 | **Long closing periods** - entries close weeks before shows; no late entry option | MEDIUM | All exhibitors |
| 13 | **Dual entry streams** - postal and online entries create double handling for secretaries | HIGH | Show secretaries |
| 14 | **37% amendment rate** - over a third of entries need changes, but systems don't support self-service changes | CRITICAL | All users |
| 15 | **Catalogue production bottleneck** - tight timeline between entries closing and catalogue printing | HIGH | Show secretaries |

### 3.3 Industry-Wide Pain Points (Broader Context)

| # | Pain Point | Impact | Affected Users |
|---|-----------|--------|----------------|
| 16 | **Declining entries** - participation falling across the sport | CRITICAL | Entire community |
| 17 | **Rising costs** - entry fees, travel, accommodation all increasing | HIGH | Exhibitors |
| 18 | **Poor judging quality perception** - "Who wants to travel for hours and pay GBP 23 for judging like that?" | HIGH | Exhibitors |
| 19 | **Professional dominance** - amateur/family exhibitors feel squeezed out | MEDIUM | New/amateur exhibitors |
| 20 | **Volunteer burnout** - show secretaries carry enormous unpaid administrative burden | HIGH | Show societies |
| 21 | **New exhibitor retention** - average newcomer stays only 5 years | HIGH | Entire community |
| 22 | **No feedback culture** - exhibitors rarely receive constructive feedback on their dogs | MEDIUM | All exhibitors |

---

## 4. Opportunity Analysis

### 4.1 What Would Make Exhibitors Switch Platforms

Based on community research, the following features represent the strongest pull factors:

1. **Single unified platform** - one place to find ALL shows, enter, pay, and track results
2. **Multi-dog, multi-show entry** - enter multiple dogs in multiple shows in a single transaction
3. **Smart class eligibility** - system that knows your dog's record and suggests/validates eligible classes
4. **Self-service amendments** - change entries, withdraw, swap classes without phoning anyone
5. **No online surcharges** - ideally offer online discounts (as Crufts does)
6. **Mobile-first design** - modern, responsive interface that works on phones
7. **Personal dashboard** - calendar of upcoming shows, entry history, results tracking, win record
8. **Live show day results** - real-time results as judging happens
9. **Digital show day tools** - tablet-based ring steward check-in and results recording
10. **Integrated critiques** - judges can submit critiques through the same platform

### 4.2 What Would Make Show Societies Switch

1. **Reduced admin burden** - automated catalogue generation, financial reconciliation, KC reporting
2. **Single entry stream** - eliminate dual postal/online processing
3. **Real-time entry monitoring** - see entries as they come in, project final numbers
4. **Self-service exhibitor amendments** - reduce phone/email support load
5. **Automated class validation** - catch errors before they reach the catalogue
6. **Integrated financial management** - fees, refunds, reporting in one place
7. **Digital show day** - replace paper judges' books, ring boards, and steward catalogues
8. **Lower costs** - competitive pricing vs. Fosse Data/Higham Press
9. **Post-show automation** - results upload, KC reporting, critique collection

### 4.3 Competitive Gaps to Exploit

| Capability | Fosse Data | Higham Press | Zooza | Opportunity |
|-----------|-----------|-------------|-------|-------------|
| Multi-dog entry flow | Poor | Unknown | Basic | Build seamless multi-dog, multi-show basket |
| Self-service amendments | None (phone only) | Unknown | Basic | Full self-service with audit trail |
| Class eligibility validation | None | None | None | Smart validation against KC rules + dog record |
| Mobile experience | Poor | Poor | Moderate | Mobile-first responsive design |
| Show day digital tools | None | None | None | Ring steward app, digital judge's book |
| Live results | Delayed (hours) | Delayed | None | Real-time as judging completes |
| Unified show finder | Partial (own shows only) | Partial | Partial | All KC-licensed shows in one searchable database |
| Personal results history | None | None | None | Full career record, win tracking, statistics |
| Integrated critiques | None | None | None | Judges write critiques in-platform, linked to results |
| Financial dashboard for societies | Basic | Basic | Basic | Full financial management with reporting |

---

## 5. Recommended Priority Features (MVP)

Based on pain point severity and competitive opportunity:

### Must Have (MVP)
1. Unified show search and discovery with filters (location, breed, level, date, judge)
2. Dog profile management with KC registration details
3. Multi-dog, multi-show entry with basket/checkout
4. Smart class eligibility guidance and validation
5. Self-service entry amendments and withdrawals
6. Secure online payment (no surcharges)
7. Exhibitor dashboard with entry calendar and history
8. Show secretary: show setup, entry processing, catalogue generation
9. Show secretary: financial management and reconciliation
10. Results publishing (post-show)

### Should Have (Phase 2)
11. Digital show day tools (ring steward check-in, results recording)
12. Live results during show
13. Mobile app for show day (exhibitors, stewards, judges)
14. Integrated judge's critique submission
15. Personal results history and career statistics
16. Automated KC reporting
17. Push notifications (entry confirmations, show reminders, results)

### Could Have (Phase 3)
18. Social features (follow handlers, breeds, judges)
19. Community features (breed clubs, forums)
20. AI-powered class recommendations for newcomers
21. Travel/accommodation integration for show weekends
22. Breeding record integration
23. Analytics dashboard for show societies (trends, demographics)

---

## 6. Key Metrics to Track

| Metric | Purpose |
|--------|---------|
| Entry completion rate | Measure friction in entry process |
| Time to complete entry | Benchmark against competitors |
| Amendment rate (self-service vs. support) | Measure self-service adoption |
| Multi-dog entries per transaction | Measure basket effectiveness |
| New exhibitor retention (12-month) | Track newcomer engagement |
| Show secretary setup time | Measure admin burden reduction |
| Results publication time | Measure speed vs. competitors |
| NPS by persona | Track satisfaction across user types |
| Entry errors caught by validation | Measure quality improvement |
| Support ticket volume | Measure self-service success |

---

## Sources

- Champdogs Forum: Online entries discussion, Fosse Data feedback threads
- PetForums UK: Higham Press complaints, class entry questions, refund policy discussions
- The Royal Kennel Club: Show regulation amendments 2024-2025, partnership show changes, entry form guidance
- Fosse Data: Website, FAQ, show entry system
- Higham Press: Website, results service
- Zooza: Platform review (Capterra), event listings
- ShowSight Magazine: Declining entries analysis
- Our Dogs: Judge critique submission process
- KC Judges Critiques website: Critique publishing system
- Canine Chronicle: Industry commentary on exhibitor frustrations
- PerfDog: 37% entry amendment statistic
- Dog News: Show expense analysis
