# Business Plan: UK Dog Show Entry Platform

*February 2026 — Confidential*

---

## 1. Executive Summary

The UK dog show entry market — serving hundreds of Kennel Club-licensed shows, tens of thousands of exhibitors, and processing hundreds of thousands of entries annually — is trapped in the past. The dominant platforms, Fosse Data (founded 1982) and Higham Press (founded 1945), are printing companies that bolted on digital entry as an afterthought. Their systems run on deprecated technology (ASP.NET WebForms from 2002, legacy PHP), deliver poor mobile experiences, and force exhibitors to maintain accounts across multiple fragmented platforms. No competitor offers self-service entry amendments, real-time class eligibility validation, multi-dog entry workflows, or any digital show-day experience. Over a third of all entries require changes after submission, yet every amendment requires a phone call.

We are building the first purpose-built, mobile-first dog show entry and management platform for the UK market. By combining modern technology (Next.js, PostgreSQL, Stripe Connect, real-time WebSockets) with deep domain expertise, we will deliver an experience that is 10x better than every incumbent across every dimension: discovery, entry, payment, amendment, show day operations, and results. Our platform serves both sides of the market — exhibitors who enter shows and the show societies who organise them — creating a powerful two-sided network effect that deepens with every show processed.

The opportunity is to become the operating system for UK dog showing: the single platform where every show is discovered, every entry is made, every result is published, and every dog's career is tracked. With a clear path from open shows to championship shows to Crufts itself, and an architecture that supports international expansion to other Kennel Club-affiliated countries, this is a platform business with compounding competitive advantages and a market that has been waiting decades for modernisation.

---

## 2. Market Analysis

### 2.1 Market Size and Structure

The UK pedigree dog show market is the country's most popular organised canine activity, governed by The Kennel Club (founded 1873). The market comprises:

| Segment | Estimated Scale |
|---------|----------------|
| **Championship shows** | ~30 general + hundreds of breed-specific per year |
| **Open shows** | Hundreds annually across breed clubs and general societies |
| **Limited shows** | Hundreds annually (restricted to society members) |
| **Premier Open shows** | Growing category (Crufts qualification route) |
| **Total KC-licensed shows** | Estimated 2,000-3,000+ annually across all types |
| **Active exhibitors** | Estimated 30,000-50,000 regular participants |
| **Crufts entries** | ~18,700 dogs (2026), 85%+ entering online |
| **Active shows on major platforms** | Fosse Data: 50+; Higham Press: 53+ at any time |

### 2.2 Entry Volume Economics

A typical championship show attracts 3,000-10,000+ entries. With average entry fees of £22-28 per dog (championship) and £4-8 per dog (open shows), plus additional class fees, the total entry fee market is substantial:

| Metric | Conservative Estimate |
|--------|----------------------|
| **Total annual entries (all show types)** | 300,000-500,000+ |
| **Average entry fee per dog** | £10-25 (blended across show types) |
| **Total annual entry fee market** | £5-12 million |
| **Show management services market** | £3-5 million (printing, catalogues, data handling) |
| **Total addressable market** | £8-17 million annually |

### 2.3 Market Dynamics

**Declining but dedicated**: Show entries have been trending downward across the sport, driven by rising costs (entry fees, travel, accommodation), judging quality concerns, and barriers to new exhibitor retention. The average newcomer stays only 5 years. However, the core community is deeply passionate and committed — this is a lifestyle, not a hobby.

**Digital adoption accelerating**: Crufts reports 85%+ of entries now made online via Fosse Data. Online entry is the norm, not the exception. The problem is not digital resistance — it's that the digital experience is terrible.

**Two-sided market**: Show societies need exhibitors; exhibitors need shows. A platform that serves both sides creates powerful lock-in. Fosse Data's dominance stems from its Kennel Club/Crufts relationship — control the entry platform and you control the ecosystem.

