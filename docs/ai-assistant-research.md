# AI Assistant Integration Research for Remi

**Date:** 2026-03-12
**Purpose:** Evaluate AI integration patterns from leading SaaS products and assess applicability to Remi (niche B2B dog show management platform).

---

## 1. Product-by-Product Analysis

### 1.1 Notion AI

**What it can do:**
- **Read-only:** Search across workspace + connected apps (Slack, Google Drive, GitHub), summarise pages, generate reports via "Research Mode", transcribe and summarise meetings
- **Actions:** Custom Agents can create/edit pages, modify databases, update properties. Can automate recurring tasks on schedules or triggers (e.g., "every Monday, compile a sprint summary")
- **Writing:** Inline AI blocks for drafting, editing, and improving text within documents

**UI presentation:**
- **Chat panel** — conversational interface with the Notion Agent (side panel)
- **Inline blocks** — AI writing assistance directly within page content (slash command or highlight-to-improve)
- **Custom Agents** — configured automations that run on triggers/schedules (more like background workers than UI)
- **Meeting capture** — automatic transcription without a bot joining the call

**Guardrails:**
- Admin-controlled permissions: who can create Custom Agents, what data AI can access
- Agents can be disabled at any time for controlled rollouts
- Enterprise deployments have zero data retention with AI subprocessors
- Contractual guarantees that customer data is not used for model training

**Pricing:**
- Add-on: ~£8.50/month per user (£84/year) for full Notion AI
- Enterprise plans: Agent, AI Meeting Notes, Enterprise Search included
- Custom Agents use a credit system (purchased separately by admins)
- Free trial through May 2026, paid from May 4, 2026

**Key takeaway for Remi:** The inline + chat + background automation trifecta is the gold standard. But Notion can justify this because every user interacts with AI daily. Remi's users interact infrequently (a few shows per year), making per-user AI pricing challenging.

---

### 1.2 Linear (Project Management)

**What it can do:**
- **Triage Intelligence:** Automatically merges duplicate requests, classifies issues, keeps backlogs clean
- **AI Filters:** Natural language queries to find issues ("show me all unresolved bugs from this sprint")
- **Agent platform:** Delegates coding tasks to external agents (Claude Code, Codex, Cursor, GitHub Copilot) with full issue context
- **Auto-generated content:** Email subject line generation, automatic video captions indexed for search
- **Issue summaries:** AI-generated summaries of issue discussions
- **Cross-platform intelligence:** Converts customer conversations from Slack/Intercom/Zendesk/Gong into actionable issues

**UI presentation:**
- AI features are deeply embedded in the existing UI (not a separate chat panel)
- Agent activity appears in an "agent activity panel" showing reasoning steps
- Natural language filter bar replaces complex filter builders
- Triage happens automatically in the background

**Guardrails:**
- Agent work produces PRs for human review before merging
- Users can "steer" agents further or review their output
- Triage suggestions can be accepted or overridden

**Pricing:**
- AI is included in ALL plans (including Free)
- Free plan: Agent platform, MCP access, Linear Agent for Slack, Triage Intelligence
- Business plan adds: Issue discussion summaries
- Enterprise: Advanced Linear Asks
- No per-use or credit-based AI charges

**Key takeaway for Remi:** Linear's approach of embedding AI invisibly into existing workflows (auto-triage, smart search, background deduplication) is the most relevant pattern for Remi. Secretaries don't want to "chat with AI" — they want their tools to be smarter. Including AI in the base price removes adoption friction.

---

### 1.3 Intercom Fin (AI Customer Support)

**What it can do:**
- **Resolution-focused:** Resolves up to 65% of customer queries end-to-end without human intervention
- **Multi-channel:** Works across chat, email, voice, and social media
- **Actions:** Can "take actions and deliver personalized answers" — though specific action capabilities (refunds, account modifications) require custom configuration through their Actions framework
- **Training:** Learns from your procedures, knowledge base, and policies
- **Escalation:** Hands off to human agents when it can't resolve, following existing routing rules
- **The Fin Flywheel:** Train → Test → Deploy → Analyse → improve cycle

**UI presentation:**
- Customer-facing chat widget / email responder
- Internal dashboard showing AI-powered insights and conversation analysis
- Simulated testing environment before live deployment

**Guardrails:**
- Accuracy validation layer in the "Fin AI Engine" (6 optimization layers)
- Built-in human escalation for complex/sensitive issues
- Testing phase with simulated conversations before going live
- ISO 27001, 27018, 27701, GDPR, CCPA compliant
- Follows your existing assignment rules and automations

