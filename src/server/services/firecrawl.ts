/**
 * RKC dog lookup via direct HTML fetch + parsing.
 *
 * The RKC Health Test Results Finder at royalkennelclub.com is server-rendered
 * HTML with consistent CSS classes, so we can fetch and parse it directly —
 * no Firecrawl, no LLM, no browser automation needed.
 */

export type KcDogResult = {
  registeredName: string;
  breed: string;
  sex: string;
  dateOfBirth: string;
  sire: string;
  dam: string;
  breeder: string;
  colour?: string;
  /** Dog ID from the RKC website — used to fetch the full profile page */
  dogId?: string;
};

export type KcDogProfile = {
  sire: string;
  dam: string;
  breeder: string;
  colour: string;
  registrationType?: string;
  inbreedingCoefficient?: string;
};

const KC_SEARCH_URL = 'https://www.royalkennelclub.com/search/health-test-results-finder/';

/**
 * Search the RKC Health Test Results Finder and return ALL matching dogs.
 *
 * Fetches the search results page with ?Filter= and parses every dog card
 * from the server-rendered HTML. Returns up to 12 results (one page).
 */
export async function searchKcDogs(query: string): Promise<KcDogResult[]> {
  try {
    console.log(`[kc-lookup] Searching RKC for "${query}"...`);

    const searchUrl = `${KC_SEARCH_URL}?Filter=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Remi Dog Show Entries)',
      },
    });

    if (!response.ok) {
      console.error(`[kc-lookup] RKC returned HTTP ${response.status}`);
      return [];
    }

    const html = await response.text();

    if (!html.includes('m-dog-card')) {
      console.log('[kc-lookup] No results found');
      return [];
    }

    // Split the HTML into individual dog card blocks
    const cards = html.split('<div class="m-dog-card">').slice(1); // skip first chunk (before any card)

    const results: KcDogResult[] = [];

    for (const card of cards) {
      const registeredName = extractBetween(card, 'm-dog-card__title">', '</strong>');
      if (!registeredName) continue;

      const breed = extractBetween(card, 'm-dog-card__category">', '</div>');
      const sex = extractSummaryField(card, 'Sex');
      const colour = extractSummaryField(card, 'Colour');
      const dateOfBirth = extractSummaryField(card, 'Date of birth');

      // Extract dogId from the card's link to the profile page
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
        breeder: '',
        dogId,
      });
    }

    // Filter out dogs older than 18 years — unlikely to be entering shows
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 18);

    const filtered = results.filter((r) => {
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

    console.log(`[kc-lookup] Found ${results.length} dogs, ${filtered.length} within last 18 years`);
    return filtered;
  } catch (error) {
    console.error('[kc-lookup] RKC lookup failed:', error);
    return [];
  }
}

/**
 * Look up a single dog — returns the first match or null.
 * Kept for backwards compatibility with existing callers.
 */
export async function scrapeKcDog(query: string): Promise<KcDogResult | null> {
  const results = await searchKcDogs(query);
  return results[0] ?? null;
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

const KC_PROFILE_URL = 'https://www.royalkennelclub.com/search/dog-profile/';

/**
 * The default timeout for profile page fetches. Keep this tight — if the RKC
 * site is having a slow day we don't want to block the user.
 */
const PROFILE_TIMEOUT_MS = 4000;

/**
 * Fetch the RKC dog profile page and extract sire, dam, breeder, and other
 * pedigree details.
 *
 * Uses AbortController with a timeout so that if the RKC site is slow on a
 * given day, we gracefully return null instead of blocking the user.
 */
export async function fetchKcDogProfile(
  dogId: string,
  timeoutMs = PROFILE_TIMEOUT_MS,
): Promise<KcDogProfile | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    console.log(`[kc-profile] Fetching profile for dogId=${dogId} (timeout=${timeoutMs}ms)...`);
    const start = Date.now();

    const response = await fetch(`${KC_PROFILE_URL}?dogId=${encodeURIComponent(dogId)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Remi Dog Show Entries)',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`[kc-profile] RKC returned HTTP ${response.status}`);
      return null;
    }

    const html = await response.text();
    const elapsed = Date.now() - start;
    console.log(`[kc-profile] Fetched in ${elapsed}ms (${html.length} bytes)`);

    return parseKcDogProfile(html);
  } catch (error: unknown) {
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
 * Parse the RKC dog profile page HTML and extract pedigree fields.
 *
 * The profile page has a pedigree tree section with sire/dam and a summary
 * section with breeder, colour, registration type, etc.
 */
function parseKcDogProfile(html: string): KcDogProfile | null {
  try {
    // Extract sire and dam from the pedigree tree
    const { sire, dam } = extractPedigreeParents(html);

    // Extract breeder from the summary section
    const breeder = extractProfileField(html, 'Breeder') ?? '';

    // Colour — may be more detailed on the profile page than in search
    const colour = extractProfileField(html, 'Colour') ?? '';

    // Registration type (e.g., "Breed Register")
    const registrationType = extractProfileField(html, 'Registration type') ?? undefined;

    // Inbreeding coefficient
    const inbreedingCoefficient = extractProfileField(html, 'Inbreeding coefficient') ?? undefined;

    console.log(`[kc-profile] Parsed: sire="${sire}", dam="${dam}", breeder="${breeder}"`);

    // Only return if we got at least sire or dam
    if (!sire && !dam && !breeder) {
      console.log('[kc-profile] No pedigree data found in profile page');
      return null;
    }

    return { sire: sire ?? '', dam: dam ?? '', breeder, colour, registrationType, inbreedingCoefficient };
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
          let nameHtml = treeHtml.substring(nameStart, nameEnd).trim();
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
 *   1. o-dog-header__details-item with <dt>/<dd> pairs
 *   2. m-breed-summary with key-label/value spans
 */
function extractProfileField(html: string, fieldName: string): string | null {
  const patterns = [
    // Profile header: <dt class="...">Colour</dt><dd class="...">BLACK & GOLD</dd>
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
