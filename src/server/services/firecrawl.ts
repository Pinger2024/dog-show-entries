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
 * Look up a dog on the KC Health Test Results Finder.
 *
 * Fetches the search results page with ?Filter= and parses the server-rendered
 * HTML to extract dog details. Returns the first match, or null if not found.
 *
 * Fields extracted: registeredName, breed, sex, colour, dateOfBirth.
 * Sire/dam/breeder are on the profile page (client-rendered) and not available
 * via this method — returned as empty strings.
 */
export async function scrapeKcDog(query: string): Promise<KcDogResult | null> {
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
      return null;
    }

    const html = await response.text();

    // Extract dog cards from the HTML using the consistent KC markup:
    //   <div class="m-dog-card">
    //     <a class="m-dog-card__link" href="/search/dog-profile/?dogId=...">
    //       <div class="m-dog-card__category">German Shepherd Dog</div>
    //       <strong class="m-dog-card__title">HUNDARK PHANTOM</strong>
    //     </a>
    //     <dl class="m-breed-summary__list">
    //       <dt>...<span class="m-breed-summary__key-label">Sex</span></dt>
    //       <dd class="m-breed-summary__value">Dog</dd>
    //       ...
    //     </dl>
    //   </div>

    // Check if any results exist
    if (!html.includes('m-dog-card')) {
      console.log('[kc-lookup] No results found');
      return null;
    }

    // Extract the first dog card's data
    const registeredName = extractBetween(html, 'm-dog-card__title">', '</strong>');
    const breed = extractBetween(html, 'm-dog-card__category">', '</div>');

    if (!registeredName) {
      console.log('[kc-lookup] Could not parse dog name from results');
      return null;
    }

    // Extract summary fields (Sex, Colour, Date of birth) from the breed-summary list
    const sex = extractSummaryField(html, 'Sex');
    const colour = extractSummaryField(html, 'Colour');
    const dateOfBirth = extractSummaryField(html, 'Date of birth');

    const normalisedSex = sex?.toLowerCase() === 'bitch' ? 'bitch' : 'dog';

    console.log(`[kc-lookup] Found: ${registeredName} (${breed}, ${normalisedSex})`);

    return {
      registeredName: registeredName.trim(),
      breed: breed?.trim() ?? '',
      sex: normalisedSex,
      dateOfBirth: dateOfBirth?.trim() ?? '',
      colour: colour?.trim() || undefined,
      // Sire/dam/breeder are on the profile page (client-side rendered)
      sire: '',
      dam: '',
      breeder: '',
    };
  } catch (error) {
    console.error('[kc-lookup] KC lookup failed:', error);
    return null;
  }
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

  // Find the next m-breed-summary__value after this label
  const valueMarker = 'm-breed-summary__value">';
  const valueIdx = html.indexOf(valueMarker, labelIdx);
  if (valueIdx === -1) return null;

  const contentStart = valueIdx + valueMarker.length;
  const endIdx = html.indexOf('</dd>', contentStart);
  if (endIdx === -1) return null;

  return html.substring(contentStart, endIdx).replace(/&amp;/g, '&').trim();
}
