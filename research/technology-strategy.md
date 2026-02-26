# Technology Strategy & Architecture Vision

*Dog Show Entry Platform — February 2026*

---

## Executive Summary

This document defines the technology strategy for a modern, purpose-built UK dog show entry platform. Our architecture is designed to displace legacy incumbents (Fosse Data's ASP.NET WebForms, Higham Press's ageing stack) by delivering a mobile-first, real-time experience that solves the critical pain points identified in our research: fragmented ecosystems, paper-based show days, zero self-service capability, and poor mobile UX.

The platform is built on three pillars:
1. **Modern Web + PWA** — a single codebase serving exhibitors, secretaries, judges, and stewards across all devices
2. **Event-Driven Serverless Backend** — scales to zero during quiet periods, handles championship show closing-day spikes without manual intervention
3. **Real-Time Show Day Engine** — transforms the paper-based ring experience with live results, digital check-in, and instant results publication

---

## 1. Platform Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────────┐ │
│  │  Next.js PWA │  │  Show Day    │  │  Show Secretary Dashboard │ │
│  │  (Exhibitor) │  │  App (Ring   │  │  (Admin Portal)           │ │
│  │              │  │  Steward /   │  │                           │ │
│  │              │  │  Judge)      │  │                           │ │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬──────────────┘ │
└─────────┼─────────────────┼───────────────────────┼─────────────────┘
          │                 │                       │
          ▼                 ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         API LAYER                                   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    API Gateway (AWS)                          │   │
│  │              Rate limiting · Auth · CORS                     │   │
│  └──────────────────────┬───────────────────────────────────────┘   │
│                         │                                           │
│  ┌──────────────────────▼───────────────────────────────────────┐   │
│  │               tRPC / REST API Routes                         │   │
│  │         (Next.js API Routes + Lambda@Edge)                   │   │
│  └──────────┬──────────────┬───────────────┬────────────────────┘   │
│             │              │               │                        │
│  ┌──────────▼──────┐ ┌────▼────────┐ ┌───▼──────────────┐         │
│  │  Entry Service  │ │ Show Day    │ │ Eligibility       │         │
│  │  (entries,      │ │ Service     │ │ Engine            │         │
│  │  payments,      │ │ (real-time  │ │ (class validation │         │
│  │  amendments)    │ │ results,    │ │ AI-assisted)      │         │
│  │                 │ │ ring ops)   │ │                   │         │
│  └─────────────────┘ └─────────────┘ └───────────────────┘         │
└─────────────────────────────────────────────────────────────────────┘
          │                 │                       │
          ▼                 ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         DATA LAYER                                  │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────────┐ │
│  │  PostgreSQL   │  │  Redis       │  │  S3                       │ │
│  │  (Primary DB) │  │  (Cache +    │  │  (Documents, schedules,   │ │
│  │  via Supabase │  │  Real-time   │  │  catalogues, passes)      │ │
│  │  or RDS       │  │  pub/sub)    │  │                           │ │
│  └──────────────┘  └──────────────┘  └───────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Frontend** | Next.js 15 (App Router) + React 19 | SSR for SEO (show pages), RSC for performance, mature ecosystem |
| **Styling** | Tailwind CSS + Radix UI primitives | Rapid UI development, accessible by default, mobile-first |
| **State Management** | TanStack Query + Zustand | Server state caching + minimal client state |
| **API** | tRPC (primary) + REST (public/webhooks) | End-to-end type safety, auto-generated client, zero boilerplate |
| **Auth** | Clerk or NextAuth.js v5 | Passwordless (magic link/OTP) + social login; critical for older users who forget passwords |
| **Database** | PostgreSQL 16 (Supabase or AWS RDS) | Relational integrity for complex domain; JSONB for flexible show configs |
| **ORM** | Drizzle ORM | Type-safe, performant, SQL-close; better than Prisma for complex queries |
| **Real-Time** | Supabase Realtime or AWS AppSync | WebSocket-based live updates for show day |
| **Cache** | Redis (Upstash serverless) | Session cache, rate limiting, real-time pub/sub |
| **File Storage** | AWS S3 + CloudFront CDN | Schedules, catalogues, passes, photos |
| **Search** | Meilisearch or Typesense | Fast, typo-tolerant show/breed/dog search |
| **Email** | Resend or AWS SES | Transactional emails (confirmations, passes, reminders) |
| **Background Jobs** | Inngest or AWS Step Functions | Entry processing, catalogue generation, KC reporting |
| **Monitoring** | Sentry (errors) + Axiom (logs) + Vercel Analytics | Full observability stack |

### Why Next.js Over Separate SPA + API

