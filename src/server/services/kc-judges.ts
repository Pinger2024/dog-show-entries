/**
 * RKC Judge Lookup via Firecrawl (browser automation).
 *
 * Unlike the RKC dog search (server-rendered HTML → direct fetch), the RKC
 * "Find a Judge" page uses JavaScript/AJAX rendering. We use the Firecrawl
 * API to fill and submit the search form, then parse the resulting HTML.
 *
 * Firecrawl API: https://api.firecrawl.dev/v1/scrape
 * RKC page: https://www.royalkennelclub.com/search/find-a-judge/
 */

export type KcJudgeResult = {
  name: string;
  location: string | null;
  /** RKC's internal judge ID (UUID) — used for profile lookup */
  kcJudgeId: string;
};

export type KcJudgeProfile = {
  /** Breeds the judge is approved for, with their level */
  breeds: { breed: string; group: string; level: number }[];
};

const FIRECRAWL_URL = 'https://api.firecrawl.dev/v1/scrape';
const KC_JUDGE_URL = 'https://www.royalkennelclub.com/search/find-a-judge/';
const KC_JUDGE_PROFILE_URL = 'https://www.royalkennelclub.com/search/find-a-judge/judge-profile/';

/**
 * Search for RKC judges by surname and optionally filter by breed.
 *
 * Uses Firecrawl to automate the RKC's JavaScript-rendered search form:
 * 1. Check the "Dog showing" activity checkbox
 * 2. Fill in the surname
 * 3. Optionally set the breed filter
 * 4. Submit the form
 * 5. Parse the resulting judge cards from HTML
 */
export async function searchKcJudges(
  surname: string,
  breed?: string,
): Promise<KcJudgeResult[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    console.error('[kc-judges] FIRECRAWL_API_KEY not set');
    return [];
  }

  try {
    console.log(`[kc-judges] Searching for "${surname}"${breed ? ` (breed: ${breed})` : ''}...`);

    // Build the JS to fill and submit the form
    const fillScript = [
      // Check "Dog showing" activity
      'document.getElementById("datamodel_Filter_SearchOptions_2__Selected").click();',
      // Fill surname
      'var input = document.getElementById("datamodel_Filter_KeywordSearch");',
      'input.value = ' + JSON.stringify(surname) + ';',
      'input.dispatchEvent(new Event("input", {bubbles: true}));',
    ];

    if (breed) {
      fillScript.push(
        'var sel = document.getElementById("datamodel_Filter_Breed");',
        'sel.value = ' + JSON.stringify(breed) + ';',
        'sel.dispatchEvent(new Event("change", {bubbles: true}));',
      );
    }

    const actions = [
      { type: 'executeJavascript' as const, script: fillScript.join(' ') },
      { type: 'wait' as const, milliseconds: 1000 },
      { type: 'executeJavascript' as const, script: 'document.querySelector("button.a-button--primary[type=submit]").click();' },
      { type: 'wait' as const, milliseconds: 6000 },
    ];

    const response = await fetch(FIRECRAWL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        url: KC_JUDGE_URL,
        formats: ['html'],
        actions,
        waitFor: 3000,
      }),
    });

    if (!response.ok) {
      console.error('[kc-judges] Firecrawl returned HTTP ' + response.status);
      return [];
    }

    const data = await response.json();
    if (!data.success) {
      console.error('[kc-judges] Firecrawl scrape failed:', data.error);
      return [];
    }

    const html: string = data.data?.html ?? '';
    return parseJudgeSearchResults(html);
  } catch (error) {
    console.error('[kc-judges] Search failed:', error);
    return [];
  }
}

/**
 * Fetch a judge's profile to get their approved breeds and levels.
 */