**Consolidation opportunity**: The market is fragmented across Fosse Data, Higham Press, Zooza (via printer partnerships), Online Show Entry, Have A Dog Day, and various ad-hoc systems. Exhibitors are desperate for a unified experience.

---

## 3. Competitive Landscape

### 3.1 Competitor Matrix

| Dimension | Fosse Data | Higham Press | Zooza | Our Platform |
|-----------|-----------|-------------|-------|-------------|
| **Founded** | 1982 | 1945 | ~2018 | 2026 |
| **Core DNA** | Print company + digital | Print company + digital | Digital-first SaaS (US) | Digital-first, UK-native |
| **Tech stack** | ASP.NET WebForms (deprecated) | Mixed legacy | Modern (React/JS) | Next.js 15, PostgreSQL, Stripe |
| **Mobile experience** | Poor | Below average | Average | Mobile-first PWA |
| **Multi-dog entry** | Poor (phone for changes) | Unknown | Basic | Seamless basket/checkout |
| **Self-service amendments** | None (phone only) | None | Basic | Full self-service |
| **Class eligibility validation** | None | None | None | AI-assisted rules engine |
| **Show day tools** | None | None | None | Full digital ring operations |
| **Live results** | Delayed (hours) | Delayed (days) | None | Real-time (seconds) |
| **Career tracking** | None | None | None | Full CC/qualification tracker |
| **KC partnership** | Yes (Crufts) | No | No | Target Phase 2-3 |
| **Payment gateway** | Netbanx (legacy) | Unknown | Stripe | Stripe Connect |
| **Show volume** | Highest | High | Growing | Start small, grow fast |

### 3.2 Competitor Weaknesses

**Fosse Data** (market leader, ~40% share of championship shows):
- Technology is 20+ years old and showing it — exhibitors report crashes, browser compatibility issues, inability to add dogs to existing entries, and poor navigation
- "Fosse Data makes the most mistakes and leaves classes out" (exhibitor forum)
- Cannot easily modify entries after submission — must phone support
- Moat is the Kennel Club/Crufts relationship, not product quality
- Website redesign made navigation worse: "I found it really much more difficult to navigate"

**Higham Press** (strong in championship shows):
- "Higham Press are SO slow!" — results posting far behind Fosse Data
- Charges a £2 online surcharge after postal closing date, perversely penalising digital users
- Core business remains printing — digital is secondary
- 80-year-old brand with deep society relationships but minimal innovation

**Zooza** (digital challenger):
- US-based company with limited UK market understanding
- Growing via printer partnerships (Arena Print, MBJ Print) but no direct KC relationship
- Strongest technology of the incumbents but still not mobile-first
- Small UK show catalogue — primarily open shows and breed clubs

### 3.3 Adjacent Platforms (Not Direct Competitors)

- **Dog Show Central UK** (£24/year subscription for show discovery) — validates demand for a unified show finder
- **My Dog Shows** (show tracking tool) — currently returning 503 errors, highlighting reliability issues
- **The Kennel Club "Find a Show"** — official directory, links out to entry platforms, does not process entries

---

## 4. Our Unique Value Proposition

**We are building the Ticketmaster + Strava + Square of dog showing.**

Our platform is 10x better than every competitor across five dimensions:

### 4.1 One Platform, Every Show
For the first time, exhibitors will have a single account, a single dashboard, and a single place to find, enter, pay for, amend, and track results across ALL KC-licensed shows — regardless of which printer or society organises them. No more juggling Fosse Data, Higham Press, and three other websites. One login. One dog profile. One payment method. Done.

### 4.2 Intelligent Entry — Class Eligibility Engine
No competitor validates class eligibility. Getting it wrong means disqualification and fines of £50-300. Our rules engine cross-references the dog's age, achievement history, and current KC regulations to show exactly which classes are eligible — and recommends the optimal entry strategy. This alone is worth switching for, especially for newcomers who report class confusion as their #1 pain point: *"Could you please explain WHICH class to enter?"*