1. **Single codebase** — reduces team coordination overhead at startup stage
2. **SSR/SSG** — show pages, breed pages, and results need SEO (Google is how newcomers discover shows)
3. **API Routes** — collocated backend logic, no separate deployment pipeline initially
4. **Edge Runtime** — critical for fast response times across UK regions
5. **Incremental adoption** — can extract microservices later as traffic patterns emerge

---

## 2. Mobile Strategy: Progressive Web App (PWA)

### Decision: PWA-First, Not Native

| Consideration | PWA | Native (React Native) |
|--------------|-----|----------------------|
| **Development cost** | 1x (shared codebase) | 2-3x (iOS + Android + Web) |
| **Time to market** | Weeks | Months |
| **App Store approval** | Not required | Required (Apple review delays) |
| **Updates** | Instant (no app store) | Requires submission + approval |
| **Offline capability** | Service Workers (good) | Native (excellent) |
| **Push notifications** | Supported (iOS 16.4+) | Full support |
| **Camera access** | Supported | Full support |
| **Install prompt** | Add to Home Screen | App Store download |
| **Target demographic** | Older users who won't download apps | Tech-savvy users |

### Rationale

Our user research reveals that many exhibitors are older and less technically confident. The friction of downloading a native app would be a significant barrier. A PWA delivers a native-like experience through the browser with zero install friction. The "Add to Home Screen" prompt gives it app-like presence.

**Critical PWA capabilities for our use cases:**
- **Offline show schedule** — exhibitors at shows with poor signal can still view their entries and ring times
- **Push notifications** — entry confirmations, show reminders, live results alerts (iOS 16.4+ supports this)
- **Camera** — ring stewards can photograph ring boards; exhibitors can photo critique cards
- **Background sync** — queue result submissions when connectivity is intermittent at show grounds

### Show Day Specific: Dedicated PWA Views

Ring stewards and judges get purpose-built views optimised for tablet use:
- **Ring Steward view**: Check-in list, class management, result entry (large touch targets, works in bright outdoor light)
- **Judge view**: Class overview, exhibit details, placement entry
- **Exhibitor view**: "My ring times today", real-time results feed, venue map

### When to Reconsider Native

Build native apps only if/when:
- PWA push notifications prove insufficient for engagement
- Bluetooth/NFC hardware integration needed (e.g., scanning KC registration tags)
- Revenue justifies 3x development investment
- User research shows app store presence is a significant trust signal

---

## 3. Payment Processing

### Stripe as the Payment Foundation

Stripe is the clear choice. Zooza already uses it successfully in this market, and it solves every payment challenge identified in our research.

### Payment Architecture

```
Exhibitor Entry
       │
       ▼
┌──────────────────┐
│  Basket/Checkout  │   Multi-dog, multi-show basket
│  (Client)         │   with itemised breakdown
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Stripe Checkout  │   Hosted payment page (PCI Level 1)
│  or Payment       │   Apple Pay / Google Pay / Card
│  Elements         │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Stripe Connect   │   Split payments:
│  (Platform)       │   - Show society receives entry fees
│                   │   - Platform retains service fee
│                   │   - Automatic payouts on schedule
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Webhook Handler  │   payment_intent.succeeded
│  (Idempotent)     │   → Confirm entry
│                   │   → Send confirmation email
│                   │   → Update show entry count
└──────────────────┘
```

### Stripe Connect: The Key to Show Society Payments

**Connected Accounts** (Standard or Express) for each show society:
- Exhibitor pays → Stripe splits automatically → Society receives entry fees minus platform fee
- Platform retains a per-entry service fee (e.g., 50p-£1 per entry) or percentage
- Societies get their own Stripe dashboard with full financial reporting
- Automatic payouts on configurable schedule (after show day, weekly, etc.)

### Handling Specific Payment Scenarios

| Scenario | Solution |
|----------|----------|
| **Multi-dog, multi-show basket** | Stripe Checkout with line items per dog per show; single payment |
| **Entry amendments (class changes)** | If fee increases, charge difference via Payment Intent; if decreases, issue partial refund |
| **Full refund (withdrawal before close)** | Stripe Refund API; automated if before closing date, manual approval after |
| **Partial refund (one dog withdrawn)** | Line-item level refund through Stripe |
| **Show cancellation** | Batch refund all entries via Stripe API; automated email notification |
| **Failed payment retry** | Stripe auto-retry + email notification to exhibitor |
| **International exhibitors** | Stripe handles currency conversion; charge in GBP |
| **Member vs non-member pricing** | Dynamic pricing based on exhibitor's society membership status |

### PCI DSS Compliance

By using **Stripe Checkout** or **Stripe Elements**, card data never touches our servers. This keeps us at **PCI SAQ A** (simplest compliance level):
- No card data stored, processed, or transmitted by our systems
- All payment UI rendered by Stripe's iframe/redirect
- Annual self-assessment questionnaire only (no external audit required)