export async function fetchKcJudgeProfile(kcJudgeId: string): Promise<KcJudgeProfile | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    console.error('[kc-judges] FIRECRAWL_API_KEY not set');
    return null;
  }

  try {
    console.log('[kc-judges] Fetching profile for judgeId=' + kcJudgeId + '...');

    const response = await fetch(FIRECRAWL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        url: KC_JUDGE_PROFILE_URL + '?judgeId=' + encodeURIComponent(kcJudgeId),
        formats: ['html'],
        waitFor: 5000,
      }),
    });

    if (!response.ok) {
      console.error('[kc-judges] Firecrawl returned HTTP ' + response.status);
      return null;
    }

    const data = await response.json();
    if (!data.success) {
      console.error('[kc-judges] Firecrawl profile scrape failed:', data.error);
      return null;
    }

    const html: string = data.data?.html ?? '';
    return parseJudgeProfile(html);
  } catch (error) {
    console.error('[kc-judges] Profile fetch failed:', error);
    return null;
  }
}

// ── Parsing Helpers ───────────────────────────────────────────

/**
 * Parse judge cards from RKC search results HTML.
 *
 * Each judge is an <article class="m-judge-card"> containing:
 * - .m-judge-card__link with judge name and profile URL (includes judgeId)
 * - .m-judge-card__location with county/region
 */
function parseJudgeSearchResults(html: string): KcJudgeResult[] {
  const results: KcJudgeResult[] = [];

  // Split by article tags
  const articles = html.split('<article class="m-judge-card">').slice(1);

  for (const article of articles) {
    // Extract name from the link text
    const nameMatch = article.match(
      /class="m-judge-card__link"[^>]*>([\s\S]*?)<\/a>/,
    );
    if (!nameMatch) continue;

    const name = nameMatch[1]
      .replace(/<[^>]+>/g, '') // strip inner tags
      .replace(/\s+/g, ' ')   // normalise whitespace
      .trim();

    if (!name) continue;

    // Extract judgeId from the profile link
    const idMatch = article.match(/judgeId=([a-f0-9-]+)/i);
    if (!idMatch) continue;

    // Extract location
    const locMatch = article.match(
      /class="m-judge-card__location"[^>]*>([\s\S]*?)<\/div>/,
    );
    const location = locMatch
      ? locMatch[1].replace(/<[^>]+>/g, '').trim()
      : null;

    results.push({
      name,
      location: location || null,
      kcJudgeId: idMatch[1],
    });
  }

  console.log('[kc-judges] Parsed ' + results.length + ' judges from results');
  return results;
}

/**
 * Parse breed approvals from a judge profile page.
 *
 * The profile page has a nested structure:
 *   <h4>Group Name</h4>
 *   <ul class="t-judge-profile__long-list">
 *     <li><div><a>Breed Name</a><br><label>Level N</label></div></li>
 *   </ul>
 */
function parseJudgeProfile(html: string): KcJudgeProfile {
  const breeds: KcJudgeProfile['breeds'] = [];

  // Find all breed approvals with their group
  // Groups are marked by <h4> tags within the profile
  const groupPattern = /<h4>([\s\S]*?)<\/h4>/g;
  let groupMatch;
  const groups: { name: string; startIdx: number }[] = [];

  while ((groupMatch = groupPattern.exec(html)) !== null) {
    const groupName = groupMatch[1].replace(/<[^>]+>/g, '').trim();
    groups.push({ name: groupName, startIdx: groupMatch.index });
  }

  // For each group, find the breed list that follows
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const nextGroupStart = groups[i + 1]?.startIdx ?? html.length;
    const section = html.substring(group.startIdx, nextGroupStart);

    // Find all breed entries in this section
    const breedPattern =
      /<a[^>]*>([\s\S]*?)<\/a>\s*<br[^>]*>\s*<label>\s*(Level\s*\d+|Group)\s*<\/label>/g;
    let breedMatch;

    while ((breedMatch = breedPattern.exec(section)) !== null) {
      const breedName = breedMatch[1].replace(/<[^>]+>/g, '').trim();
      const levelText = breedMatch[2].trim();

      // Parse level number (Level 1-5, or "Group" for group-level approval)
      const levelNum = levelText.startsWith('Level')
        ? parseInt(levelText.replace('Level', '').trim(), 10)
        : 5; // Group-level = highest

      if (breedName) {
        breeds.push({
          breed: breedName,
          group: group.name,
          level: levelNum,
        });
      }
    }
  }

  console.log('[kc-judges] Parsed ' + breeds.length + ' breed approvals from profile');
  return { breeds };
}