### 4.3 Self-Service Everything
Over 37% of entries need changes after submission. On every existing platform, that means a phone call. On ours, exhibitors can add dogs, change classes, withdraw entries, and request refunds entirely self-service, with real-time fee adjustments processed automatically through Stripe. This eliminates the single biggest source of friction for exhibitors and the single biggest support burden for show secretaries.

### 4.4 Digital Show Day
No competitor offers ANY digital show-day experience. Ring stewards use paper. Judges use paper. Results take hours or days to appear online. Our real-time Show Day Engine transforms this with tablet-based ring operations, digital check-in, instant result recording, and live results streaming to every exhibitor's phone. *"Your class in Ring 3 is up in 15 minutes"* — push-notified to your pocket.

### 4.5 Dog Career Intelligence
No platform tracks a dog's full show career. We build the complete picture: CC progress (2 of 3 needed for Show Champion), Crufts qualification status, Junior Warrant points, win rates by class and judge, and a visual career timeline. For serious exhibitors, this transforms how they plan their campaign. For newcomers, it makes the opaque world of qualification transparent and achievable.

---

## 5. Product Vision

### 5.1 MVP — Foundation (Months 1-3)

*Goal: A compelling entry platform that early-adopter societies and exhibitors will switch to.*

| Feature | Pain Point Addressed |
|---------|---------------------|
| **Unified show search and discovery** with filters (location, breed, level, date, judge) | No single source of truth for all shows |
| **Dog profile management** with KC registration details saved once | Re-entering dog details for every show |
| **Single-dog entry flow**: select show → select dog → choose classes → pay | Complex, fragmented entry process |
| **Stripe payment** with Apple Pay / Google Pay | Legacy payment gateways, no mobile wallets |
| **Exhibitor dashboard** with entry calendar and history | No way to see all entries in one place |
| **Show secretary portal**: show setup, view entries, basic financial overview | Manual coordination with printers |
| **Mobile-responsive PWA** with install prompt | Poor mobile experience on all competitors |
| **Email confirmations and pass delivery** | Passes missing from emails, download friction |

### 5.2 Phase 2 — Intelligence (Months 4-6)

*Goal: Smart features that no competitor can match.*

| Feature | Pain Point Addressed |
|---------|---------------------|
| **Class eligibility engine** (rules-based validation + recommendations) | Class confusion, disqualification risk |
| **Self-service entry amendments** and withdrawals | Must phone for any change (37% amendment rate) |
| **Multi-dog, multi-show basket** checkout | Cannot enter multiple dogs in one transaction |
| **Dog career tracking** (results history, CC tracker, Crufts qualification) | No personal results history anywhere |
| **Smart show recommendations** (breed + location + career needs) | Manual discovery across multiple websites |
| **Show secretary financial dashboard** and catalogue data export | Limited financial reporting and reconciliation |
| **Full-text search** for shows, breeds, and dogs | Poor search on all existing platforms |

### 5.3 Phase 3 — Show Day (Months 7-9)

*Goal: Transform the paper-based show day experience.*

| Feature | Pain Point Addressed |
|---------|---------------------|
| **Ring steward PWA** (tablet): digital check-in, class management, result entry | Entirely paper-based, error-prone process |
| **Exhibitor show day view**: personalised schedule, live results, ring status | No live information at shows |
| **Offline capability** (Service Workers, IndexedDB, background sync) | Poor connectivity at show venues |
| **Instant results publication** as judging completes | Results take hours (Fosse) to days (Higham) |
| **Push notifications** for show day events | No real-time alerts |
| **Show secretary live dashboard** (ring progress, check-in rates, financials) | No real-time visibility into show operations |

### 5.4 Phase 4 — Community & Growth (Months 10-12)

*Goal: Build the network effects that create an unassailable position.*

