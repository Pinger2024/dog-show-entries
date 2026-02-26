# Dog Show Domain Analysis

> Comprehensive research into dog show rules, classes, entry processes, and kennel club requirements across UK, US, and international governing bodies.

---

## Table of Contents

1. [Types of Dog Shows](#1-types-of-dog-shows)
2. [Standard Classes & Eligibility](#2-standard-classes--eligibility)
3. [The Entry Process](#3-the-entry-process)
4. [Entry Form Data Model](#4-entry-form-data-model)
5. [Kennel Club Requirements](#5-kennel-club-requirements)
6. [Show Scheduling & Organisation](#6-show-scheduling--organisation)
7. [Judging Structure & Awards](#7-judging-structure--awards)
8. [Breed Groups](#8-breed-groups)
9. [Not For Competition (NFC) Entries](#9-not-for-competition-nfc-entries)
10. [Multi-Dog Entries & Handler Requirements](#10-multi-dog-entries--handler-requirements)
11. [Key Regulations & Compliance](#11-key-regulations--compliance)
12. [Crufts Qualification](#12-crufts-qualification)
13. [Domain Model Summary](#13-domain-model-summary)

---

## 1. Types of Dog Shows

### UK (The Kennel Club / Royal Kennel Club)

| Show Type | Description | Entry | Eligibility |
|-----------|-------------|-------|-------------|
| **Companion / Exemption** | Informal, entry-level shows. Fun classes like "Waggiest Tail" alongside pedigree classes. | Pay on the day | Pedigree and crossbreeds welcome |
| **Primary** | Small, informal shows for newer exhibitors. Limited classes. | Advance entry | Society members; KC registered pedigree dogs |
| **Limited** | Restricted by geography or club membership. Dogs that have won a CC or equivalent champion title are **not eligible**. | Advance entry (online/postal) | Society members only; KC registered pedigree dogs |
| **Open** | Open to all registered pedigree dogs. First step to serious showing. Relaxed atmosphere. | Advance entry (online/postal) | All KC registered pedigree dogs |
| **Premier Open** | Enhanced open shows with expanded breed classes. 1st-4th in Adult/Puppy Groups qualifies for Crufts. | Advance entry | All KC registered pedigree dogs |
| **Championship** | Most prestigious. Multi-day events organised by breed group. Challenge Certificates (CCs) on offer. Dogs allocated benches. | Advance entry (online/postal) | All KC registered pedigree dogs |

### Show Scope Variants

- **Single Breed Show**: Open to one breed only (e.g., "The Pointer Club Championship Show")
- **Group Show**: Open to one of the seven breed groups (e.g., Hound Group Show)
- **General Show**: Open to all breeds across all groups
- **Breed Club Show**: Run by a breed-specific club, can be any level (limited, open, championship)

### US (AKC)

| Show Type | Description |
|-----------|-------------|
| **All-Breed Show** | Open to all AKC-registered breeds |
| **Specialty Show** | Limited to a single breed, run by the breed's parent club or local club |
| **Group Show** | Limited to breeds within one AKC group |

### International (FCI)

| Show Type | Description |
|-----------|-------------|
| **CACIB Show** | International shows where the Certificat d'Aptitude au Championnat International de Beauté is on offer |
| **CAC Show** | National certificate shows |
| **World Dog Show** | Annual FCI championship event |

---

## 2. Standard Classes & Eligibility

### UK Kennel Club Classes (F Regulations)

#### Age-Based Classes

| Class | Age Requirement |
|-------|----------------|
| **Baby Puppy** | 4 months and under 6 months (introduced recently for socialisation) |
| **Minor Puppy** | 6 months and not exceeding 9 calendar months on the first day of the show |
| **Puppy** | 6 months and not exceeding 12 calendar months |
| **Junior** | 6 months and not exceeding 18 calendar months |
| **Yearling** | 12 months and not exceeding 24 calendar months |
| **Veteran** | Not less than 7 years of age |

#### Achievement/Experience-Based Classes

| Class | Eligibility Criteria |
|-------|---------------------|
| **Maiden** | Has not won a CC, CAC/CACIB, or any first prize at Open/Championship shows (puppy classes excluded) |
| **Novice** | Has not won a CC or 3+ first prizes at Open/Championship shows (puppy classes excluded) |
| **Undergraduate** | Has not won a CC or 3+ first prizes at Championship shows in Undergraduate, Graduate, Post Graduate, Minor Limit, Mid Limit, Limit, or Open classes |
| **Graduate** | Has not won a CC or 4+ first prizes in Graduate through Open classes at Championship shows |
| **Post Graduate** | Has not won a CC or 5+ first prizes in Post Graduate through Open classes at Championship shows |
| **Minor Limit** | Has not become a Show Champion, won 3+ CCs/CACIB/CAC, or won 2+ first prizes at Championship shows in Minor Limit, Mid Limit, Limit, or Open classes |
| **Mid Limit** | Has not become a Show Champion, won 3+ CC/CACIB/CAC/Green Stars, or 5+ first prizes at Championship shows |
| **Limit** | Has not become a Show Champion, won 3+ CACIB/CAC, or 7+ first prizes at Championship shows in Limit or Open classes (confined to breed, where CCs offered) |
| **Open** | Open to **all** dogs of the breed eligible for entry at the show — no restrictions |

#### Special Classes

| Class | Description |
|-------|-------------|
| **Special Beginners** | Handler/owner has never won a CC or Reserve CC at Championship shows |
| **Any Variety Not Separately Classified (AVNSC)** | For breeds without separate breed classes at that show |
| **Brace** | Two dogs of the same breed shown together |
| **Team** | Usually four dogs of the same breed |

### Key Rules

- Dogs can enter **multiple classes** at the same show — exhibitors are not limited to one class
- Class eligibility is based on wins **prior to the closing date** of entries
- Entering the wrong class (over/under-qualified) risks **disqualification of awards** and **fines of £50-£300**
- Minimum age for exhibition: **6 calendar months** on the first day of the show

### AKC Regular Classes (US)

| Class | Description |
|-------|-------------|
| **Puppy** | 6 months and under 12 months; may be divided (6-9 months, 9-12 months) |
| **12-18 Months** | Self-explanatory age class |
| **Novice** | Has not won 3 first prizes in Novice class, or any points toward championship |
| **Amateur-Owner-Handler** | Must be handled by registered owner; handler cannot be a professional |
| **Bred By Exhibitor** | Exhibited by owner who is also the breeder; not yet a champion |
| **American-Bred** | Sire and dam mated in America; dog born in America |
| **Open** | Any dog eligible; only regular class open to Champions |

### FCI Classes (International)

| Class | Age | CACIB Eligible? |
|-------|-----|-----------------|
| **Minor Puppy** | Up to 6 months | No |
| **Puppy** | 6-9 months | No |
| **Junior** | 9-18 months | No |
| **Intermediate** | 15-24 months | **Yes** |
| **Open** | 15 months+ | **Yes** |
| **Working** | 15 months+ (with working certificate) | **Yes** |
| **Champion** | 15 months+ (with champion title) | **Yes** |
| **Veteran** | 8 years+ | No |

---

## 3. The Entry Process

### UK Entry Workflow

```
1. Obtain Schedule
   └── From show secretary, ringcraft club, or online (Higham Press / Fosse Data / dog.biz)

2. Review Schedule
   ├── Check judges assigned to your breed
   ├── Check available classes and eligibility
   ├── Note closing date for entries
   └── Note venue, date, and entry fees

3. Complete Entry Form
   ├── Dog details (registered name, breed, sex, DOB, sire, dam, breeder, KC reg number)
   ├── Owner/exhibitor details
   ├── Select class(es) to enter
   └── Sign declaration (no infectious disease, agreement to regulations)

4. Submit Entry + Payment
   ├── Online: via Higham Press (dog.biz), Fosse Data, or other online entry system
   ├── Postal: Send completed form + cheque to show secretary
   └── Must be received BEFORE closing date

5. Entry Confirmation
   ├── Receive confirmation email/letter
   └── Entry details appear in show catalogue

6. Show Day
   ├── Arrive and find your bench (championship shows) or ring area
   ├── Collect/find ring number card
   └── Report to ring when breed/class is called
```

### Key Entry Constraints

- **Payment in advance** for all shows except Companion shows (pay on the day)
- **Closing dates** are strict — no late entries accepted
- **No changes or cancellations** after closing date unless communicated before deadline
- **Ownership must be accurate** — dog entered in name of actual owner at time of entry close
- **Transfer of ownership**: if dog changes hands after entry, application to KC must be made within 7 days of the show

### Online Entry Systems (UK)

| Provider | Platform | Role |
|----------|----------|------|
| **Higham Press** | dog.biz | Major online entry provider; schedule publishing; catalogue printing |
| **Fosse Data** | fossedata.co.uk | Online entries; show data management; supports Crufts |
| **Online Show Entry** | onlineshowentry.com | Alternative online entry platform |

These systems allow:
- Account creation with stored dog/owner details for quick re-entry
- Selection of show, breed, and classes
- Secure online payment
- Confirmation emails
- Data feed to show printers for catalogue production

### AKC Entry Process (US)

- Entries close **2.5 weeks** before the show
- Submit to superintendent or show secretary by mail or online
- Superintendents (e.g., InfoDog, Onofrio, BaRay) handle entries and show logistics
- Entry form requires more detailed pedigree information than UK

---

## 4. Entry Form Data Model

### UK Entry Form Fields

#### Dog Information
| Field | Description | Required |
|-------|-------------|----------|
| **Registered Name** | Full KC registered name (exactly as on certificate) | Yes |
| **KC Registration Number** | Unique identifier | Yes |
| **ATC Number** | Authorisation to Compete (overseas dogs only) | Conditional |
| **Breed** | Official KC breed name (not abbreviation) | Yes |
| **Sex** | D (Dog/Male) or B (Bitch/Female) | Yes |
| **Date of Birth** | As per KC registration | Yes |
| **Sire** | Father's registered name | Yes |
| **Dam** | Mother's registered name | Yes |
| **Breeder** | Name as on registration/pedigree | Yes |

#### Owner/Exhibitor Information
| Field | Description | Required |
|-------|-------------|----------|
| **Owner Name(s)** | Full name of registered owner(s) | Yes |
| **Address** | Contact address | Yes |
| **Telephone** | Contact number | Yes |
| **Email** | For confirmations | Recommended |

#### Entry Details
| Field | Description | Required |
|-------|-------------|----------|
| **Class Number(s)** | Which classes to enter (can be multiple) | Yes |
| **Not For Competition** | NFC entry flag | Optional |

#### Declarations
| Field | Description | Required |
|-------|-------------|----------|
| **Signature** | Agreement to KC regulations | Yes |
| **Health Declaration** | Dog free from infectious/contagious disease for 21 days prior | Yes |

### AKC Entry Form Fields (US)

All UK fields plus:
| Field | Description |
|-------|-------------|
| **Variety** | For breeds with varieties (e.g., Cocker Spaniel colours) |
| **Place of Birth** | Domestic or foreign |
| **Sire Registration Number** | AKC reg of sire |
| **Dam Registration Number** | AKC reg of dam |
| **Agent Name** | If using a professional handler |
| **Junior Handler Number** | For junior showmanship entries |

---

## 5. Kennel Club Requirements

### The Kennel Club (UK)

- Dog **must be registered** on the KC Breed Register
- Only **pedigree dogs** eligible for licensed shows (crossbreeds OK for companion shows)
- Minimum age: **6 months** on first day of show
- Dog must be owned by the person entering (or co-owned)
- Owner must not be disqualified or suspended by KC
- Dog must not be suffering from any infectious or contagious disease
- Dog must not have been exposed to anything contagious in the **21 days** before the show
- Bitches in season: rules vary by show type; generally not permitted at indoor shows
- Docked tails: restrictions apply depending on when/where docked

### AKC (US)

- Dog must be AKC registered or have a Purebred Alternative Listing (PAL) number
- Minimum age: **6 months**
- Dog must not be spayed/neutered for conformation (but allowed for performance events)
- Must be entered in name of actual owner
- Blind, deaf, castrated, spayed, or altered dogs are disqualified from conformation
- Dogs with disqualifying faults per breed standard are ineligible

### FCI (International)

- Dog must be registered in an FCI-recognised studbook/pedigree book
- Double entries and late entries are **not permitted**
- Dogs and bitches entered separately
- Age determined by the day the dog is shown
- Only dogs rated "Excellent 1" eligible for CACIB consideration

---

## 6. Show Scheduling & Organisation

### Championship Show Structure (UK)

- **Multi-day events**: Typically 4 days, organised by breed group
  - Day 1: e.g., Gundog and Toy groups
  - Day 2: e.g., Working and Pastoral groups
  - Day 3: e.g., Terrier and Hound groups
  - Day 4: e.g., Utility group + Best in Show
- **Benching**: Dogs allocated bench space; exhibitors can find each other via catalogue/bench numbers
  - Benching requirement relaxed from 2023 (trial period for exemptions)
- **Ring allocation**: Each breed assigned to a specific ring with a designated judge
- **Judging order**: Classes judged in order (typically Minor Puppy through Open, dogs first then bitches)

### Ring Operations

- **Ring size**: Minimum 40 x 50 feet (AKC standard)
- **Judging speed**: Approximately 2 minutes per dog
- **Catalogue/judging programme**: Lists judges, breeds, rings, start times, and entry counts
- **Ring stewards**: Assist the judge, call dogs, maintain order
- **Dogs called in catalogue order** within each class

### Scheduling Flow

```
Ring Opens
  └── Class 1 (e.g., Minor Puppy Dogs)
        └── Judge places 1st-5th
  └── Class 2 (e.g., Puppy Dogs)
        └── Judge places 1st-5th
  └── ... (all dog classes)
  └── Challenge Certificate (Dog)
        └── All unbeaten dogs compete; CC awarded if quality warrants
        └── Reserve CC (Dog) also awarded
  └── Class 1 (e.g., Minor Puppy Bitches)
  └── ... (all bitch classes)
  └── Challenge Certificate (Bitch)
        └── CC and Reserve CC (Bitch) awarded
  └── Best of Breed
        └── CC Dog vs CC Bitch
        └── Winner represents breed in Group judging
  └── Best Puppy in Breed
```

### AKC Show Schedule

- Males (dogs) judged first across all classes
- Females (bitches) judged second
- Winners Dog and Winners Bitch selected
- Best of Breed/Variety competition
- Group judging
- Best in Show
- **Limit**: 100 entries per ring per judge per day

---

## 7. Judging Structure & Awards

### UK Championship Show Awards Hierarchy

```
Individual Classes (1st-5th placement)
  │
  ├── Best Dog → Challenge Certificate (CC) — if quality warrants
  │                └── Reserve CC (Dog)
  │
  ├── Best Bitch → Challenge Certificate (CC) — if quality warrants
  │                 └── Reserve CC (Bitch)
  │
  └── Best of Breed (CC Dog vs CC Bitch)
        │
        └── Group Judging (7 groups)
              │ └── Group 1st, 2nd, 3rd, 4th
              │
              └── Best in Show (from 7 group winners)
                    └── Reserve Best in Show

  Best Puppy in Breed → Best Puppy in Group → Best Puppy in Show
  Best Veteran in Breed → Best Veteran in Group → Best Veteran in Show
```

### Challenge Certificate (CC)

- Awarded at **Championship shows only**
- Only awarded if the judge considers the dog "of such outstanding merit as to be worthy of the title of Champion"
- Judge may **withhold** the CC if no dog of sufficient quality
- A dog becomes a **Show Champion** with **3 CCs under 3 different judges**, with at least one CC awarded when the dog was over 12 months of age

### Stud Book Numbers

- Awarded for various achievements at Championship shows
- Each breed assigned to one of **5 Stud Book Bands** with different qualifying criteria
- Can be earned via: CC, Reserve CC, high placements (varies by band), Junior Warrant, field trial wins, etc.

### Junior Warrant

- Requires **25 points** between ages 6-18 months
- Minimum 3 points at Championship shows (where CCs offered)
- Minimum 7 points at Open shows or Championship shows (where CCs not offered)

### AKC Championship Points

- **15 points** required, including **two majors** (3-5 point wins)
- Majors must be won under at least **3 different judges**
- Points awarded based on number of dogs competing (varies by breed, sex, region)

### FCI Awards

- **CACIB**: Certificat d'Aptitude au Championnat International de Beaute — only for "Excellent 1" in intermediate, open, working, champion classes
- One CACIB per sex, per breed, per show
- **FCI International Champion**: Requires CACIBs in multiple countries under different judges

---

## 8. Breed Groups

### UK Kennel Club — 7 Groups

| Group | Description | Example Breeds |
|-------|-------------|----------------|
| **Gundog** | Bred for hunting — retrievers, pointers, setters, spaniels | Labrador Retriever, English Springer Spaniel, Golden Retriever |
| **Hound** | Natural hunters — sighthounds and scenthounds | Beagle, Greyhound, Dachshund, Whippet |
| **Pastoral** | Herding and livestock management dogs | Border Collie, German Shepherd, Old English Sheepdog |
| **Terrier** | Small game hunters, vermin control | Jack Russell, Bull Terrier, West Highland White |
| **Toy** | Companion dogs, smallest breeds | Chihuahua, Cavalier King Charles Spaniel, Pug |
| **Utility** | Diverse group — doesn't fit other categories | Bulldog, Dalmatian, Poodle, Shih Tzu |
| **Working** | Guard dogs, search & rescue, sled dogs | Boxer, Rottweiler, Dobermann, Great Dane |

### AKC — 7 Groups

| Group | Notes |
|-------|-------|
| **Sporting** | Equivalent to UK Gundog |
| **Hound** | Similar to UK |
| **Working** | Similar to UK |
| **Terrier** | Similar to UK |
| **Toy** | Similar to UK |
| **Non-Sporting** | Equivalent to UK Utility |
| **Herding** | Equivalent to UK Pastoral |

Plus: **Miscellaneous** (breeds seeking full recognition) and **Foundation Stock Service** (rare breeds)

### FCI — 10 Groups

| Group | Description |
|-------|-------------|
| 1 | Sheepdogs and Cattledogs |
| 2 | Pinscher and Schnauzer, Molossoid, Swiss Mountain and Cattledogs |
| 3 | Terriers |
| 4 | Dachshunds |
| 5 | Spitz and Primitive Types |
| 6 | Scenthounds and Related Breeds |
| 7 | Pointing Dogs |
| 8 | Retrievers, Flushing Dogs and Water Dogs |
| 9 | Companion and Toy Dogs |
| 10 | Sighthounds |

---

## 9. Not For Competition (NFC) Entries

### Purpose
- Allow dogs to attend shows and enter the ring **without competing** for awards
- Used for socialisation, training, and ring experience for young or inexperienced dogs
- Also used for veteran dogs returning to the ring environment

### UK Rules
- Show societies **may accept** NFC entries at their discretion — not all shows offer NFC
- **Age**: Puppies from **4 calendar months** old may enter NFC at KC licensed events (lower than the 6-month minimum for competition)
- NFC dogs **do not compete** and **cannot win** any award
- NFC entries appear in the catalogue
- NFC entry fees are typically lower than competitive entries
- The dog still must be KC registered

### AKC Rules
- Dogs may be entered "For Exhibition Only" (equivalent to NFC)
- Must still meet basic registration and health requirements

---

## 10. Multi-Dog Entries & Handler Requirements

### Multiple Entries per Exhibitor

- **UK**: An exhibitor can enter **multiple dogs** at the same show
  - Each dog is a separate entry with its own classes and fees
  - Same exhibitor details, different dog details
  - At championship shows, dogs may be scheduled on different days (by breed group)
  - Exhibitor may need to be in different rings at overlapping times — common challenge

- **AKC**: Same owner can enter multiple dogs
  - May use professional handlers for dogs they cannot personally show
  - If showing multiple dogs, scheduling conflicts possible

### Handler Requirements

#### UK
- No formal handler licensing requirement
- Owner can handle their own dogs or ask someone else to handle
- Professional handlers exist but are less common than in the US
- Junior handling classes available for young handlers (6-17)

#### AKC
- **Amateur-Owner-Handler Class**: Must be handled by registered owner; handler cannot be/have been a professional handler
- **Professional handlers**: Licensed by AKC, commonly used
- **Junior Showmanship**: For handlers ages 9-18, judged on handling ability not dog quality
- **National Owner-Handled Series (NOHS)**: Special competition track for owner-handled dogs; handler must be owner of record

#### Brace & Team Entries
- **Brace**: Two dogs of the same breed, moving in unison; must share at least one common owner
- **Team**: Usually four dogs of the same breed

---

## 11. Key Regulations & Compliance

### Entry Regulations

| Rule | UK (KC) | AKC | FCI |
|------|---------|-----|-----|
| **Registration required** | Yes (KC Breed Register) | Yes (AKC or PAL) | Yes (FCI-recognised studbook) |
| **Minimum age** | 6 months (4 months for NFC) | 6 months | Varies by class (6-15 months) |
| **Late entries accepted** | No | No | No |
| **Entry changes after close** | No (except limited transfers) | Limited corrections before judging | No |
| **Payment** | In advance | In advance | In advance |
| **Intact dogs required** | Yes (conformation) | Yes (conformation) | Yes |
| **Health declaration** | Yes (21-day disease-free) | Yes | Yes |

### 2025 UK Regulation Changes

- Best in Show scheduling now flexible (can be final event of the day)
- 9-month minimum interval for Best Puppy in Show appointments at championship shows
- Undergraduate class definition clarified
- Show licenses must be applied for and paid **12 months** in advance (changed from 6 weeks)
- Handler contact details must be provided upon request during investigations
- Appeals must be lodged within **14 days**
- Fines for incorrect class entry: **£50-£300**

### Penalties for Non-Compliance

- Awards disqualified for entering incorrect classes
- Fines imposed by KC
- Suspension from showing
- Registration records can be marked with "incident recorded"
- Event participation restrictions for conduct violations

---

## 12. Crufts Qualification

### Qualification Period
- Typically runs January to January (e.g., 20 Jan 2025 to 19 Jan 2026 for Crufts 2026)

### Routes to Qualify

1. **Best of Sex / Reserve Best of Sex** at any Championship Show during qualification period
2. **1st-4th in Group/Puppy Group** at a Premier Open Show
3. **Best in Show / Reserve BIS / Best Puppy in Show** at a General or Group Open Show
4. **Overseas Champions** — all overseas champions eligible (expanded from 2026)
5. **Breed-specific qualifications** — vary by breed, defined annually by KC

### Special Breed Requirements (from 2026)
- Bulldogs, French Bulldogs, and Pugs must have a **Grade 1** Respiratory Function Grading (RFG) assessment — Grade 2 or 3 dogs are **not eligible** for Crufts

---

## 13. Domain Model Summary

### Core Entities

```
Show
  ├── Show Type (Championship, Open, Limited, etc.)
  ├── Show Scope (Breed, Group, General)
  ├── Show Society (organising body)
  ├── Venue
  ├── Date(s)
  ├── Closing Date
  ├── Schedule (days, rings, judges, breeds, times)
  ├── Classes Offered (per breed)
  └── Entries

Dog
  ├── Registered Name
  ├── Registration Number (KC/AKC/FCI)
  ├── Breed
  ├── Sex
  ├── Date of Birth
  ├── Colour
  ├── Sire (name + reg number)
  ├── Dam (name + reg number)
  ├── Breeder
  ├── Owner(s)
  ├── Achievements (CCs, placements, stud book number, titles)
  └── Class Eligibility (computed from achievements + age)

Owner / Exhibitor
  ├── Name
  ├── Address
  ├── Contact Details (phone, email)
  ├── KC Account / Membership
  └── Dogs (1:many)

Entry
  ├── Show
  ├── Dog
  ├── Owner/Exhibitor
  ├── Classes Entered (1:many)
  ├── Handler (if different from owner)
  ├── NFC Flag
  ├── Payment Status
  ├── Entry Date
  └── Catalogue/Exhibit Number (assigned by show)

Class
  ├── Name (Minor Puppy, Open, etc.)
  ├── Type (Age-based / Achievement-based / Special)
  ├── Eligibility Rules
  ├── Breed (or AVNSC)
  ├── Sex (Dog/Bitch)
  └── Entries (1:many)

Judge
  ├── Name
  ├── KC Number
  ├── Breeds Approved
  └── Assignments (Show + Breed + Ring)

Ring
  ├── Number
  ├── Show Day
  ├── Judge
  ├── Breeds Assigned
  └── Time Slots

Result / Placement
  ├── Show
  ├── Class
  ├── Dog
  ├── Placement (1st-5th, or CC/RCC/BOB/BIS etc.)
  └── Judge
```

### Key Business Rules

1. **Class eligibility** is computed from dog's age (at show date) and achievement history (at entry close date)
2. **An entry** = one dog + one or more classes + payment
3. **One exhibitor** can have multiple entries (multiple dogs) at the same show
4. **Closing dates** are absolute — no late entries
5. **Entry fees** vary by show and number of classes; multi-class discounts may apply
6. **Catalogues** are generated from entry data — accuracy of registered names is critical
7. **Results flow upward**: Class → Best of Sex → CC → Best of Breed → Group → Best in Show
8. **NFC entries** are separate from competitive entries but still appear in catalogue
9. **Show scheduling** maps breeds to days, rings, judges, and time slots
10. **Stud book eligibility** and **Crufts qualification** are downstream of results tracking

### Data Integrity Requirements

- Registered names must **exactly match** KC records
- Registration numbers must be valid and current
- Class eligibility must be automatically validated where possible
- Ownership records must reflect actual owner at entry close
- Payment must be confirmed before entry is accepted
- 21-day health declaration is a legal requirement

---

*Research compiled from: The Kennel Club (thekennelclub.org.uk / royalkennelclub.com), American Kennel Club (akc.org), FCI (fci.be), Higham Press, Fosse Data, Champdogs, and various breed club resources.*
