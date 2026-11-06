/**
 * RKC dog lookup via direct HTML fetch + parsing.
 *
 * The RKC Health Test Results Finder at royalkennelclub.com is server-rendered
 * HTML with consistent CSS classes, so we can fetch and parse it directly —
 * no Firecrawl, no LLM, no browser automation needed.
 *
 * A week of prod logs + live probes against the real site (2026-08-12)
 * established:
 *  - Search is token-exact with apostrophe-STYLE normalisation only: a
 *    straight or curly apostrophe both match, but a missing/extra apostrophe
 *    does not, and spelling isn't fuzzy at all. Real users burned 8 searches
 *    in 4 minutes cycling apostrophe/possessive variants by hand.
 *  - Registration numbers are NOT searchable and NOT published anywhere on
 *    the public pages — never surface them as a search hint.
 *  - RKC returns 503s occasionally, with no retry today.
 *  - The profile page has NO breeder field at all — the old
 *    extractProfileField(html, 'Breeder') could never succeed.
 */
import { BoundedCache } from '@/lib/bounded-cache';

export type KcDogResult = {
  registeredName: string;
  breed: string;
  sex: string;
  dateOfBirth: string;
  sire: string;
  dam: string;
  colour?: string;
  /** Dog ID from the RKC website — used to fetch the full profile page */
  dogId?: string;
};

export type KcDogProfile = {
  sire: string;
  dam: string;
  colour: string;
  registrationType?: string;
  inbreedingCoefficient?: string;
  /** The Kennel Club Studbook number shown on the profile page (distinct
   *  from Remi's own `kcRegNumber` — a different RKC identifier, only
   *  shown for dogs recorded "In The Kennel Club Studbook"). Display-only:
   *  there is no Remi field to save it into. */
  studbookNumber?: string;
  /** BVA/KC Hip Dysplasia result, formatted "left:right (total N)".
   *  Undefined when RKC has no record held for this dog. */
  hipScore?: string;
  /** BVA/KC Elbow Dysplasia result, same "left:right (total N)" shape. */
  elbowScore?: string;
  /** DNA - DM (CDRM) result, mapped onto the SV health card's dmTest
   *  vocabulary. Undefined when RKC has no record held, OR when RKC's
   *  wording didn't map cleanly onto clear/carrier/affected (logged). */
  dmTest?: 'clear' | 'carrier' | 'affected';
};

/** Thrown when RKC itself is struggling (5xx after one retry) and there is
 *  no cached data — fresh or stale — to fall back on. Routers should catch
 *  this and surface a friendly, non-technical message. */
export class RkcUnavailableError extends Error {
  constructor(message = 'The Royal Kennel Club website is temporarily unavailable') {
    super(message);
    this.name = 'RkcUnavailableError';
  }
}

const KC_SEARCH_URL = 'https://www.royalkennelclub.com/search/health-test-results-finder/';
const KC_PROFILE_URL = 'https://www.royalkennelclub.com/search/dog-profile/';

const USER_AGENT = 'Mozilla/5.0 (compatible; Remi Dog Show Entries)';

/** Cache entries are timestamped so we can tell "fresh" from "stale but
 *  better than nothing" — BoundedCache itself has no notion of time, only
 *  LRU eviction, so the TTL lives here. */
type CacheEntry<T> = { value: T; storedAt: number };

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Next.js server processes are long-lived and serve every club, so these are
// bounded (see bounded-cache.ts) rather than plain Maps. 500 searches / 1000
// profiles comfortably covers a busy day without growing unbounded.
const searchCache = new BoundedCache<string, CacheEntry<KcDogResult[]>>(500);
const profileCache = new BoundedCache<string, CacheEntry<KcDogProfile | null>>(1000);