| Feature | Pain Point Addressed |
|---------|---------------------|
| **Social features**: follow handlers, breeds, judges | Isolated, disconnected community |
| **Integrated critique system** for judges | Critiques disjointed (separate KC website, Our Dogs) |
| **Show reviews and ratings** | No feedback loop for show quality |
| **Advanced analytics** for show societies (demographics, trends, forecasting) | Limited data for society decision-making |
| **Photo gallery** per show, breed, and dog | No central photo repository |
| **Public API** for third-party integrations | Closed ecosystems |

---

## 6. Technology Strategy

*For the non-technical reader: here is why our technology choices matter and how they translate into competitive advantage.*

### 6.1 Modern Web Application (Next.js + React)

We build a single web application that works beautifully on phones, tablets, and desktops. Unlike Fosse Data's 2002-era technology or Higham Press's cobbled-together system, our platform uses the same technology stack as Airbnb, Ticketmaster, and the BBC. This means:

- **Fast page loads** — show pages and entry forms load in under a second, not the multi-second waits exhibitors experience today
- **Works on every device** — designed for phones first (where most people browse), scales up to tablets and desktops
- **Search engine friendly** — when someone Googles "dog show near me", our show pages appear in results (critical for attracting newcomers)

### 6.2 Progressive Web App (PWA) — App-Like, No App Store

Rather than building separate iPhone and Android apps (expensive, slow to update, requires download), we build a PWA that looks and feels like a native app but works through the browser. Users can "Add to Home Screen" with a single tap. This is critical because:

- Many exhibitors are older and less likely to download apps — zero friction
- Updates are instant (no App Store approval delays)
- Works offline at show venues with poor signal (essential for show day)
- Push notifications for entry confirmations, show reminders, and live results

### 6.3 Stripe Connect — Payment Split Engine

Stripe Connect is the payment infrastructure that makes our business model work. When an exhibitor pays an entry fee, Stripe automatically splits the payment: the show society receives their entry fee, and our platform retains a service fee. This happens instantly, transparently, and with full financial reporting for both parties. It handles refunds, multi-currency (for international exhibitors), Apple Pay, Google Pay, and is the same system used by Deliveroo, Uber, and Etsy for marketplace payments.

### 6.4 Real-Time Engine — Live Show Day

WebSocket technology enables live, two-way communication between ring stewards recording results and every exhibitor watching on their phone. When a steward taps "1st place" on their tablet, the result appears on the exhibitor's screen within seconds — not hours or days later. This is the same technology that powers live sports scores and stock tickers.

### 6.5 Serverless Architecture — Pay Only for What We Use

Our infrastructure scales automatically. During quiet periods (most of the time), we pay minimal hosting costs (~£50-100/month at launch). On Crufts closing day, when thousands of entries flood in simultaneously, the system automatically scales up to handle the load and scales back down afterwards. No manual intervention, no outages, no overpaying for capacity we don't need.

---

## 7. Revenue Model

### 7.1 Revenue Streams

| Stream | Description | Pricing | Phase |
|--------|------------|---------|-------|
| **Per-entry service fee** | Fee charged on every entry processed through the platform | 50p-£1.00 per entry | MVP |
| **Show society subscription** | Monthly/annual subscription for show management tools | £30-100/month (tiered by show size) | MVP |
| **Premium exhibitor features** | Career tracking, smart recommendations, analytics | £3-5/month or £30-50/year | Phase 2 |
| **Stripe payment margin** | Residual margin on payment processing | Included in per-entry fee | MVP |
| **Catalogue advertising** | Digital catalogue sponsorship and advertising | £50-500 per show | Phase 3 |
| **Data insights** | Anonymised market intelligence for breed clubs, KC, industry | Bespoke pricing | Phase 4 |

### 7.2 Pricing Strategy

