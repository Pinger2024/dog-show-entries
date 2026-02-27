/**
 * KC dog lookup via direct HTML fetch + parsing.
 *
 * The KC Health Test Results Finder at royalkennelclub.com is server-rendered
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
};

const KC_SEARCH_URL = 'https://www.royalkennelclub.com/search/health-test-results-finder/';

/**
 * Search the KC Health Test Results Finder and return ALL matching dogs.
 *
 * Fetches the search results page with ?Filter= and parses every dog card
 * from the server-rendered HTML. Returns up to 12 results (one page).
 */
export async function searchKcDogs(query: string): Promise<KcDogResult[]> {
  try {
    console.log(`[kc-lookup] Searching KC for "${query}"...`);

    const searchUrl = `${KC_SEARCH_URL}?Filter=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Remi Dog Show Entries)',
      },
    });

    if (!response.ok) {
      console.error(`[kc-lookup] KC returned HTTP ${response.status}`);
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

      results.push({
        registeredName: registeredName.trim(),
        breed: breed?.trim() ?? '',
        sex: sex?.toLowerCase() === 'bitch' ? 'bitch' : 'dog',
        dateOfBirth: dateOfBirth?.trim() ?? '',
        colour: colour?.trim() || undefined,
        sire: '',
        dam: '',
        breeder: '',
      });
    }

    console.log(`[kc-lookup] Found ${results.length} dogs`);
    return results;
  } catch (error) {
    console.error('[kc-lookup] KC lookup failed:', error);
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

/** Extract text between a marker and a closing tag */
function extractBetween(html: string, startMarker: string, endMarker: string): string | null {
  const startIdx = html.indexOf(startMarker);
  if (startIdx === -1) return null;
  const contentStart = startIdx + startMarker.length;
  const endIdx = html.indexOf(endMarker, contentStart);
  if (endIdx === -1) return null;
  return html.substring(contentStart, endIdx).replace(/&amp;/g, '&').replace(/&#x2B;/g, '+').trim();
}

/**
 * Extract a summary field value from the KC breed-summary markup.
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

  return html.substring(contentStart, endIdx).replace(/&amp;/g, '&').trim();
}
