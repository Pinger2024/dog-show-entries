# Competitive Analysis: UK Online Dog Show Entry Platforms

*Research Date: February 2026*

---

## Executive Summary

The UK online dog show entry market is dominated by a handful of legacy players, most of whom originated as **printing companies** that bolted on digital capabilities over time. The market is characterised by:

- **Fragmentation**: No single platform handles all shows; exhibitors must maintain accounts across multiple systems
- **Legacy technology**: Most platforms run on ageing tech stacks (ASP.NET WebForms, early-2000s architecture)
- **Print-first mentality**: The incumbents' core business remains physical printing (schedules, catalogues, certificates), with online entry as an add-on
- **Poor mobile experience**: None of the major platforms offer a genuinely mobile-first experience
- **Limited innovation**: Feature sets have barely evolved in 20 years

This creates a significant opportunity for a modern, purpose-built platform.

---

## Major Competitors

### 1. Fosse Data Systems

**Website**: fossedata.co.uk
**Founded**: 1982 (Rugby, Warwickshire)
**Status**: Market leader for UK championship shows

#### Overview
Fosse Data is the dominant player in UK dog show management, with a ~40-year history. They pioneered computerised catalogue compilation for pedigree dog shows and launched the UK's first validated online entry system in March 2002. They have a critical partnership with **The Kennel Club** and have handled **Crufts entries since 1999**, where over 85% of exhibitors use their online system.

#### Features & Capabilities
- **Online Entry System**: Validated entries with breed/sex/age class checking
- **Show Management**: Class scheduling, ring allocations, entry verifications, judging panel coordination
- **Catalogue Production**: Computerised compilation with desktop publishing
- **Results Service**: First fully validated on-site results service (introduced 1990); live results posting
- **Printing**: Schedules, timetables, certificates, awards, judging books, reports, yearbooks
- **FD Retriever**: Back-end admin portal for show organisers
- **Geographic Show Discovery**: Filter shows by type, breed, and distance
- **Pass Downloads**: Digital passes available ~2 weeks before shows
- **Field Trial Management**: Separate portal for field trial entries

#### Pricing Model
- **Show societies pay per dog entered** (not per catalogue printed) — more realistic pricing model
- Data input charged as a separate line item
- Exhibitors pay show-specific entry fees (set by each society, not by Fosse Data)
- Payment via credit card through Netbanx (secure payment gateway)
- No visible platform subscription fee for exhibitors

#### Technology & UX
- **Tech stack**: ASP.NET WebForms (.aspx pages) — a legacy Microsoft framework from 2002, now deprecated
- **Website redesign**: The site was upgraded by agency Zarr at some point (new website + CRM back-end), but still carries legacy UI patterns
- **Mobile experience**: Poor. The site was not designed mobile-first and forms are difficult to complete on smaller screens
- **UX issues reported by exhibitors**:
  - Cannot easily add additional dogs to an existing entry online — must phone to add
  - If an online entry fails, users must log out, restart PC, and type URL from scratch
  - Workarounds include creating separate accounts per dog (not ideal)
  - Passes sometimes missing from confirmation emails, requiring manual download
  - AOL browser compatibility issues near closing times
  - Data accuracy errors reported in results (classes left out, breed mistakes)

#### Market Position
- **Strengths**: Kennel Club partnership (Crufts), 40+ year reputation, largest show catalogue, validated entry checking, fast results posting
- **Weaknesses**: Ageing technology, poor mobile UX, entry process friction, fragmented user experience, limited innovation pace
- **Moat**: The Kennel Club/Crufts relationship is the strongest competitive advantage in the market

#### What Users Say
- "Usually just as reliable as Higham if not more" — Champdogs forum
- "Fosse Data makes the most mistakes and leaves classes out" — Champdogs forum
- Frustration with inability to add dogs to existing entries
- Generally accepted as the default for championship shows despite UX issues

---

### 2. Higham Press

**Website**: highampress.co.uk
**Founded**: 1945 (Higham, Alfreton, Derbyshire)
**Status**: Major player, especially for championship shows

#### Overview
Higham Press is a family-run printing business with an 80-year history. They have printed "every major UK Championship Show" at one time or another. Their primary business is **print production** (schedules, catalogues, show accounting, exhibitor mailings) with online entry added as a digital extension. Currently list 53+ upcoming shows.

#### Features & Capabilities
- **Online Entry System**: Account-based entry with email + mobile phone + password registration
- **Schedule Production**: Digital downloads of show schedules
- **Catalogue Printing**: Full-colour digital and lithographic printing with in-house finishing
- **Show Accounting**: Financial reconciliation for show societies
- **Results Service**: Online results with photographs (notably slower than Fosse Data)
- **Exhibitor Pass Distribution**: Email/SMS notification ~2 weeks before show; download from account
- **Gift Vouchers**: Purchase available through website
- **Printing Services**: Business stationery, hardback books, saddle stitching, binding