**For exhibitors**: The platform is free to use for basic entry. No online surcharges (unlike Higham Press's +£2). The per-entry service fee (50p-£1) is absorbed into the entry fee set by the show society, or charged transparently as a small booking fee (similar to Ticketmaster). Premium features (career tracking, advanced analytics) available via optional subscription.

**For show societies**: Tiered subscription based on show size and features used. Significantly cheaper than Fosse Data/Higham Press's per-dog data charges plus printing fees, because we eliminate printing costs entirely for societies that go digital-only. Societies that still want printed catalogues can export data to any printer.

### 7.3 Revenue Projections

**Conservative scenario** (Year 1-3):

| Metric | Year 1 | Year 2 | Year 3 |
|--------|--------|--------|--------|
| **Shows on platform** | 50 | 200 | 500 |
| **Entries processed** | 20,000 | 100,000 | 300,000 |
| **Avg. entry service fee** | £0.75 | £0.75 | £0.75 |
| **Entry fee revenue** | £15,000 | £75,000 | £225,000 |
| **Society subscriptions** (avg £50/mo) | £15,000 | £72,000 | £180,000 |
| **Premium exhibitor subscriptions** | £0 | £15,000 | £60,000 |
| **Total revenue** | **£30,000** | **£162,000** | **£465,000** |
| **Infrastructure costs** | £6,000 | £24,000 | £60,000 |
| **Gross margin** | 80% | 85% | 87% |

**Optimistic scenario** (faster adoption, championship shows earlier):

| Metric | Year 1 | Year 2 | Year 3 |
|--------|--------|--------|--------|
| **Shows on platform** | 100 | 400 | 1,000 |
| **Entries processed** | 50,000 | 250,000 | 500,000+ |
| **Total revenue** | **£67,500** | **£355,000** | **£850,000+** |

**Break-even analysis**: With a lean team (1-2 developers, minimal marketing spend), break-even is achievable at approximately 100-150 shows and 40,000-60,000 entries annually — reachable by mid-Year 2 in the conservative scenario.

### 7.4 Unit Economics

| Metric | Value |
|--------|-------|
| **Revenue per entry** | £0.75-1.50 (service fee + share of society subscription) |
| **Cost per entry** (infrastructure) | ~£0.02-0.05 (serverless compute + storage + Stripe fees) |
| **Gross margin per entry** | ~95% |
| **Customer acquisition cost (society)** | £100-500 (direct sales + onboarding support) |
| **Lifetime value (society)** | £3,000-10,000+ (multi-year subscription + per-entry fees) |
| **LTV:CAC ratio** | 10-20x |

---

## 8. Go-to-Market Strategy

### 8.1 Phase 1: First 10 Show Societies (Months 1-4)

**Strategy: Direct outreach to progressive open show societies and breed clubs**

Open shows are the ideal beachhead because:
- Lower stakes than championship shows (less KC scrutiny)
- Less locked into Fosse Data/Higham Press contracts
- Smaller, more agile committees willing to try new things
- Often run by digitally-comfortable younger organisers
- Faster decision cycles

**Tactics**:
1. **Identify 30 target societies** — focus on breed clubs and general open show societies in Yorkshire, Midlands, and North West (geographic concentration for in-person support)
2. **Offer free onboarding** for first 10 societies — no subscription fee for 6 months; we only earn the per-entry service fee
3. **White-glove setup** — we configure their shows, import their exhibitor data, and provide phone support throughout their first show
4. **Attend shows in person** — demonstrate the platform to other secretaries and exhibitors at early-adopter shows
5. **Leverage breed club networks** — once one breed club adopts, their members (who attend multiple shows) spread awareness to other clubs

**Key relationships to build**:
- Active breed club secretaries on Champdogs forum
- Printer partnerships (approach Arena Print, MBJ Print — already using Zooza)
- Ringcraft club network (training clubs where new exhibitors start)

### 8.2 Phase 2: First 100 Exhibitors (Months 2-4)

Exhibitors follow shows. Once 10 societies list their shows on our platform, exhibitors must come to us to enter.

**Tactics**:
1. **Frictionless onboarding** — passwordless login (magic link/OTP), guided dog profile setup, import from Fosse Data account if possible
2. **"Enter this show" landing pages** — SEO-optimised pages for each show that rank for "[Show Name] entry" searches
3. **Exhibitor referral** — "Invite a friend" with both parties receiving a small entry fee discount
4. **Champdogs forum presence** — contribute helpful content (class eligibility guides, show calendars), mention platform naturally
5. **Facebook group engagement** — breed-specific Facebook groups are where exhibitors discuss shows; share genuinely useful content

### 8.3 Phase 3: First 1,000 Exhibitors (Months 5-8)

**Tactics**:
1. **Content marketing** — publish the definitive "Guide to UK Dog Show Classes" (SEO play targeting confused newcomers), breed-specific show guides, "Your First Championship Show" guide
2. **Show day demonstrations** — attend championship shows with the platform running on tablets, show exhibitors live results in action
3. **Partnership with The Kennel Club** — approach KC to feature our platform in their "Find a Show" directory; offer faster, more accurate results reporting as value proposition
4. **Our Dogs / Dog World advertising** — targeted ads in the two main breed press publications
5. **Ringcraft club partnerships** — offer free "Introduction to Online Entry" sessions at ringcraft clubs; these are where every new exhibitor starts

### 8.4 Phase 4: Championship Show Breakthrough (Months 9-18)

Championship shows are the prize — higher entry volumes, higher fees, and the prestige that attracts the entire community.

**Strategy**:
1. **Build track record** — by this point we'll have 6-12 months of flawless open show operation as proof
2. **Target progressive championship show societies** — some will be frustrated with Fosse Data's aging UX or Higham Press's slow results
3. **Offer parallel running** — let societies run entries through both our platform and their existing provider for one show to build confidence
4. **Competitive pricing** — undercut Fosse Data/Higham Press on per-entry data charges; we don't have printing overheads
5. **Show day as the differentiator** — live results and digital ring operations are impossible to match for incumbents

### 8.5 Partnership Strategy

| Partner | Value to Us | Value to Them |
|---------|------------|---------------|
| **The Kennel Club** | Legitimacy, data access, show licence information | Better data quality, faster results, modern exhibitor experience |
| **Breed clubs** | Direct access to dedicated exhibitors | Reduced admin, membership management, lower costs |
| **Show printers** (Arena, MBJ, others) | Show society relationships | Modern entry platform to offer clients (replaces Zooza) |
| **Ringcraft clubs** | New exhibitor pipeline | Free training tools, show finder for students |
| **Dog press** (Our Dogs, Dog World) | Audience reach | Digital integration, critique publishing |
| **Vets/health schemes** | RFG certificate integration | Streamlined compliance checking |

---

## 9. Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Kennel Club blocks or opposes the platform** | Low-Medium | High | We don't need KC permission to operate — societies choose their entry provider. Build traction first, approach KC with data showing better accuracy and faster reporting. KC benefits from better data. |
| **Fosse Data's Crufts lock-in prevents championship adoption** | High | Medium | Start with open shows (no Fosse Data dependency). Target championship shows where Fosse Data's UX frustrations are highest. Long-term: compete for Crufts contract when it renews. |
| **Incumbent contractual lock-in** | Medium | Medium | Offer parallel running so societies can trial without cancelling existing provider. Focus on societies at contract renewal points. Some societies have no formal contract with printers. |
| **Slow show society adoption (volunteer committees are conservative)** | High | Medium | White-glove onboarding removes effort. Free trial period removes financial risk. Target younger, progressive committee members. In-person demonstrations at shows. |
| **Older exhibitors resist switching** | Medium | Medium | Passwordless auth (no passwords to remember). Extremely simple UX tested with older users. Phone support during transition. If shows are on our platform, exhibitors must use it. |
| **Technology execution risk** | Low | High | Proven, battle-tested tech stack (Next.js, PostgreSQL, Stripe). No experimental technology. Experienced development team. |
| **Zooza accelerates UK expansion** | Medium | Medium | Zooza is US-based with limited UK domain knowledge. We are UK-native with deep domain expertise. We'll move faster on UK-specific features (KC integration, class eligibility, show day). |
| **Regulatory change (KC rule changes)** | Certain | Low | JSON-configurable eligibility rules updated annually. Admin UI for rule management. Regulation changes are an advantage — we can implement them faster than legacy platforms. |
| **Show venue connectivity (show day features)** | High | Low | Offline-first PWA architecture. All show data pre-cached. Background sync when connection returns. Designed for zero-connectivity operation. |
| **Market decline (fewer shows, fewer entries)** | Medium | Medium | Our platform makes showing more accessible and less frustrating, potentially reversing the decline. Lower costs for societies mean more viable shows. Better newcomer experience improves retention beyond the current 5-year average. |

---

## 10. 12-Month Roadmap

### Q1 (Months 1-3): Foundation

| Milestone | Details |
|-----------|---------|
| **Platform launch (beta)** | Core entry flow live: show discovery, dog profiles, entry + payment |
| **First 5 shows** | Onboard 5 open show societies with white-glove setup |
| **First 100 entries** | Process entries for beta shows, iterate on feedback |
| **Tech delivery** | Next.js app, PostgreSQL schema, Stripe Connect, PWA, email notifications |
| **Team** | 2 developers, 1 founder/BD |

### Q2 (Months 4-6): Intelligence

| Milestone | Details |
|-----------|---------|
| **20+ shows on platform** | Expand beyond initial geographic cluster |
| **1,000+ registered exhibitors** | Organic growth from show listings + content marketing |
| **Class eligibility engine live** | Rules-based validation — our biggest differentiator |
| **Self-service amendments** | End the "phone to change your entry" era |
| **Multi-dog basket** | Enter multiple dogs across multiple shows in one checkout |
| **Approach The Kennel Club** | Present platform with 3-months of data showing accuracy and speed |

### Q3 (Months 7-9): Show Day

| Milestone | Details |
|-----------|---------|
| **50+ shows on platform** | Including first championship show trials |
| **5,000+ registered exhibitors** | Reaching critical mass for network effects |
| **Show Day Engine live** | Ring steward tablet app, live results, exhibitor notifications |
| **First live show day** | Pilot digital ring operations at 2-3 shows |
| **Offline PWA** | Full offline capability for show venues |
| **Results within minutes** | Demonstrate to the community what's possible |

### Q4 (Months 10-12): Community & Scale

| Milestone | Details |
|-----------|---------|
| **100+ shows on platform** | Strong open show coverage, growing championship presence |
| **10,000+ registered exhibitors** | Approaching meaningful market penetration |
| **Social features** | Follow, celebrate, critique sharing |
| **Society analytics dashboard** | Entry forecasting, demographic insights, financial projections |
| **KC partnership progress** | Formal discussions about data integration and preferred platform status |
| **Revenue run-rate** | £5,000+/month heading into Year 2 |

---

## 11. Success Metrics & KPIs

### 11.1 Growth Metrics

| Metric | Month 3 Target | Month 6 Target | Month 12 Target |
|--------|----------------|----------------|-----------------|
| Shows on platform | 5 | 20 | 100+ |
| Registered exhibitors | 200 | 1,000 | 10,000+ |
| Entries processed | 500 | 5,000 | 20,000+ |
| Show societies onboarded | 5 | 15 | 50+ |
| Monthly recurring revenue | £500 | £3,000 | £10,000+ |

### 11.2 Product Quality Metrics

| Metric | Target | Competitor Benchmark |
|--------|--------|---------------------|
| Entry completion rate | >85% | Estimated 60-70% on legacy platforms |
| Time to enter (single dog, returning user) | <2 minutes | 5-10 minutes on Fosse Data/Higham Press |
| Mobile traffic share | >60% | <20% on competitors (poor mobile UX) |
| Self-service amendment rate | >80% of all amendments | 0% on competitors (all phone-based) |
| Results publication time | <5 minutes after judging | Hours (Fosse Data), days (Higham Press) |

### 11.3 Satisfaction Metrics

| Metric | Target |
|--------|--------|
| Exhibitor NPS | >40 |
| Show secretary NPS | >50 |
| Support tickets per 100 entries | <5 (vs. estimated 15-20 on legacy platforms) |
| Exhibitor retention (12-month) | >70% |
| Show society renewal rate | >90% |

### 11.4 Business Health Metrics

| Metric | Target (Month 12) |
|--------|-------------------|
| Monthly burn rate | <£5,000 |
| Gross margin | >80% |
| LTV:CAC ratio (societies) | >10x |
| Revenue per entry | £0.75-1.50 |
| Cash runway | 12+ months |

---

## 12. Name & Branding Ideas

The platform name should convey: **modernity**, **trust**, **simplicity**, and the **excitement of the show ring**. It should work for both the traditional championship show community and the next generation of exhibitors.

| Name | Positioning Rationale |
|------|----------------------|
| **ShowRing** | Direct, memorable, instantly understood. "The show ring" is where it all happens — the centre of the action. Modern feel, clean branding. *showring.co.uk* |
| **RingReady** | Action-oriented, conveys preparedness and reliability. Speaks to the exhibitor's feeling of walking into the ring with everything sorted. *ringready.co.uk* |
| **BestInShow** | Aspirational and universally recognised (even by non-dog people via the film). Positions the platform as the best-in-class solution. Risk: may feel presumptuous. *bestinshow.co.uk* |
| **Benched** | Dog show insiders know "benched" — it's where you're assigned at championship shows. Distinctive, memorable, slightly playful. Modern tech branding feel (like "Slack" or "Notion"). *benched.co.uk* |
| **RingCall** | Evokes the moment the steward calls your class — the thrill of the ring. Also suggests communication and connection. *ringcall.co.uk* |
| **StackUp** | Modern, energetic. "Stack" is the term for the show stance. Also implies comparison and competition. Risk: may not resonate with traditionalists. *stackup.co.uk* |
| **Gaiter** | In the show ring, handlers "gait" their dogs (move them for the judge). Distinctive, domain-specific, memorable. Modern one-word brand. *gaiter.co.uk* |
| **ShowEntry** | Descriptive and functional. Instantly communicates what the platform does. Strong SEO potential. Less brand personality but maximum clarity. *showentry.co.uk* |
| **FirstInGroup** | Aspirational outcome every exhibitor wants. Championship show terminology (Group 1st leads to Best in Show). Conveys excellence. *firstingroup.co.uk* |
| **GreenStar** | In some KC contexts, "green star" relates to qualification. Distinctive colour association. Conveys achievement and approval. Risk: meaning not universally known. *greenstar.co.uk* |

**Recommended shortlist**: **ShowRing**, **Benched**, and **RingCall** — these three best balance modern tech branding, domain authenticity, and memorability. ShowRing is the strongest for broad recognition; Benched is the most distinctive and brandable; RingCall has the best emotional resonance.

---

## Appendix: Why Now?

Three forces converge to make 2026 the optimal moment to launch:

1. **Technology maturity**: PWAs now support push notifications on iOS (since 16.4, 2023), Stripe Connect is mature for marketplace payments, and serverless infrastructure eliminates the cost barrier to entry. Building this platform in 2020 would have been 3x harder and more expensive.

2. **Incumbent complacency**: Fosse Data has run on ASP.NET WebForms for 24 years. Higham Press is an 81-year-old printing company. Neither shows any sign of meaningful innovation. The longer they wait, the wider the gap between their offering and modern user expectations.

3. **Community readiness**: The dog show community has fully adopted online entry (85%+ at Crufts). They are not resistant to digital — they are frustrated by bad digital. The demand is proven. The supply is broken.

The question is not whether this market will be disrupted. It is whether we will be the ones to do it.

---

*This business plan was compiled from comprehensive research into the UK dog show domain, competitive landscape, user journeys, pain points, and technology strategy. All market data and competitor analysis sourced from primary research conducted in February 2026.*
