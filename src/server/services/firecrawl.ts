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

// Schema for the search results page — just need the dogId link
const kcSearchResultSchema = z.object({
  dogId: z.string().describe('The dogId UUID from the first dog profile link (from href like /search/dog-profile/?dogId=...)'),
  registeredName: z.string().describe('The registered name of the first matching dog'),
});

// Schema for the full dog profile page
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

const KC_SEARCH_URL = 'https://www.royalkennelclub.com/search/health-test-results-finder/';
const KC_PROFILE_URL = 'https://www.royalkennelclub.com/search/dog-profile/';

/**
 * Look up a dog on the KC website via Firecrawl.
 *
 * Two-step approach:
 * 1. Hit the search page with ?Filter= to get search results and extract the dogId
 * 2. Hit the dog profile page with ?dogId= to get full details
 *
 * This avoids fragile click/type automation — both pages accept URL parameters.
 * The KC site is a slow SPA so we use generous wait times.
 */
export async function scrapeKcDog(query: string): Promise<KcDogResult | null> {
  const firecrawl = getFirecrawl();

  try {
    console.log(`[firecrawl] Step 1: Searching KC for "${query}"...`);

    // Step 1: Search for the dog and extract the dogId from the results
    const searchUrl = `${KC_SEARCH_URL}?Filter=${encodeURIComponent(query)}`;
    const searchResult = await firecrawl.scrape(searchUrl, {
      formats: [
        {
          type: 'json' as const,
          schema: kcSearchResultSchema,
          prompt: `Extract the dogId UUID and registered name from the first search result on this KC Health Test Results page. The dogId is in the href of the dog profile link, which looks like "/search/dog-profile/?dogId=SOME-UUID". Return the UUID only (not the full URL). If no results are found, return empty strings.`,
        },
      ],
      actions: [
        { type: 'wait' as const, milliseconds: 6000 },
      ],
    });

    const searchData = (searchResult as { json?: z.infer<typeof kcSearchResultSchema> }).json;

    if (!searchData?.dogId) {
      console.log('[firecrawl] No dog found in search results');
      return null;
    }

    console.log(`[firecrawl] Step 2: Found "${searchData.registeredName}", fetching profile (dogId: ${searchData.dogId})...`);

    // Step 2: Scrape the full dog profile page
    const profileUrl = `${KC_PROFILE_URL}?dogId=${encodeURIComponent(searchData.dogId)}`;
    const profileResult = await firecrawl.scrape(profileUrl, {
      formats: [
        {
          type: 'json' as const,
          schema: kcDogSchema,
          prompt: `Extract the dog's full details from this KC dog profile page. Get the registered name, breed, sex ("Dog" or "Bitch"), date of birth, sire (father's registered name), dam (mother's registered name), breeder name, and colour. If any field is not shown, return an empty string.`,
        },
      ],
      actions: [
        { type: 'wait' as const, milliseconds: 8000 },
      ],
    });

    const data = (profileResult as { json?: KcDogResult }).json;

    if (!data?.registeredName) {
      console.log('[firecrawl] No dog data found on profile page');
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