---

## 4. Database Design

### Core Entity Relationship Model

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   Organisation  │       │      Show       │       │     Venue       │
│   (Society/Club)│──1:N──│                 │──N:1──│                 │
│                 │       │                 │       │                 │
│ id              │       │ id              │       │ id              │
│ name            │       │ name            │       │ name            │
│ kc_reg_number   │       │ show_type       │       │ address         │
│ type            │       │ show_scope      │       │ postcode        │
│ contact_email   │       │ organisation_id │       │ lat/lng         │
│ stripe_acct_id  │       │ venue_id        │       │ indoor/outdoor  │
│ members[]       │       │ start_date      │       │ capacity        │
└─────────────────┘       │ end_date        │       └─────────────────┘
                          │ entry_close_dt  │
                          │ postal_close_dt │
                          │ status          │
                          │ schedule_url    │
                          │ kc_licence_no   │
                          └────────┬────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
              ┌─────▼─────┐ ┌─────▼─────┐ ┌─────▼─────┐
              │ ShowClass  │ │   Ring    │ │ShowJudge  │
              │            │ │           │ │Assignment │
              │ id         │ │ id        │ │           │
              │ show_id    │ │ show_id   │ │ show_id   │
              │ breed_id   │ │ number    │ │ judge_id  │
              │ class_def  │ │ show_day  │ │ breed_id  │
              │ sex        │ │ judge_id  │ │ ring_id   │
              │ entry_fee  │ │ start_time│ └───────────┘
              │ sort_order │ │ breeds[]  │
              └─────┬──────┘ └───────────┘
                    │
                    │
┌─────────────────┐ │ ┌─────────────────┐
│    Exhibitor    │ │ │      Dog        │
│    (User)       │ │ │                 │
│                 │ │ │ id              │
│ id              │ │ │ registered_name │
│ email           │ │ │ kc_reg_number   │
│ name            │ │ │ breed_id        │
│ address         │ │ │ sex             │
│ phone           │ │ │ date_of_birth   │
│ kc_account_no   │ │ │ sire_name       │
│ preferences     │ │ │ dam_name        │
│ stripe_cust_id  │ │ │ breeder_name    │
└────────┬────────┘ │ │ colour          │
         │          │ │ owner_id        │
         │          │ │ co_owners[]     │
         │          │ │ achievements[]  │
         │          │ └────────┬────────┘
         │          │          │
         │     ┌────▼──────────▼────┐
         │     │       Entry        │
         └────►│                    │
               │ id                 │
               │ show_id            │
               │ dog_id             │
               │ exhibitor_id       │
               │ handler_id (opt)   │
               │ is_nfc             │
               │ status             │──── pending/confirmed/
               │ payment_intent_id  │     withdrawn/transferred
               │ entry_date         │
               │ catalogue_number   │
               │ total_fee          │
               └────────┬──────────┘
                        │
               ┌────────▼──────────┐
               │   EntryClass      │    (Entry ↔ ShowClass junction)
               │                   │
               │ id                │
               │ entry_id          │
               │ show_class_id     │
               │ fee               │
               └────────┬──────────┘
                        │
               ┌────────▼──────────┐
               │     Result        │
               │                   │
               │ id                │
               │ entry_class_id    │
               │ placement         │──── 1st-5th, CC, RCC,
               │ special_award     │     BOB, BIS, etc.
               │ judge_id          │
               │ critique_text     │
               │ recorded_by       │
               │ recorded_at       │
               └───────────────────┘
```

### Supporting Tables

```
Breed                    ClassDefinition          Judge
─────                    ───────────────          ─────
id                       id                       id
name                     name (Minor Puppy, etc)  name
group_id                 type (age/achievement)   kc_number
kc_breed_code            eligibility_rules (JSON) approved_breeds[]
variety (opt)            min_age_months           contact_email
                         max_age_months
BreedGroup               max_wins_count           Achievement
──────────               max_cc_count             ───────────
id                       description              id
name (Gundog, etc)                                dog_id
sort_order                                        type (CC, RCC, BOB,
                                                        placement, etc.)
Membership               Payment                  show_id
──────────               ───────                  class_id
id                       id                       date
user_id                  entry_id                 judge_id
organisation_id          stripe_payment_id        details (JSON)
status                   amount
expires_at               status
                         refund_amount