**Pricing:**
- **$0.99 per resolution** (outcome-based, not per-seat)
- Available on all Intercom plans
- Works with external helpdesks (Zendesk, Salesforce) for same price
- 50 resolutions/month minimum when used standalone
- No setup or integration fees

**Key takeaway for Remi:** The per-resolution pricing model is brilliant for low-volume products. If Remi built an AI assistant for exhibitor support (answering "Am I eligible for this class?" or "What do I need to enter?"), per-query pricing would keep costs proportional to actual usage. However, Remi's volume is too low to justify building a Fin-style system — the existing feedback loop with Amanda handles support well.

---

### 1.4 HubSpot Breeze AI

**What it can do (based on public documentation):**
- **Breeze Copilot:** CRM-aware assistant that can draft emails, summarise contact records, suggest next actions, create tasks — available across the HubSpot UI
- **Breeze Agents:** Specialised AI agents for different functions:
  - Customer Agent: handles support queries
  - Content Agent: generates blog posts, social content, landing pages
  - Prospecting Agent: researches leads, drafts outreach emails
  - Social Agent: manages social media posting and engagement
- **Breeze Intelligence:** Data enrichment, buyer intent scoring, form shortening (auto-fills known data)

**UI presentation:**
- Copilot appears as a persistent sidebar chat across the entire CRM
- Agents run autonomously in their domains (customer support, content creation, etc.)
- Intelligence features are embedded invisibly (auto-enrichment, scoring)

**Guardrails:**
- Agents draft content for human review before sending
- Actions are suggested, not automatically executed
- Enterprise-grade data handling

**Pricing:**
- Breeze Copilot: included in all HubSpot plans
- Breeze Agents: included in Professional and Enterprise tiers
- Breeze Intelligence: usage-based credits (data enrichment credits purchased separately)
- HubSpot plans range from $0 (free CRM) to $3,600+/month (Enterprise)

**Key takeaway for Remi:** The "intelligence" tier is most applicable — invisible AI that enriches data and makes forms smarter. The form-shortening feature (pre-filling known data, reducing form fields for returning users) is directly relevant to the show entry flow.

---

### 1.5 Shopify Magic / Sidekick

**What it can do:**
- **Sidekick (chat assistant):** Pulls performance data, offers ecommerce advice, brainstorms ideas, answers store-specific questions using store data
- **Shopify Magic (embedded AI):** Product description generation, SEO optimisation, email campaign creation, product image background editing, FAQ answer suggestions, email send-time optimisation, customer chat response suggestions
- **Data analysis:** Connects data points to uncover opportunities, surface insights from sales and traffic data

**UI presentation:**
- Sidekick: conversational chat panel in the Shopify admin
- Magic features: marked with star icons (✨) throughout the admin interface at point of use
- Inline AI: appears contextually where you're already working (product editor, email composer, image editor)
- Available on mobile admin app as well

**Guardrails:**
- AI-generated content is presented as suggestions for merchant review
- Email subject lines and content are "suggested" with implied review before sending
- Shopify's existing security architecture applies
- Limited detail on explicit confirmation dialogs for actions

**Pricing:**
- **Free for all Shopify merchants** regardless of subscription plan
- Available across all tiers (Basic $39/mo through Plus $2,300/mo)
- No per-use charges, no credits