function normaliseCacheKey(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Plain boolean, deliberately NOT a type predicate: freshness is a runtime
 * value check (storedAt vs. now), not a type-shape distinction, and a stale
 * entry is still a perfectly well-typed CacheEntry. A type predicate here
 * would make TypeScript narrow the "not fresh" branch to `undefined` even
 * when a stale-but-present entry is exactly the case the stale-fallback
 * path below needs to see.
 */
function isFresh<T>(entry: CacheEntry<T> | undefined): boolean {
  return entry !== undefined && Date.now() - entry.storedAt < CACHE_TTL_MS;
}

/** One retry after ~400ms when RKC returns a 5xx. Network-level throws
 *  (DNS blip, connection reset) are NOT retried here — only bad responses —
 *  to keep worst-case latency bounded and predictable. */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  const first = await fetch(url, init);
  if (first.status < 500) return first;
  console.warn(`[kc-lookup] RKC returned HTTP ${first.status} for ${url} — retrying once in 400ms`);
  await new Promise((resolve) => setTimeout(resolve, 400));
  return fetch(url, init);
}

// ── Search ──────────────────────────────────────────────────

/**
 * The genuine "nothing matched" marker RKC renders — distinct from a
 * redesign that silently changed the results markup (see PARSER CANARY
 * below). Confirmed 2026-08-12 against a live no-results response:
 *   <div class="t-search__metadata-results"> No results can be found for
 *   the search term '...'</div>
 * The wrapping div class alone isn't enough to detect this — a page WITH
 * results renders the SAME div with "Found N results" instead — so the
 * marker has to be this literal phrase, not just the CSS class.
 */
const NO_RESULTS_PHRASE = /no results can be found/i;

const APOSTROPHES = ["'", '’'];

function hasApostrophe(s: string): boolean {
  return APOSTROPHES.some((a) => s.includes(a));
}

/** Curly → straight or straight → curly, whichever style is present.
 *  Returns null if the query has no apostrophe to flip. */