```

### Key Design Decisions

1. **PostgreSQL over NoSQL**: The domain is deeply relational — entries reference dogs, shows, classes, exhibitors, and results. Referential integrity is non-negotiable for a system handling payments and official results.

2. **JSONB for flexibility**: Show configuration, eligibility rules, and achievement details use JSONB columns. This avoids schema migrations when KC regulations change (which happens annually).

3. **Soft deletes + audit trail**: All entries and results use soft deletion with a full audit log table. This is essential for KC compliance and dispute resolution.

4. **Computed eligibility**: A dog's class eligibility is derived from their `achievements[]` and `date_of_birth` at the `entry_close_dt`. This is computed at query time (or cached in Redis) rather than stored, to always reflect the latest data.

5. **Multi-tenancy via organisation_id**: Show societies each operate independently. Row-level security (Supabase RLS) or application-level filtering ensures data isolation.

### Database Scaling Strategy

| Phase | Approach |
|-------|----------|
| **MVP** | Single PostgreSQL instance (Supabase Pro or RDS db.t4g.medium) |
| **Growth** | Read replicas for result queries and search; connection pooling via PgBouncer |
| **Scale** | Partition entries table by year; archive historical results to read-optimised store |

---

## 5. Integration Points

### 5.1 Kennel Club Data Integration

The Kennel Club is the single most important external data source.

| Data Point | Integration Method | Priority |
|-----------|-------------------|----------|
| **Breed registry** (official breed list, codes) | Static import + periodic refresh | MVP |
| **Dog registration lookup** | API if available; manual entry with validation rules initially | MVP |
| **Show licence data** | Scrape KC "Find a Show" or negotiate data feed | MVP |
| **Challenge Certificate records** | Manual import initially; API negotiation ongoing | Phase 2 |
| **Crufts qualification status** | Computed from results data | Phase 2 |
| **Judge approval lists** | Manual import or data feed | Phase 2 |
| **Stud Book data** | API or bulk import | Phase 3 |

**Strategy**: The KC does not currently offer a public API. Our approach:
1. **Phase 1**: Build with manual/imported KC data. Allow exhibitors to self-enter KC registration details. Validate format (registration number patterns) but not against KC database.
2. **Phase 2**: Approach the KC with a partnership proposal once we have traction. Demonstrate our platform's value (accurate data, fewer entry errors, faster results reporting).
3. **Phase 3**: Full bidirectional integration — pull registration data, push results and CC awards.

### 5.2 Results Reporting

| Destination | Method | Timing |
|-------------|--------|--------|
| **Our platform** (exhibitors) | Real-time via WebSocket | As judging happens |
| **Kennel Club** | Structured export (CSV/XML) or future API | Post-show (same day) |
| **Our Dogs / Dog World** | Structured export or API | Post-show |
| **Social media** | Open Graph share cards, auto-generated result graphics | Real-time |

### 5.3 Third-Party Services

| Service | Purpose | Integration |
|---------|---------|-------------|
| **Stripe** | Payments, payouts, financial reporting | SDK + Webhooks |
| **Resend / SES** | Email (confirmations, passes, reminders) | API |
| **Twilio** | SMS notifications (optional, for pass delivery) | API |
| **Google Maps Platform** | Venue maps, distance-based show search | JS SDK |
| **Cloudflare** | CDN, DDoS protection, edge caching | DNS + Proxy |
| **Sentry** | Error tracking and performance monitoring | SDK |
| **PostHog or Mixpanel** | Product analytics (entry funnels, feature usage) | SDK |

---

## 6. Real-Time Features: Show Day Engine

### Architecture

Show day is where we destroy the competition. No incumbent offers any digital show day experience.

```
┌────────────────────────────────────────────────────┐
│                 SHOW DAY ENGINE                     │
│                                                     │
│  ┌─────────────┐    ┌──────────────┐               │
│  │ Ring Steward │───►│ Real-Time    │               │
│  │ PWA (Tablet) │    │ Results      │               │
│  │              │    │ Service      │               │
│  │ - Check-in   │    │              │               │
│  │ - Record     │    │ WebSocket    │──── Broadcast │
│  │   placings   │    │ Server       │     to all    │
│  │ - Class mgmt │    │ (Supabase    │     connected │
│  └─────────────┘    │  Realtime    │     clients   │
│                      │  or Ably)    │               │
│  ┌─────────────┐    │              │               │
│  │ Judge PWA    │───►│              │               │
│  │ (Tablet)     │    └──────┬───────┘               │
│  │              │           │                       │
│  │ - View class │    ┌──────▼───────┐               │
│  │ - Confirm    │    │ PostgreSQL   │               │
│  │   placings   │    │ (Persistent  │               │
│  └─────────────┘    │  Storage)    │               │
│                      └──────────────┘               │
│  ┌─────────────┐                                    │
│  │ Exhibitor   │◄───── Live results feed            │
│  │ PWA (Phone) │◄───── Ring status updates          │
│  │             │◄───── "Your class is next" alerts  │
│  └─────────────┘                                    │
└────────────────────────────────────────────────────┘
```

### Real-Time Features by User

**Exhibitor (Phone)**:
- Live results feed — see placements as they happen across all rings
- "My Schedule" — personalised view of when their dogs are in the ring
- Push notification: "Class [X] in Ring [Y] — you're up in ~15 minutes"
- Ring status: "Ring 3: Currently judging Limit Dog" (live)
- Live CC/BOB/BIS results with celebratory UI

**Ring Steward (Tablet)**:
- Digital check-in — tap to mark exhibitors present/absent
- Class management — advance through classes, record absentees
- Result entry — tap to assign 1st-5th placements
- Automatic "next class" progression
- Offline-capable with sync when connectivity returns

**Judge (Tablet, optional)**:
- View class entries with exhibit numbers
- Confirm/approve placements entered by steward
- Digital critique entry (post-judging)

**Show Secretary (Dashboard)**:
- Live entry check-in rates
- Ring progress overview (which rings are behind schedule)
- Live financial summary (entries checked in vs. no-shows)
- Real-time results dashboard

### Offline Resilience

Show venues frequently have poor mobile signal. Our PWA must work offline:

1. **Service Worker** caches the full show schedule, entry list, and ring assignments before show day
2. **IndexedDB** stores check-in state and results locally
3. **Background Sync API** queues result submissions when offline
4. **Conflict resolution**: Last-write-wins with timestamp, plus manual resolution UI for conflicts
5. **Visual indicator**: Clear online/offline status badge in steward and judge views

---

## 7. Scalability

### Traffic Patterns

Dog show entry traffic is highly spiked:

```
Traffic Pattern (Typical Year)
─────────────────────────────