**Key takeaway for Remi:** Shopify's approach of making AI free and ubiquitous (marked with ✨ icons) is aspirational but only possible at Shopify's scale. The inline contextual pattern (AI appearing right where you're working, not in a separate chat) is the right model for Remi. Think: AI suggestions appearing in the show creation form, not a separate "Ask Remi AI" chat.

---

### 1.6 Stripe AI / Developer Tools

**What it can do:**
- **VS Code AI Assistant:** Answers Stripe API questions, provides customised code recommendations, follow-up queries
- **Model Context Protocol (MCP) server:** AI agents can interact with the Stripe API directly
- **Agent Toolkit SDK:** Build agentic software that creates Stripe objects, processes payments
- **Documentation as AI-ready content:** `/llms.txt` file, markdown-formatted docs for LLM consumption
- **Task-specific LLM instructions:** Guidance for AI on integration best practices and API upgrades

**UI presentation:**
- IDE integration (VS Code extension) rather than dashboard UI
- Developer-facing, not end-user-facing
- MCP/SDK approach: AI lives in the developer's tools, not in Stripe's dashboard

**Guardrails:**
- Agent tools operate within existing API permissions
- SDK-based approach means developers control what agents can do

**Pricing:**
- Developer tools are free
- API usage costs are standard Stripe fees

**Key takeaway for Remi:** Stripe's approach is developer-focused and not directly applicable to Remi's end users. However, the `/llms.txt` pattern (making your documentation AI-consumable) is interesting — Remi could publish RKC rules in a machine-readable format that an AI assistant could reference.

---

## 2. Specialised Research

### 2.1 AI in Events/Booking Management

**Current state of AI in event platforms:**
- **Bizzabo (Event Experience OS):** Offers "CoPLanner" AI assistant for event planning, AI-powered networking/business matching that connects attendees based on interests and goals
- **Gevme:** "EventGPT" for engagement, AI-powered networking modules
- **Cvent:** AI features for event marketing copy, attendee recommendations
- **Most platforms focus on:** content generation (event descriptions, email campaigns), attendee matchmaking, and basic analytics — NOT operational automation

**Gaps in the market:**
- No event platform has AI that truly understands regulatory compliance (permits, venue requirements, insurance)
- AI scheduling that accounts for complex constraints (judge availability, ring allocation, breed group conflicts) is virtually non-existent
- The dog show niche has zero AI tooling — everything is manual/spreadsheet/PDF-based

**Relevance to Remi:**
This is a massive opportunity. Dog show management has complex scheduling constraints (a judge can't judge the same breed at two shows within X days, ring schedules must not conflict, breed group ordering matters) that are perfect for AI optimisation. No competitor is doing this.

---

### 2.2 AI for Regulatory Compliance (RKC Rule Checking)

**The opportunity:**
RKC (Royal Kennel Club) rules are extensive and complex:
- Class eligibility depends on dog age, breeding status, previous wins, registration type
- Judge eligibility has distance and frequency constraints
- Show types (Open, Championship, Limited) each have different rule sets
- Entry validation requires cross-referencing dog records, handler records, and show schedules
- Post-nominals and titles affect class eligibility

**How AI could help:**
1. **Entry validation:** "This dog has won a CC — they're no longer eligible for the Novice class. Suggest Post-Graduate or above."
2. **Schedule checking:** "Judge A is already judging Alsatians at Show X on Oct 5. They can't judge Alsatians at your show within 14 days."
3. **Smart class suggestions:** When an exhibitor starts an entry, AI could suggest the most appropriate classes based on the dog's record.
4. **Rule explanation:** Natural language explanations of why an entry was accepted/rejected.

**Hallucination risk:**
This is the highest-risk area. RKC rules are:
- Precise and unambiguous (good for deterministic code, risky for probabilistic AI)
- Updated periodically (AI training data may be stale)
- Consequential (wrong eligibility = disqualification, wasted entry fees, angry exhibitors)

**Mitigation strategy:**
- **Never let AI make rule decisions alone.** Encode rules in deterministic code; use AI only for explanation and suggestion.
- **AI explains the rule engine's decisions** rather than making them. Example: the rule engine says "ineligible" and AI explains why in plain English.
- **Keep a versioned, machine-readable rule database** that both the rule engine and AI reference.
- **Always show the source rule** alongside AI explanations (e.g., "Per RKC Regulation F(1)(4)(e)...").

---

### 2.3 Conversational Form Filling

**The concept:**
Instead of a traditional multi-step form wizard for show creation or entry submission, users interact with an AI conversational interface that guides them through the process naturally.

**Current products in this space:**
- **Jotform AI Agents:** Multi-channel (SMS, voice, WhatsApp, chatbot, email) agents that guide users through form completion
- **Typeform:** Pioneered conversational forms (one question at a time) but not AI-powered
- **Feathery:** AI-powered form building with dynamic field logic

**Patterns that work:**
1. **Progressive disclosure through conversation:** "What breed is your dog?" → "How old are they?" → "Have they won any awards?" (each answer narrows subsequent questions)
2. **Pre-filling from known data:** If the user has dogs on file, skip registration questions entirely
3. **Validation in real-time:** "That class requires your dog to be under 12 months. Bonnie is 14 months. Would you like to enter Junior instead?"
4. **Context-aware help:** Instead of help icons and FAQ links, the AI explains each field as you reach it

**Applicability to Remi:**
- **Show creation (secretary):** A conversational flow could replace the current multi-step wizard: "I want to create an Open show for German Shepherds on September 15th" → AI scaffolds the entire show with sensible defaults, schedule, and classes
- **Entry submission (exhibitor):** "Enter Bonnie in the Clyde Valley Championship show" → AI looks up the dog, suggests eligible classes, handles payment
- **Risk:** Experienced users (who enter 10-20 shows/year) will find conversation slower than a well-designed form. Offer both modes.

---

### 2.4 AI-Powered Data Analysis with Small Datasets

**The challenge:**
Remi has hundreds of entries per show, not millions of transactions. Can AI provide meaningful insights?

**Yes, but differently than at scale:**

**What works with small datasets:**
1. **Pattern recognition across time:** "Entries for your Open shows have increased 23% year-over-year. The Puppy class has grown fastest."
2. **Comparative benchmarks:** "Your show had 127 entries. The average for Open GSD shows this year is 95. Above average."
3. **Anomaly detection:** "You have 3 entries from the same handler in the same class — is this intentional?"
4. **Predictive suggestions:** "Based on last year's entries, you'll likely need 4 rings. Last year you had 3 and ran 45 minutes over."
5. **Cross-referencing:** "These 5 exhibitors entered your last show but haven't entered this one yet. Want to send them a reminder?"

**What doesn't work with small datasets:**
- Complex statistical modelling (not enough data points)
- "Trending" analysis (too few events for meaningful trends)
- Personalised recommendations (each user has too few interactions)

**Cost-effective approaches:**
- Use cheap models (Claude Haiku at $1/MTok input, $5/MTok output) for structured analysis
- Pre-compute insights on the server (batch analysis after entries close, not real-time)
- Use AI for summarisation and explanation of data, not for the analysis itself (do the maths in code, have AI write the summary)

---

## 3. API Pricing Reference (for Cost Modelling)

### Anthropic Claude (current as of March 2026)
| Model | Input | Output | Best for |
|-------|-------|--------|----------|
| Claude Haiku 4.5 | $1/MTok | $5/MTok | High-volume, simple tasks (class suggestions, form help) |
| Claude Sonnet 4.6 | $3/MTok | $15/MTok | Balanced quality/cost (email drafting, summaries) |
| Claude Opus 4.6 | $5/MTok | $25/MTok | Complex reasoning (schedule optimisation, rule analysis) |

### Cost estimates for Remi
- **Eligibility check explanation** (~500 input + 200 output tokens): ~$0.001 with Haiku
- **Show summary generation** (~2,000 input + 500 output tokens): ~$0.01 with Sonnet
- **Schedule optimisation** (~5,000 input + 1,000 output tokens): ~$0.04 with Opus
- **Monthly cost at scale** (1,000 AI interactions/month): ~$1-10/month with Haiku, $10-50 with Sonnet

**Bottom line:** AI API costs are negligible for Remi's scale. The engineering cost of building the features is the real expense, not the API usage.

---

## 4. Answers to Key Questions

### What's the #1 most impactful AI feature for a show secretary (2-3 shows/year)?

**Smart Schedule Builder.**

A secretary's most time-consuming and error-prone task is building the show schedule: assigning breeds to rings, ordering classes, allocating judges, estimating timing. Currently this is done manually with spreadsheets and experience-based guesswork.

An AI-powered schedule builder would:
1. Take the show configuration (breeds, classes, entries, judges, rings, venue constraints)
2. Generate an optimised schedule accounting for all constraints
3. Let the secretary refine via conversation: "Move GSDs to Ring 1" / "Can we finish by 4pm?"
4. Flag conflicts: "Judge Smith is scheduled for two rings at 2pm"
5. Estimate timing based on historical data: "Ring 2 will likely run 30 minutes over based on entry counts"

This transforms hours of manual work into minutes and reduces costly scheduling errors.

### What's the #1 most impactful AI feature for an exhibitor (10-20 shows/year)?

**Smart Entry Assistant.**

An exhibitor entering many shows wastes time on repetitive data entry and worries about eligibility mistakes. The ideal AI feature:
1. Auto-suggests eligible classes when entering a show (based on dog's age, record, breed, show type)
2. Pre-fills entry forms from the dog's profile (no re-entering breed, registration, owner details)
3. Warns about eligibility issues before payment: "Bonnie won a CC at Leeds — she's no longer eligible for Novice at this show"
4. Proactively notifies about upcoming shows matching their breed/region: "3 GSD Championship shows within 50 miles in the next 3 months"
5. Tracks their show calendar: "You have entries in 2 shows on October 15th — is this intentional?"

Most of this doesn't require LLMs — it's deterministic logic with good UX. The AI layer adds natural language explanations and proactive suggestions.

### How do you justify AI costs for a niche SaaS with hundreds of users?

**You don't charge separately for AI. You make the product better and charge more for the product.**

The maths:
- API costs for Remi's volume: $10-50/month (negligible)
- Engineering cost: significant but one-time
- Revenue justification: If AI features let you charge £2-3 more per entry or £10-20 more per show subscription, the ROI is immediate

**The right pricing model for Remi:**
1. **Embed AI invisibly** — make forms smarter, add proactive warnings, auto-suggest classes. No "AI" branding needed.
2. **Include in the base price** — like Linear, not like Notion. Remi's user base is too small for AI to be a separate revenue line.
3. **Use the cheapest sufficient model** — Haiku for most tasks, Sonnet for summaries, Opus only for complex optimisation
4. **Batch processing where possible** — generate show insights after entries close, not in real-time

Avoid the trap of building a chatbot and calling it an "AI feature." The most valuable AI for Remi is invisible AI that makes existing workflows faster and less error-prone.

### What's the risk of AI hallucination with strict RKC rules?

**High risk if AI makes decisions. Low risk if AI explains decisions.**

The safe architecture:
```
[Deterministic Rule Engine] → makes the decision (eligible/ineligible)
[AI Layer] → explains the decision in plain English
[Source Attribution] → shows the specific RKC regulation
```

**Never:**
- Let AI determine eligibility on its own
- Trust AI to know current RKC rules (they change)
- Use AI output without showing the underlying rule reference

**Always:**
- Encode rules in versioned, testable code
- Use AI only for explanation, suggestion, and natural language interface
- Show the rule source alongside every AI explanation
- Have a "Report incorrect information" button on every AI-generated explanation

---

## 5. Recommended AI Feature Roadmap for Remi

### Phase 1: Invisible Intelligence (No AI branding needed)
- **Smart class suggestions** during entry: deterministic eligibility engine + Haiku for explanations
- **Entry form pre-filling** from dog/handler profiles (no AI needed, just good UX)
- **Proactive eligibility warnings** at entry time ("This dog is too old for Puppy class")
- **Show statistics dashboard** for secretaries (entry counts, breed breakdowns, year-over-year comparisons)

### Phase 2: AI-Enhanced Workflows
- **Natural language show search** for exhibitors ("Championship GSD shows near Glasgow in autumn")
- **Schedule optimisation assistant** for secretaries
- **Post-show summary generation** ("Your show had 142 entries across 12 breeds...")
- **Smart reminders** ("Entries close in 3 days for Clyde Valley — you entered last year")

### Phase 3: Conversational AI (Only if Phase 1-2 prove valuable)
- **Show creation assistant** for secretaries via conversation
- **Entry assistant** for less experienced exhibitors
- **RKC rule explainer** with source attribution
- **Feedback-to-feature pipeline** (AI triages and prioritises user feedback)

### Estimated costs:
- Phase 1: $5-20/month in API costs, 2-4 weeks engineering
- Phase 2: $20-50/month in API costs, 4-8 weeks engineering
- Phase 3: $50-100/month in API costs, 8-12 weeks engineering

---

## 6. Pattern Summary: What the Best Products Do

| Pattern | Who Does It | Applicable to Remi? |
|---------|-------------|---------------------|
| AI included in base price | Linear, Shopify | Yes — essential for small user base |
| Invisible/embedded AI (not a chatbot) | Linear, HubSpot Intelligence | Yes — highest impact approach |
| Inline contextual suggestions | Notion, Shopify Magic | Yes — at point of entry/scheduling |
| Per-resolution pricing | Intercom Fin | Interesting for support, but volume too low |
| Credit-based add-on | Notion Custom Agents | No — too complex for Remi's scale |
| Chat panel assistant | Notion, Shopify Sidekick | Maybe Phase 3 — not the starting point |
| AI for content generation | HubSpot, Shopify | Limited applicability (show descriptions, emails) |
| Background automation | Notion Custom Agents, Linear Triage | Yes — batch analysis, proactive alerts |
| Human-in-the-loop for actions | All products | Essential — especially for RKC compliance |

---

## 7. Final Recommendation

**Start with invisible AI that makes existing features smarter, not a visible AI chatbot.**

The products that get AI right (Linear, Shopify) embed it so deeply that users don't think "I'm using AI" — they think "this product is really smart." That's the goal for Remi.

The biggest bang for the buck:
1. **Deterministic eligibility engine** (not AI, but the foundation everything else builds on)
2. **AI-powered explanations** of eligibility decisions (Haiku, pennies per query)
3. **Smart schedule builder** for secretaries (saves hours per show)
4. **Proactive notifications** for exhibitors (increases entries, improves retention)

Total monthly API cost at full build-out: under $100/month. The real cost is engineering time, and the real value is making Remi indispensable rather than just functional.