#### Pricing Model
- Show-specific entry fees (set by individual societies)
- **Online late entry surcharge**: +GBP 2.00 per entry for entries made after the postal closing date
- GBP 20.00 surcharge for returned cheques
- Pricing to show societies based on printing volumes and data handling

#### Technology & UX
- **Website**: Appears more modern than Fosse Data (cleaner design), likely rebuilt around 2021
- **Mobile experience**: Improved over Fosse Data but still not mobile-first
- **Entry process**: Standard form-based online entry with account management
- **Archive system**: Still has legacy .asp URLs in their archive section, suggesting gradual migration

#### Market Position
- **Strengths**: 80-year brand, trusted by major championship shows, superior print quality, complete end-to-end show service for secretaries
- **Weaknesses**: Significantly slower results posting than Fosse Data, online entry is secondary to print business, +GBP 2 late surcharge penalises online-only exhibitors
- **Moat**: Deep relationships with show societies built over decades; full-service print + entry offering

#### What Users Say
- "Higham Press are SO slow!" — PetForums thread title about results posting
- Fosse Data noted as "much faster at uploading show results" than Higham Press
- The GBP 2 online surcharge after postal closing is unpopular with exhibitors
- "Higham Press website" — Champdogs forum thread discussing navigation difficulties

---

### 3. Zooza

**Website**: zooza.com
**Operated by**: FTW, LLC (US-based company)
**Status**: Growing challenger, particularly for open shows and breed clubs in the UK

#### Overview
Zooza is the most modern platform in the space — a purpose-built event management SaaS for dog clubs and event organisers. Unlike Fosse Data and Higham Press (print companies with digital add-ons), Zooza is **digital-first**. It's used by UK breed clubs (Scottish Toy Dog Society, Terrier Club of Scotland, Trent to Tweed Poodle Club, etc.) and show printers like **Arena Print** and **MBJ Print** who white-label Zooza for their online entry.

#### Features & Capabilities
- **Online Entry System**: 8-step guided workflow (contact verification, dog selection, activity selection, e-commerce, terms, payment)
- **Dog Profile Management**: Persistent dog database with sire/dam associations
- **Club Membership Management**: Dues collection and member tracking
- **Custom Event Pages**: Marketing and landing pages per event
- **eCommerce**: Sell catalogues, products, sponsorships through events
- **Automatic Catalogue Generation**: Digital catalogues and critique certificates
- **Financial Reporting**: Comprehensive stats and financial reconciliation
- **Email Marketing**: Bulk outreach to exhibitors/pet owners
- **Stripe Payment Processing**: Modern payment gateway with direct account deposits
- **Event Roster Exports**: Data export capabilities

#### Pricing Model
- **Platform fees**: Tiered pricing plans for clubs/organisers (specific amounts not publicly visible; described as "affordable plans for any size account")
- Exhibitor entry fees set by individual clubs (e.g., GBP 4.00 first entry per dog, GBP 2.00 subsequent — varies by show)
- Stripe processing fees apply (1.5% + 20p for UK cards)
- Membership fees collected through the platform

#### Technology & UX
- **Tech stack**: Modern web application (JavaScript/React-based front-end, likely cloud-hosted)
- **Mobile experience**: Better than legacy competitors but not fully mobile-optimised based on current design
- **UX strengths**: Guided entry workflow, persistent dog profiles, clean modern interface
- **UX weaknesses**: Platform is US-designed, some terminology and workflow may feel unfamiliar to UK exhibitors; smaller event catalogue than Fosse Data/Higham Press

#### Market Position
- **Strengths**: Modern technology, SaaS model, Stripe payments, eCommerce capabilities, growing UK adoption through printer partnerships
- **Weaknesses**: US-based company (limited UK market understanding), no Kennel Club partnership, smaller show catalogue, less established brand
- **Moat**: Technology advantage over legacy players; growing network via printer partnerships (Arena Print, MBJ Print)

#### What Users Say
- "It collects stats in every way imaginable...The financial component is INVALUABLE" — United Doberman Club organiser
- "ABSOLUTELY AMAZING" — event organiser feedback
- Limited UK-specific exhibitor reviews found (suggests relatively new to UK market)

---

### 4. Online Show Entry (onlineshowentry.com)

**Website**: onlineshowentry.com
**Founded**: ~2007
**Status**: Niche player, primarily serving clubs using independent show printers

#### Overview
Online Show Entry is a utilitarian platform that has been providing entry services since 2007. It serves as a tool for exhibitors to enter shows and for clubs/show printers to produce catalogues and judges' books. It appears to be a smaller operation compared to Fosse Data or Higham Press.