│                          ╭──╮  Crufts closing
│                         ╱    ╲  (January)
│            ╭──╮        ╱      ╲
│           ╱    ╲      ╱        ╲
│  ╭──╮   ╱      ╲    ╱          ╲        ╭──╮
│ ╱    ╲ ╱        ╲──╱            ╲──╮   ╱    ╲
│╱      ╲╱                           ╲──╱      ╲──
└────────────────────────────────────────────────────
  Jan  Feb  Mar  Apr  May  Jun  Jul  Aug  Sep  Oct

Show Day Traffic (Championship Show)
────────────────────────────────────
│                    ╭╮  Results posting
│                   ╱  ╲
│  ╭─╮             ╱    ╲
│ ╱   ╲           ╱      ╲
│╱     ╲─────────╱        ╲───
└────────────────────────────────
 7am  9am  11am  1pm  3pm  5pm
```

### Scaling Strategy

| Challenge | Solution |
|-----------|----------|
| **Entry closing spike** (thousands of entries in final hours) | Serverless auto-scaling (Vercel/Lambda); queue-based entry processing; optimistic UI with background validation |
| **Show day concurrent users** (2,000-5,000 simultaneous at a championship show) | WebSocket connection pooling; Redis pub/sub fan-out; CDN-cached static assets |
| **Catalogue generation** (large PDF generation after entries close) | Background job (Inngest/Step Functions); generate async, notify when ready |
| **Search queries** (breed + location + date filtering) | Dedicated search index (Meilisearch); rebuilt nightly or on show data change |
| **Database load** | Read replicas for result queries; connection pooling; query-level caching |

### Infrastructure Sizing

| Phase | Expected Load | Infrastructure |
|-------|--------------|----------------|
| **MVP** | 50-100 concurrent users, 5-10 shows | Vercel Pro, Supabase Pro, single Redis |
| **Growth** | 500-1,000 concurrent, 50+ shows | Vercel Enterprise, RDS Multi-AZ, Redis cluster |
| **Scale** | 5,000+ concurrent (Crufts-level) | Multi-region, read replicas, dedicated WebSocket tier |

### Cost Optimisation

- **Serverless-first** — pay only for compute used; no idle server costs during quiet periods
- **Edge caching** — show pages, breed data, and results cached at CDN edge (Cloudflare/Vercel Edge)
- **Image optimisation** — Next.js Image component with automatic WebP/AVIF conversion
- **Database connection pooling** — PgBouncer or Supabase pooler to limit connection overhead

---

## 8. Security & Compliance

### GDPR Compliance

| Requirement | Implementation |
|-------------|----------------|
| **Lawful basis** | Contract (entry processing), Consent (marketing), Legitimate interest (platform improvement) |
| **Data minimisation** | Only collect data required for entries + KC compliance |
| **Right to access** | Self-service data export from exhibitor dashboard (JSON/CSV) |
| **Right to erasure** | Account deletion with cascade; retain anonymised entry records for show society accounting |
| **Right to portability** | Structured export of all personal data + dog data + entry history |
| **Data retention** | Active data retained while account exists; deleted accounts purged after 7 years (financial records) or 2 years (all else) |
| **Breach notification** | Automated detection + 72-hour ICO notification process |
| **Privacy by design** | RLS on database; encrypted PII; no sensitive data in logs |
| **Cookie consent** | Essential cookies only (no consent needed); analytics cookies behind consent banner |
| **DPO** | Designated Data Protection Officer once processing at scale |

### PCI DSS

As covered in Section 3: Stripe Checkout/Elements means card data never touches our servers. **PCI SAQ A** compliance only.

### Application Security

| Control | Implementation |
|---------|----------------|
| **Authentication** | Passwordless (magic link/OTP) primary; password optional; MFA available |
| **Authorisation** | Role-based (exhibitor, secretary, steward, judge, admin) with resource-level permissions |
| **API security** | Rate limiting per user and IP; CORS whitelist; CSRF tokens; input validation (Zod schemas) |
| **Data encryption** | TLS 1.3 in transit; AES-256 at rest (AWS/Supabase default) |
| **SQL injection** | Parameterised queries via Drizzle ORM; no raw SQL |
| **XSS** | React's default escaping; CSP headers; sanitised user content |
| **Dependency security** | Automated Dependabot/Renovate; npm audit in CI |
| **Secrets management** | Environment variables via Vercel/AWS Secrets Manager; never in code |
| **Audit logging** | All entry modifications, payment events, and admin actions logged with user ID, timestamp, IP |
| **Session management** | Short-lived JWTs (15 min) + secure refresh tokens; session revocation on password change |

### Data Protection for Dog Show Specific Data

- **Exhibitor addresses**: Required by KC regulations on entry forms, but minimised in public-facing views (postcode only in catalogue)
- **Dog KC registration numbers**: Treated as semi-sensitive; visible to show officials only
- **Judge assignments**: Public data once schedule published
- **Results**: Public data (this is a competitive sport)
- **Financial data**: Strictly access-controlled; show society sees only their own financial data

---

## 9. Unique Differentiators

These are features no competitor currently offers — they represent our competitive moat.

### 9.1 AI-Powered Class Eligibility Engine

**The Problem**: Class eligibility is the #1 confusion point for exhibitors. Getting it wrong means disqualification and fines of £50-£300. No existing platform validates eligibility.

**The Solution**:
```
Exhibitor selects a show
         │
         ▼