function flipApostropheStyle(query: string): string | null {
  if (query.includes("'")) return query.replace(/'/g, '’');
  if (query.includes('’')) return query.replace(/’/g, "'");
  return null;
}

/** Strip every apostrophe character entirely. Returns null if there's
 *  nothing to strip. */
function stripApostrophes(query: string): string | null {
  if (!hasApostrophe(query)) return null;
  return query.replace(/['’]/g, '');
}

/** Flip the possessive on the first token (the kennel name) only — the
 *  affix RKC registered names most often disagree with owners about.
 *  "GAYVILLE'S PICASSO" -> "GAYVILLES PICASSO" or "ESPERANZA EZRA" ->
 *  "ESPERANZA'S EZRA", whichever direction the input isn't already. */
function flipPossessiveOnFirstToken(query: string): string | null {
  const tokens = query.split(' ');
  const first = tokens[0];
  if (!first) return null;

  if (/['’]s$/i.test(first)) {
    tokens[0] = first.slice(0, -2) + first.slice(-1);
  } else if (/[a-z]s$/i.test(first) && first.length > 1) {
    tokens[0] = `${first.slice(0, -1)}'${first.slice(-1)}`;
  } else {
    return null;
  }
  const flipped = tokens.join(' ');
  return flipped === query ? null : flipped;
}

function collapseWhitespace(query: string): string | null {
  const collapsed = query.trim().replace(/\s+/g, ' ');
  return collapsed === query ? null : collapsed;
}

const MAX_VARIANT_ATTEMPTS = 5;

/** "Esperanza's Ezra" → "Esperanza Ezra" — some registered names carry no
 *  possessive at all where owners expect one (the real 2026-08-08 case:
 *  five hand-typed attempts, only the fully-dropped form matched). */
function dropPossessive(query: string): string | null {
  const dropped = query.replace(/[’']s\b/gi, '').replace(/\s+/g, ' ').trim();
  return dropped === query.trim() ? null : dropped;
}

/** Ordered, deduped list of query variants to retry when the exact query
 *  yields nothing — capped at MAX_VARIANT_ATTEMPTS extra fetches. Exported
 *  for unit testing. */
export function generateSearchVariants(query: string): string[] {
  const original = query.trim();
  const candidates = [
    flipApostropheStyle(original),
    stripApostrophes(original),
    dropPossessive(original),
    flipPossessiveOnFirstToken(original),
    collapseWhitespace(original),
  ];

  const seen = new Set([original]);
  const variants: string[] = [];
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    variants.push(candidate);
    if (variants.length >= MAX_VARIANT_ATTEMPTS) break;
  }
  return variants;
}

/** Outcome of parsing one search-results fetch. */
type SearchPageOutcome =
  | { kind: 'hit'; results: KcDogResult[] }
  | { kind: 'no-results' }
  | { kind: 'canary' }; // fetched fine, but the markup matched neither shape

/** Parse one search-results HTML page. Exported for unit testing the
 *  canary logic against fixture HTML without a network fetch. */
export function parseSearchPage(html: string): SearchPageOutcome {
  if (html.includes('m-dog-card')) {
    return { kind: 'hit', results: parseDogCards(html) };
  }
  if (NO_RESULTS_PHRASE.test(html)) {
    return { kind: 'no-results' };
  }
  return { kind: 'canary' };
}

function parseDogCards(html: string): KcDogResult[] {
  const cards = html.split('<div class="m-dog-card">').slice(1); // skip chunk before any card
  const results: KcDogResult[] = [];

  for (const card of cards) {
    const registeredName = extractBetween(card, 'm-dog-card__title">', '</strong>');
    if (!registeredName) continue;

    const breed = extractBetween(card, 'm-dog-card__category">', '</div>');
    const sex = extractSummaryField(card, 'Sex');
    const colour = extractSummaryField(card, 'Colour');
    const dateOfBirth = extractSummaryField(card, 'Date of birth');

    const dogIdMatch = card.match(/\/search\/dog-profile\/\?dogId=([a-f0-9-]+)/i);
    const dogId = dogIdMatch?.[1];

    results.push({
      registeredName: registeredName.trim(),
      breed: breed?.trim() ?? '',
      sex: sex?.toLowerCase() === 'bitch' ? 'bitch' : 'dog',
      dateOfBirth: dateOfBirth?.trim() ?? '',
      colour: colour?.trim() || undefined,
      sire: '',
      dam: '',
      dogId,
    });
  }

  // Filter out dogs older than 18 years — unlikely to be entering shows
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 18);

  return results.filter((r) => {
    if (!r.dateOfBirth) return true; // keep if no DOB available
    // RKC dates are DD/MM/YYYY — parse accordingly
    const parts = r.dateOfBirth.split('/');
    if (parts.length === 3) {
      const dob = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
      return dob >= cutoff;
    }
    // Fallback: try ISO parse
    const dob = new Date(r.dateOfBirth);
    return isNaN(dob.getTime()) || dob >= cutoff;
  });
}

/** Fetch one search page (with 5xx retry) and parse it. */
async function fetchSearchPage(query: string): Promise<SearchPageOutcome> {
  const searchUrl = `${KC_SEARCH_URL}?Filter=${encodeURIComponent(query)}`;
  const response = await fetchWithRetry(searchUrl, { headers: { 'User-Agent': USER_AGENT } });

  if (!response.ok) {
    if (response.status >= 500) {
      throw new RkcUnavailableError();
    }
    console.error(`[kc-lookup] RKC returned HTTP ${response.status}`);
    return { kind: 'no-results' };
  }

  const html = await response.text();
  return parseSearchPage(html);
}

/**
 * Search the RKC Health Test Results Finder and return ALL matching dogs.
 *
 * Tries the exact query first. If that yields zero results, retries
 * sequentially through a small set of apostrophe/whitespace variants
 * (stopping at the first hit) before giving up — RKC's search is
 * token-exact and real exhibitors were burning several manual retries a
 * search on exactly this class of mismatch.
 *
 * Results (including confirmed-empty) are cached for 24h by normalised
 * query. If RKC is still failing after one retry, a stale cache entry is
 * served if one exists; otherwise this throws RkcUnavailableError.
 */
export async function searchKcDogs(query: string): Promise<KcDogResult[]> {
  const cacheKey = normaliseCacheKey(query);
  const cached = searchCache.get(cacheKey);
  if (cached && isFresh(cached)) {
    console.log(`[kc-lookup] Cache hit for "${query}"`);
    return cached.value;
  }

  try {
    console.log(`[kc-lookup] Searching RKC for "${query}"...`);
    const first = await fetchSearchPage(query.trim());

    if (first.kind === 'hit') {
      searchCache.set(cacheKey, { value: first.results, storedAt: Date.now() });
      console.log(`[kc-lookup] Found ${first.results.length} dogs`);
      return first.results;
    }

    if (first.kind === 'canary') {
      console.error(`[kc-lookup] PARSER CANARY: search page for "${query}" had neither a dog card nor the known no-results marker — RKC may have redesigned the page`);
    }

    // Zero results (or an unreadable page) — fan out across variants,
    // stopping at the first hit.
    for (const variant of generateSearchVariants(query.trim())) {
      const outcome = await fetchSearchPage(variant);
      if (outcome.kind === 'hit') {
        console.log(`[kc-lookup] Variant "${variant}" matched (original "${query}" did not)`);
        searchCache.set(cacheKey, { value: outcome.results, storedAt: Date.now() });
        return outcome.results;
      }
      if (outcome.kind === 'canary') {
        console.error(`[kc-lookup] PARSER CANARY: search page for variant "${variant}" had neither a dog card nor the known no-results marker`);
      }
    }

    console.log(`[kc-lookup] No results found for "${query}" or any variant`);
    searchCache.set(cacheKey, { value: [], storedAt: Date.now() });
    return [];
  } catch (error) {
    if (error instanceof RkcUnavailableError) {
      if (cached) {
        console.warn(`[kc-lookup] RKC unavailable — serving stale cache for "${query}" (age ${Math.round((Date.now() - cached.storedAt) / 1000)}s)`);
        return cached.value;
      }
      throw error;
    }
    console.error('[kc-lookup] RKC lookup failed:', error);
    return [];
  }
}

/** Decode common HTML entities (named + numeric) */
function decodeHtmlEntities(text: string): string {
  const named: Record<string, string> = {
    '&amp;': '&',
    '&apos;': "'",
    '&quot;': '"',
    '&lt;': '<',
    '&gt;': '>',
  };
  return text
    .replace(/&(?:amp|apos|quot|lt|gt);/g, (m) => named[m] ?? m)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}

/** Extract text between a marker and a closing tag */
function extractBetween(html: string, startMarker: string, endMarker: string): string | null {
  const startIdx = html.indexOf(startMarker);
  if (startIdx === -1) return null;
  const contentStart = startIdx + startMarker.length;
  const endIdx = html.indexOf(endMarker, contentStart);
  if (endIdx === -1) return null;
  return decodeHtmlEntities(html.substring(contentStart, endIdx)).trim();
}

/**
 * Extract a summary field value from the RKC breed-summary markup.
 * Looks for: <span class="m-breed-summary__key-label">fieldName</span>
 * Then finds the next: <dd class="m-breed-summary__value">value</dd>
 */
function extractSummaryField(html: string, fieldName: string): string | null {
  const labelMarker = `m-breed-summary__key-label">${fieldName}</span>`;
  const labelIdx = html.indexOf(labelMarker);
  if (labelIdx === -1) return null;

  const valueMarker = 'm-breed-summary__value">';
  const valueIdx = html.indexOf(valueMarker, labelIdx);
  if (valueIdx === -1) return null;

  const contentStart = valueIdx + valueMarker.length;
  const endIdx = html.indexOf('</dd>', contentStart);
  if (endIdx === -1) return null;

  return decodeHtmlEntities(html.substring(contentStart, endIdx)).trim();
}

// ── Dog Profile Page (Phase 2 enrichment) ─────────────────────

/**
 * The default timeout for profile page fetches. Keep this tight — if the RKC
 * site is having a slow day we don't want to block the user.
 */
const PROFILE_TIMEOUT_MS = 4000;

/**
 * Fetch the RKC dog profile page and extract sire, dam, health results and
 * other pedigree details.
 *
 * Uses AbortController with a timeout so that if the RKC site is slow on a
 * given day, we gracefully return null instead of blocking the user. Results
 * are cached for 24h by dogId; a 5xx after one retry serves a stale cached
 * profile if one exists, otherwise throws RkcUnavailableError.
 */
export async function fetchKcDogProfile(
  dogId: string,
  timeoutMs = PROFILE_TIMEOUT_MS,
): Promise<KcDogProfile | null> {
  const cached = profileCache.get(dogId);
  if (cached && isFresh(cached)) {
    console.log(`[kc-profile] Cache hit for dogId=${dogId}`);
    return cached.value;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    console.log(`[kc-profile] Fetching profile for dogId=${dogId} (timeout=${timeoutMs}ms)...`);
    const start = Date.now();

    const response = await fetchWithRetry(`${KC_PROFILE_URL}?dogId=${encodeURIComponent(dogId)}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status >= 500) throw new RkcUnavailableError();
      console.error(`[kc-profile] RKC returned HTTP ${response.status}`);
      return null;
    }

    const html = await response.text();
    const elapsed = Date.now() - start;
    console.log(`[kc-profile] Fetched in ${elapsed}ms (${html.length} bytes)`);

    const profile = parseKcDogProfile(html);
    profileCache.set(dogId, { value: profile, storedAt: Date.now() });
    return profile;
  } catch (error: unknown) {
    if (error instanceof RkcUnavailableError) {
      if (cached) {
        console.warn(`[kc-profile] RKC unavailable — serving stale cache for dogId=${dogId} (age ${Math.round((Date.now() - cached.storedAt) / 1000)}s)`);
        return cached.value;
      }
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      console.log(`[kc-profile] Timed out after ${timeoutMs}ms — skipping enrichment`);
    } else {
      console.error('[kc-profile] Profile fetch failed:', error);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse the RKC dog profile page HTML and extract pedigree + health fields.
 *
 * The profile page has a pedigree tree section with sire/dam, a details
 * section with studbook number, and a health profile section with BVA/KC
 * hip, elbow and DNA test cards.
 */
function parseKcDogProfile(html: string): KcDogProfile | null {
  try {
    const { sire, dam } = extractPedigreeParents(html);
    const colour = extractProfileField(html, 'Colour') ?? '';
    const registrationType = extractProfileField(html, 'Registration type') ?? undefined;
    const inbreedingCoefficient = extractProfileField(html, 'Inbreeding coefficient') ?? undefined;
    const studbookNumber = extractProfileField(html, 'Studbook number') ?? undefined;

    const healthCards = parseHealthCards(html);
    const hipScore = formatDysplasiaScore(findHealthCard(healthCards, 'BVA/KC Hip Dysplasia'), 'Hip');
    const elbowScore = formatDysplasiaScore(findHealthCard(healthCards, 'BVA/KC Elbow Dysplasia'), 'Elbow');
    const dmTest = mapDmTestResult(findHealthCard(healthCards, 'DNA - DM (CDRM)'));

    console.log(`[kc-profile] Parsed: sire="${sire}", dam="${dam}", studbook="${studbookNumber}", hip="${hipScore}", elbow="${elbowScore}", dm="${dmTest}"`);

    // Only return if we got at least something worth applying.
    if (!sire && !dam && !colour && !hipScore && !elbowScore && !dmTest && !studbookNumber) {
      console.log('[kc-profile] No usable data found in profile page');
      return null;
    }

    return {
      sire: sire ?? '',
      dam: dam ?? '',
      colour,
      registrationType,
      inbreedingCoefficient,
      studbookNumber,
      hipScore,
      elbowScore,
      dmTest,
    };
  } catch (error) {
    console.error('[kc-profile] Failed to parse profile:', error);
    return null;
  }
}

/**
 * Extract the immediate sire and dam from the RKC pedigree tree.
 *
 * The pedigree tree is a nested <ul>/<li> structure:
 *   Root (m-pedigree-graph__dog--current)
 *     └ <ul> children
 *         ├ <li> Sire (+ sire's subtree)
 *         └ <li> Dam (+ dam's subtree)
 *
 * We track <ul>/<li> nesting depth to find only the immediate parents
 * (depth 1) and ignore grandparents at deeper levels.
 */
function extractPedigreeParents(html: string): { sire: string | null; dam: string | null } {
  const rootIdx = html.indexOf('m-pedigree-graph__dog--current');
  if (rootIdx === -1) return { sire: null, dam: null };

  // Start after the root node and find the children <ul>
  const afterRoot = html.substring(rootIdx);
  const childListIdx = afterRoot.indexOf('<ul class="m-pedigree-graph__list">');
  if (childListIdx === -1) return { sire: null, dam: null };

  // Walk the HTML after the children list, tracking <ul> depth.
  // At depth 1, each m-pedigree-graph__dog-name is a parent.
  const treeHtml = afterRoot.substring(childListIdx);
  let ulDepth = 0;
  let pos = 0;
  const parents: string[] = [];

  while (pos < treeHtml.length && parents.length < 2) {
    if (treeHtml.startsWith('<ul', pos)) {
      ulDepth++;
      pos = treeHtml.indexOf('>', pos) + 1;
      continue;
    }

    if (treeHtml.startsWith('</ul>', pos)) {
      ulDepth--;
      if (ulDepth <= 0) break; // left the parent list
      pos += 5;
      continue;
    }

    // At depth 1 we're in the direct children list — look for dog names
    if (ulDepth === 1) {
      const marker = 'm-pedigree-graph__dog-name">';
      if (treeHtml.startsWith(marker, pos)) {
        const nameStart = pos + marker.length;
        const nameEnd = treeHtml.indexOf('</div>', nameStart);
        if (nameEnd !== -1) {
          const nameHtml = treeHtml.substring(nameStart, nameEnd).trim();
          // Name may be wrapped in <a> or <span> tags
          const tagMatch = nameHtml.match(/<(?:a|span)[^>]*>([^<]+)<\/(?:a|span)>/);
          const name = tagMatch?.[1] ?? nameHtml;
          if (name && !name.startsWith('<')) {
            parents.push(decodeHtmlEntities(name.trim()));
          }
        }
      }
    }

    pos++;
  }

  return { sire: parents[0] ?? null, dam: parents[1] ?? null };
}

/**
 * Extract a field from the RKC dog profile header/summary.
 *
 * The profile page uses two different markup patterns:
 *   1. o-dog-header__details-item / t-dog-profile__detail with <dt>/<dd> pairs
 *   2. m-breed-summary with key-label/value spans
 */
function extractProfileField(html: string, fieldName: string): string | null {
  const patterns = [
    // Profile header / details: <dt>Studbook number</dt><dd>3223DJ</dd>
    new RegExp(`<dt[^>]*>\\s*${fieldName}\\s*</dt>\\s*<dd[^>]*>([^<]+)`, 'i'),
    // Breed summary (same as search page)
    new RegExp(`m-breed-summary__key-label">${fieldName}</span>[\\s\\S]*?m-breed-summary__value">([^<]+)`, 'i'),
    // Screenreader-only key with value in next dd
    new RegExp(`u-screenreader">${fieldName}</dt>\\s*<dd[^>]*>([^<]+)`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const value = decodeHtmlEntities(match[1]).trim();
      if (value.length > 0) return value;
    }
  }

  return null;
}

// ── Health profile cards ───────────────────────────────────────

/** One "t-dog-profile__card health-card" from the Health profile section —
 *  e.g. "BVA/KC Hip Dysplasia" or "DNA - DM (CDRM)". */
export type HealthCard = {
  title: string;
  /** True when RKC explicitly has no record held for this test. */
  noRecordHeld: boolean;
  /** Result line(s) — one for most DNA tests, three (Left/Right/Total
   *  score) for the BVA/KC hip and elbow schemes. */
  results: string[];
};

const HEALTH_CARD_MARKER = '<div class="t-dog-profile__card health-card">';

/**
 * Parse every health-card in the "Health profile" section. Health cards are
 * distinguished from the unrelated EBV/Coefficient-of-Inbreeding cards
 * elsewhere on the page by their exact div class ("...health-card", the EBV
 * cards use "...t-dog-profile__card--centred") and their title's trailing
 * space in the class attribute. Exported for unit testing against fixture
 * HTML extracted from a real profile page.
 */
export function parseHealthCards(html: string): HealthCard[] {
  const chunks = html.split(HEALTH_CARD_MARKER).slice(1);
  const cards: HealthCard[] = [];

  for (const chunk of chunks) {
    const divEnd = chunk.indexOf('</div>');
    const cardHtml = divEnd === -1 ? chunk : chunk.substring(0, divEnd);

    const titleMatch = cardHtml.match(/<strong class="t-dog-profile__card-title\s*">([\s\S]*?)<\/strong>/);
    if (!titleMatch) continue;

    const rawTitle = decodeHtmlEntities(titleMatch[1]).replace(/\s+/g, ' ').trim();
    const noRecordHeld = /no record held/i.test(rawTitle);
    const title = rawTitle.replace(/\s*-\s*No Record Held\s*$/i, '').trim();

    const results: string[] = [];
    const resultRe = /<span class="t-dog-profile__card-result">([\s\S]*?)<\/span>/g;
    let match: RegExpExecArray | null;
    while ((match = resultRe.exec(cardHtml)) !== null) {
      results.push(decodeHtmlEntities(match[1]).trim());
    }

    cards.push({ title, noRecordHeld, results });
  }

  return cards;
}

function findHealthCard(cards: HealthCard[], title: string): HealthCard | undefined {
  const norm = title.toLowerCase();
  return cards.find((c) => c.title.toLowerCase() === norm);
}

/**
 * Format a BVA/KC hip or elbow dysplasia card's Left/Right/Total scores as
 * "left:right (total N)" — the same shape the SV Health card's own hip
 * score placeholder already uses ("e.g. 4:4 (total 8)"). Returns undefined
 * when the card is absent, "No Record Held", or its scores don't parse
 * (logged, never guessed).
 */
function formatDysplasiaScore(card: HealthCard | undefined, label: string): string | undefined {
  if (!card || card.noRecordHeld) return undefined;

  let left: number | undefined;
  let right: number | undefined;
  let total: number | undefined;
  for (const result of card.results) {
    const match = result.match(/^(Left|Right|Total) score:\s*(-?\d+(?:\.\d+)?)/i);
    if (!match) continue;
    const value = Number(match[2]);
    if (/^left/i.test(match[1])) left = value;
    else if (/^right/i.test(match[1])) right = value;
    else if (/^total/i.test(match[1])) total = value;
  }

  if (left === undefined || right === undefined) {
    if (card.results.length > 0) {
      console.warn(`[kc-profile] ${label} card had a result but didn't parse as Left/Right scores: ${JSON.stringify(card.results)} — not applying`);
    }
    return undefined;
  }
  return `${left}:${right} (total ${total ?? left + right})`;
}

/**
 * Map RKC's DNA - DM (CDRM) result wording onto the SV health card's
 * dmTest vocabulary. "No Record Held" is treated as absent (nothing to
 * apply), not as "not_tested" — RKC not holding a record isn't the same
 * claim as a test having come back untested.
 */
function mapDmTestResult(card: HealthCard | undefined): 'clear' | 'carrier' | 'affected' | undefined {
  if (!card || card.noRecordHeld) return undefined;
  const value = card.results[0];
  if (!value) return undefined;

  const v = value.toLowerCase();
  if (v.includes('affected') || v.includes('at risk')) return 'affected';
  if (v.includes('carrier')) return 'carrier';
  if (v.includes('clear')) return 'clear';

  console.warn(`[kc-profile] DNA - DM (CDRM) result didn't map onto clear/carrier/affected: "${value}" — not applying`);
  return undefined;
}