#### Features & Capabilities
- **Show Listings**: Filter by show type (Championship, Open, Members Limited, etc.) and breed (200+ breeds)
- **Online Entry**: Digital entry form submission
- **Schedule Downloads**: PDF schedule access
- **Venue Maps**: Google Maps integration for show venues
- **Catalogue Portal**: Separate admin interface for show secretaries
- **Closing Date Display**: Shows postal and online closing dates (with note: "Online Closing Dates are Final")

#### Technology & UX
- **Tech stack**: Basic PHP-based website with Select2 JavaScript library for dropdowns
- **Requires JavaScript** to function (shows warning if disabled)
- **Mobile experience**: Minimal — standard desktop website not optimised for mobile
- **UX**: Functional but dated; lacks the polish of even Fosse Data's interface
- **No visible user account management** beyond basic login

#### Pricing Model
- Not publicly documented
- Entry fees set by individual shows
- Operator/ownership information not publicly disclosed

#### Market Position
- **Strengths**: Simple, focused tool; established since 2007
- **Weaknesses**: Dated technology, minimal features, no brand presence, unclear business model/ownership
- **Moat**: None significant — vulnerable to disruption

---

## Secondary Competitors & Adjacent Platforms

### 5. Have A Dog Day

**Website**: haveadogday.co.uk
**Operated by**: Vikki (sole trader, Dodworth, South Yorkshire)
**Status**: Small independent operator

- Online dog show entry + schedule/catalogue printing + dog breeding administration
- **Administration charge**: GBP 1.25 per entry (increased January 2026 due to payment processing costs)
- Refunds processed minus admin charge
- PayPal payments (no Stripe); eCheques not accepted
- Also offers puppy packs (laminated pedigrees, contracts of sale)
- Small-scale operation serving individual breed clubs
- Very basic web presence

### 6. Dog Show Central UK

**Website**: dogshowcentral.co.uk
**Status**: Information/discovery platform (not an entry system)

- Central directory of UK dog show information
- **Subscription**: GBP 24/year via PayPal
- Features: Weekly closing reminder emails, breed class tracking, map view, iCal export, ad-free experience
- Does NOT process entries — links to external entry platforms
- Useful as a show discovery tool but not a competitor in the entry space

### 7. My Dog Shows

**Website**: mydogshows.co.uk
**Status**: Information/tracking platform

- Show lists for Agility, Breed Showing, and Hoopers
- Free and paid subscription tiers
- Features: Dog age/season warnings, personal show archive, results tracking, critique recording
- Filter and search tools behind paywall
- Does NOT process entries directly — supplementary tool
- Currently returning 503 errors (reliability concerns)

### 8. The Kennel Club "Find a Show"

**Website**: royalkennelclub.com/search/find-a-show/
**Status**: Official directory

- Searchable database of all KC-licensed shows and trials
- Updated daily
- Supports club secretaries for date conflict checking
- Links out to show printer entry systems (Fosse Data, Higham Press, etc.)
- Does NOT process entries directly

---

## Competitive Analysis Matrix

| Feature | Fosse Data | Higham Press | Zooza | Online Show Entry | Have A Dog Day |
|---|---|---|---|---|---|
| **Founded** | 1982 | 1945 | ~2018 | ~2007 | Unknown |
| **Core Business** | Print + Digital | Print + Digital | Digital-first SaaS | Digital entry | Print + Digital |
| **Online Entry** | Yes (validated) | Yes | Yes (guided workflow) | Yes (basic) | Yes (basic) |
| **KC Partnership** | Yes (Crufts) | No | No | No | No |
| **Catalogue Printing** | Yes (core) | Yes (core) | Auto-generated digital | No | Yes |
| **Results Service** | Yes (fast) | Yes (slow) | Limited | No | No |
| **Payment Gateway** | Netbanx | Unknown | Stripe | Unknown | PayPal |
| **Mobile Experience** | Poor | Below average | Average | Poor | Poor |
| **eCommerce** | Limited | Limited | Yes (full) | No | No |
| **Club Management** | Limited | Limited | Yes (memberships, dues) | No | No |
| **Email Marketing** | No | No | Yes | No | No |
| **Financial Reporting** | Basic | Basic | Comprehensive | No | Basic |
| **Tech Modernity** | Legacy (ASP.NET) | Mixed (some modern) | Modern (SaaS) | Legacy (PHP) | Legacy |
| **Show Volume** | Highest (incl. Crufts) | High (champ shows) | Growing (open shows) | Low-Medium | Low |
| **Exhibitor Admin Fee** | None visible | +GBP 2 late surcharge | None visible | Unknown | GBP 1.25 per entry |

---

## Key Market Insights