System checks dog's:
  - Age at show date
  - Achievement history (CCs, placements, titles)
  - KC regulation version applicable
         │
         ▼
┌──────────────────────────────┐
│  ELIGIBLE CLASSES            │
│  ✅ Puppy (age: 10 months)  │
│  ✅ Junior (age: 10 months) │
│  ✅ Novice (0 CC, 1 1st)    │
│  ✅ Open (always eligible)   │
│                              │
│  NOT ELIGIBLE                │
│  ❌ Veteran (age < 7 years) │
│  ❌ Minor Puppy (age > 9mo) │
│  ⚠️ Graduate (2/4 firsts -  │
│     check carefully)         │
│                              │
│  💡 RECOMMENDED for you:     │
│     Novice + Open            │
│     (best chance of CC path) │
└──────────────────────────────┘
```

**Implementation**: Rules engine (not ML) based on KC F Regulations. JSON-defined eligibility rules that can be updated when regulations change. AI (LLM) used only for natural-language explanation of why a class is/isn't eligible, and for "recommended classes" based on the dog's career stage.

### 9.2 Dog Career Tracking & Statistics

**No platform tracks a dog's full show career.** We will.

- Complete results history across all shows entered through the platform
- CC tracker: "2 of 3 CCs needed for Show Champion"
- Crufts qualification tracker: "Qualified via BOB at Leeds Championship Show"
- Junior Warrant point tracker (25 points needed, 6-18 months)
- Stud Book band eligibility tracking
- Win rate statistics by class, judge, show type
- Visual career timeline

**Data source**: Results entered through our platform. Over time, allow manual import of historical results to build complete profiles.

### 9.3 Smart Show Discovery

```
┌─────────────────────────────────────────┐
│  🔍 Shows For You                       │
│                                         │
│  Based on: Golden Retriever, Yorkshire  │
│                                         │
│  📍 Leeds Championship Show  (32 miles) │
│     12 Mar · Judge: Mrs J Smith         │
│     Your dog qualifies for 6 classes    │
│     12 of your friends are entering     │
│     [Enter Now]                         │
│                                         │
│  📍 Darlington Open Show     (45 miles) │
│     19 Mar · Judge: Mr P Brown          │
│     Your dog qualifies for 8 classes    │
│     Entry fee: £4.00 first, £2.00 subs  │
│     Closing: 5 Mar                      │
│     [Enter Now]                         │
│                                         │
│  📍 Scottish Kennel Club     (210 miles)│
│     CC Show · 28 Mar                    │
│     ⭐ Your dog needs 1 more CC!        │
│     [Enter Now]                         │
└─────────────────────────────────────────┘
```

Features:
- Filter by breed, distance, show type, judge, date range
- Smart recommendations based on dog's career needs (needs CCs → suggest championship shows)
- "Friends entering" social signal (if exhibitors connect on platform)
- Closing date reminders and countdown
- Map view of upcoming shows with travel radius

### 9.4 Social & Community Features

- **Follow** breeds, exhibitors, judges, show societies
- **Celebrate** wins — auto-generated shareable result cards (great for social media)
- **Critique sharing** — judges can publish critiques, exhibitors can read them for their dogs
- **Show reviews** — exhibitors rate shows (venue quality, organisation, parking)
- **Photo gallery** — per show, per breed, per dog

### 9.5 Show Society Intelligence Dashboard

Beyond entry processing:
- **Entry forecasting**: Based on historical patterns, predict final entry numbers before closing
- **Financial projections**: Revenue tracking, expense estimation, profit/loss per show
- **Demographic insights**: Where exhibitors are travelling from, breed popularity trends, new vs returning exhibitors
- **Judge popularity**: Correlate judges with entry volumes to inform future appointments
- **Scheduling optimiser**: Suggest ring allocations based on entry counts and estimated judging time

---

## 10. Infrastructure & DevOps

### Cloud Architecture

```
┌──────────────────────────────────────────────────────┐
│                    Cloudflare                         │
│              (DNS, CDN, DDoS Protection)             │
└──────────────────────┬───────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────┐
│                    Vercel                             │
│         (Next.js hosting, Edge Functions)             │
│                                                      │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  SSR/SSG   │  │  API Routes  │  │  Edge        │ │
│  │  Pages     │  │  (tRPC)      │  │  Middleware   │ │
│  └────────────┘  └──────────────┘  └──────────────┘ │
└──────────────────────┬───────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
┌───────▼──────┐ ┌─────▼──────┐ ┌────▼───────┐
│  Supabase    │ │  Upstash   │ │  AWS S3    │
│  (Postgres   │ │  (Redis)   │ │  (Files)   │
│  + Realtime  │ │            │ │            │
│  + Auth)     │ │            │ │            │
└──────────────┘ └────────────┘ └────────────┘
```

### Why Vercel + Supabase (Not Full AWS)

| Factor | Vercel + Supabase | Full AWS |
|--------|-------------------|----------|
| **Time to market** | Days | Weeks |
| **DevOps overhead** | Minimal (managed) | Significant (IaC, networking, etc.) |
| **Cost at MVP** | ~$50-100/month | ~$200-500/month |
| **Scaling** | Automatic | Manual configuration |
| **Next.js optimisation** | First-class (Vercel builds Next.js) | Generic hosting |
| **Migration path** | Can move to AWS later if needed | Already there |
| **Real-time** | Supabase Realtime (built-in) | AppSync or custom WebSocket |

At startup stage, managed infrastructure means the small team focuses on product, not ops. We can migrate to AWS (ECS/EKS, RDS, ElastiCache) when the cost-performance tradeoff justifies it.

### CI/CD Pipeline

```
Developer pushes to GitHub
         │
         ▼
