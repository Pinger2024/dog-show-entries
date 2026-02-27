import FirecrawlApp from '@mendable/firecrawl-js';
import { z } from 'zod';

let _firecrawl: FirecrawlApp | null = null;

export function getFirecrawl() {
  if (!_firecrawl) {
    if (!process.env.FIRECRAWL_API_KEY) {
      throw new Error('FIRECRAWL_API_KEY is not set');
    }
    _firecrawl = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });
  }
  return _firecrawl;
}

const kcDogSchema = z.object({
  registeredName: z.string().describe('The full KC registered name of the dog'),
  breed: z.string().describe('The breed of the dog'),
  sex: z.string().describe('The sex: "Dog" or "Bitch"'),
  dateOfBirth: z.string().describe('Date of birth in any format'),
  sire: z.string().describe('The registered name of the sire (father)'),
  dam: z.string().describe('The registered name of the dam (mother)'),
  breeder: z.string().describe('The name of the breeder'),
  colour: z.string().optional().describe('The colour of the dog if shown'),
});

export type KcDogResult = z.infer<typeof kcDogSchema>;

const KC_URL = 'https://www.royalkennelclub.com/search/health-test-results-finder/';

/**
 * Scrape the KC Health Test Results Finder to look up a dog by name or reg number.
 *
 * Uses Firecrawl's actions to:
 * 1. Navigate to the search page
 * 2. Type the query into the search box
 * 3. Submit the search
 * 4. Wait for results to render
 * 5. Extract structured data via LLM
 */
export async function scrapeKcDog(query: string): Promise<KcDogResult | null> {
  const firecrawl = getFirecrawl();

  try {
    console.log(`[firecrawl] Looking up dog: "${query}"`);

    const result = await firecrawl.scrapeUrl(KC_URL, {
      formats: [
        {
          type: 'json' as const,
          schema: kcDogSchema,
          prompt: `Extract the dog's details from this KC Health Test Results page. The user searched for "${query}". Extract the first matching dog's registered name, breed, sex (must be "Dog" or "Bitch"), date of birth, sire name, dam name, breeder name, and colour if available. If no dog results are found, return empty strings for all fields.`,
        },
      ],
      actions: [
        { type: 'wait' as const, milliseconds: 2000 },
        { type: 'click' as const, selector: 'input[type="search"], input[type="text"], input[name*="search"], .search-input, #search' },
        { type: 'write' as const, text: query },
        { type: 'press' as const, key: 'Enter' },
        { type: 'wait' as const, milliseconds: 4000 },
        { type: 'click' as const, selector: '.search-result a, .results a, [class*="result"] a, table a, .dog-name a' },
        { type: 'wait' as const, milliseconds: 3000 },
      ],
    });

    if ('error' in result && result.error) {
      console.error('[firecrawl] Scrape error:', result.error);
      return null;
    }

    const data = (result as { json?: KcDogResult }).json;

    if (!data || !data.registeredName) {
      console.log('[firecrawl] No dog data found in scrape result');
      return null;
    }

    // Normalise sex to lowercase
    const normalisedSex = data.sex?.toLowerCase() === 'bitch' ? 'bitch' : 'dog';

    console.log(`[firecrawl] Found dog: ${data.registeredName} (${data.breed})`);

    return {
      ...data,
      sex: normalisedSex,
    };
  } catch (error) {
    console.error('[firecrawl] KC lookup failed:', error);
    return null;
  }
}