### 1. The Market is Ripe for Disruption
Every major player either started as a printing company or offers a minimally viable digital experience. No platform offers:
- A truly mobile-first entry experience
- A unified platform where exhibitors can discover, enter, and track ALL shows
- Modern UX patterns (real-time validation, progressive forms, saved preferences)
- Social features (exhibitor community, critique sharing, results celebration)
- Intelligent recommendations (shows near you, breed-specific suggestions)

### 2. The Kennel Club Gateway is Critical
Fosse Data's dominance stems from their KC/Crufts partnership. Any new entrant must consider:
- KC data integration (breed registrations, show licencing)
- ATC (Authority to Compete) certificate management
- RFG Scheme certificate uploads
- Challenge Certificate tracking

### 3. Exhibitor Pain Points (Opportunities)
Based on forum research across Champdogs and PetForums:
- **Multiple accounts required** across Fosse Data, Higham Press, and other printers
- **Cannot easily modify entries** (add dogs, change classes) after initial submission
- **Poor mobile experience** — many exhibitors now primarily use phones
- **Slow results** (Higham Press) or **inaccurate results** (Fosse Data)
- **Entry fee confusion** — different pricing for members vs non-members, online vs postal, varies by show
- **Pass download friction** — passes not always emailed, must log in to download
- **No unified show calendar** — must check multiple websites to find all available shows

### 4. Show Society Pain Points (Opportunities)
- Manual coordination between entry system and printer
- Limited financial reporting and reconciliation tools
- No real-time entry tracking during closing period
- Difficulty managing ring scheduling with large entry volumes
- Paper-based processes still common alongside digital

### 5. Pricing Model Observations
- **Fosse Data/Higham Press**: Revenue from show societies (per-dog data charges + printing fees)
- **Zooza**: SaaS subscription from organisers + Stripe processing margin
- **Have A Dog Day**: GBP 1.25 admin fee per entry from exhibitors
- **Opportunity**: A modern platform could capture value from both sides (B2B to societies + convenience fees or premium features for exhibitors)

### 6. Market Scale
- Dog showing is the UK's most popular canine activity
- Crufts alone handles ~18,700 dogs (2026) with 85%+ entering online via Fosse Data
- The Kennel Club licences hundreds of championship, open, and limited shows annually
- Fosse Data lists 50+ upcoming shows; Higham Press lists 53+ at any time
- Significant international exhibitor base (especially for championship shows)
- Dog Show Central UK has been operating a subscription model suggesting sufficient market demand

---

## Strategic Implications for a New Platform

### Immediate Opportunities
1. **Mobile-first entry experience** — no competitor offers this adequately
2. **Unified show discovery** — aggregate all shows regardless of printer/platform
3. **Single exhibitor profile** — enter any show from one account with saved dog data
4. **Real-time entry management** — add/remove dogs, change classes without phoning
5. **Modern payment processing** — Stripe/Apple Pay/Google Pay

### Medium-term Differentiators
1. **Smart show recommendations** — based on breed, location, past entries
2. **Results tracking and analytics** — win rates, judge preferences, show history
3. **Community features** — critiques, photos, breed discussion
4. **Show society dashboard** — real-time entries, financial forecasting, automated communications
5. **Kennel Club API integration** — breed verification, qualification tracking

### Long-term Vision
1. **Become the KC's preferred entry partner** (displacing Fosse Data's aging system)
2. **International expansion** — the same problems exist in other KC-affiliated countries
3. **Marketplace** — connect exhibitors with handlers, groomers, accommodation
4. **Data and insights** — breed popularity trends, show attendance analytics, judging patterns

---

## Sources

- [Zooza](https://zooza.com/) — Platform website and entry guide
- [Fosse Data Systems](https://www.fossedata.co.uk/) — Services, history, FAQs
- [Higham Press](https://www.highampress.co.uk/) — Services and show information
- [Online Show Entry](https://www.onlineshowentry.com/) — Platform
- [Have A Dog Day](https://www.haveadogday.co.uk/) — Services and pricing
- [Dog Show Central UK](https://www.dogshowcentral.co.uk/) — Subscription details
- [My Dog Shows](https://www.mydogshows.co.uk/) — Platform features
- [The Royal Kennel Club](https://www.royalkennelclub.com/) — Find a Show, annual reports
- [Champdogs Forum](https://forum.champdogs.co.uk/) — Exhibitor discussions on Fosse Data, Higham Press, online entries
- [UK Pet Forums](https://www.petforums.co.uk/) — Exhibitor complaints and reviews
- [Arena Print](https://shows.arenaprint.co.uk/) — Zooza-powered entry system
- [MBJ Print](https://www.mbjprint.co.uk/) — Zooza-powered entry system
- [Ranker Blog - Fosse Data](https://rankerblog.co.uk/blog/fosse-data/) — Feature analysis