┌────────────────────┐
│  GitHub Actions    │
│                    │
│  1. Lint (ESLint,  │
│     Prettier)      │
│  2. Type check     │
│     (TypeScript)   │
│  3. Unit tests     │
│     (Vitest)       │
│  4. Integration    │
│     tests          │
│  5. E2E tests      │
│     (Playwright)   │
│  6. Security scan  │
│     (npm audit)    │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│  Vercel Preview    │──── Every PR gets a preview URL
│  Deployment        │     for testing and review
└────────┬───────────┘
         │ (merge to main)
         ▼
┌────────────────────┐
│  Vercel Production │──── Automatic deployment
│  Deployment        │     with instant rollback
└────────────────────┘
         │
         ▼
┌────────────────────┐
│  Post-Deploy       │
│                    │
│  - Sentry release  │
│  - DB migrations   │
│    (Drizzle Kit)   │
│  - Smoke tests     │
│  - Slack notify    │
└────────────────────┘
```

### Monitoring & Observability

| Tool | Purpose | Coverage |
|------|---------|----------|
| **Sentry** | Error tracking, performance monitoring | Frontend + API |
| **Axiom** | Log aggregation and search | Server logs, API logs |
| **Vercel Analytics** | Web vitals, page performance | Frontend |
| **PostHog** | Product analytics, feature flags, session replay | User behaviour |
| **Checkly** | Synthetic monitoring (uptime, API health) | Production endpoints |
| **PagerDuty or OpsGenie** | Alerting and on-call rotation | Critical alerts |
| **Stripe Dashboard** | Payment monitoring, disputes, payouts | Financial |

### Key Alerts

| Alert | Condition | Severity |
|-------|-----------|----------|
| API error rate > 5% | 5-minute rolling window | Critical |
| Payment failure rate > 2% | Per hour | Critical |
| Entry submission latency > 3s (p95) | Per hour | Warning |
| Database connection pool > 80% | Real-time | Warning |
| WebSocket connections > 80% capacity | Real-time | Warning |
| Deployment failure | Any | Critical |
| SSL certificate expiry < 14 days | Daily check | Warning |

---

## 11. Development Phases

### Phase 1: Foundation (Months 1-3)

**Goal**: Core entry platform — exhibitors can find shows, enter dogs, and pay.

- Next.js app scaffold with auth (Clerk/NextAuth)
- Exhibitor registration and dog profile management
- Show listing and discovery (manual data entry by admin initially)
- Entry flow: select show → select dog → select classes → pay (Stripe)
- Show secretary: basic show setup, view entries
- PostgreSQL schema (core entities)
- Email notifications (confirmation, reminders)
- Mobile-responsive PWA with install prompt

### Phase 2: Intelligence (Months 4-6)

**Goal**: Smart features that differentiate us from every competitor.

- Class eligibility engine (rules-based validation)
- Self-service entry amendments and withdrawals
- Multi-dog, multi-show basket checkout
- Dog career tracking (results history, CC tracker)
- Show secretary: financial dashboard, catalogue data export
- Smart show recommendations (breed + location + career needs)
- Search (Meilisearch) for shows, breeds, dogs

### Phase 3: Show Day (Months 7-9)

**Goal**: Transform the paper-based show day experience.

- Real-time engine (WebSocket infrastructure)
- Ring steward PWA: check-in, class management, result entry
- Exhibitor show day view: my schedule, live results, ring status
- Offline capability (Service Workers, IndexedDB)
- Results publication (instant, as judging completes)
- Push notifications for show day events
- Show secretary: live show day dashboard

### Phase 4: Community & Growth (Months 10-12)

**Goal**: Social features and ecosystem expansion.

- Social features: follow, celebrate wins, share results
- Integrated critique system for judges
- Show reviews and ratings
- Advanced analytics for show societies
- Kennel Club integration (if partnership secured)
- Photo gallery per show/breed/dog
- API for third-party integrations

---

## 12. Technical Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| **KC refuses data partnership** | Cannot validate registrations automatically | High (initially) | Build with manual entry + format validation; prove platform value first |
| **Show venues have no connectivity** | Show day features unusable | Medium | Offline-first PWA architecture; pre-cache all show data |
| **Stripe Connect onboarding too complex for societies** | Slow B2B adoption | Medium | White-glove onboarding; simplified Express accounts; handle setup on their behalf |
| **Incumbent lock-in (Fosse Data contracts)** | Societies can't switch easily | High | Target open shows first (less locked in); offer parallel running; import existing data |
| **Older exhibitors resist change** | Slow user adoption | High | Passwordless auth (magic links); extremely simple UX; phone support during transition |
| **Regulation changes break eligibility engine** | Incorrect class validation | Medium | JSON-configurable rules; admin UI for rule updates; flag uncertain eligibility |
| **Real-time infrastructure costs at scale** | Show day costs spike | Low | WebSocket connection limits; fallback to polling; tiered pricing for societies |

---

## 13. Success Metrics

| Metric | Target (Year 1) |
|--------|-----------------|
| Shows on platform | 50+ (mix of open and championship) |
| Registered exhibitors | 5,000+ |
| Entries processed | 20,000+ |
| Entry completion rate | >85% (vs. estimated 60-70% on legacy platforms) |
| Time to enter (single dog, returning user) | <2 minutes |
| Mobile traffic share | >60% |
| Self-service amendment rate | >80% of all amendments |
| Results publication time | <5 minutes after judging (vs. hours/days for competitors) |
| Show secretary NPS | >50 |
| Exhibitor NPS | >40 |

---

## Summary

This platform is not an incremental improvement over Fosse Data or Higham Press — it's a generational leap. We're building for the modern exhibitor who expects the same quality of experience they get from Deliveroo, Airbnb, or Ticketmaster. The dog show community deserves better than ASP.NET WebForms from 2002.

Our technology choices — Next.js, PostgreSQL, Stripe Connect, PWA, real-time WebSockets — are battle-tested, well-documented, and optimised for a small team shipping fast. Every architectural decision prioritises time-to-market first, with clear migration paths as we scale.

The moat isn't technology alone — it's the combination of modern tech, deep domain understanding, and the network effects that build as exhibitors, societies, and judges all adopt the platform.

---

*Document prepared as part of the Dog Show Entry Platform discovery phase, February 2026.*
