/**
 * RKC Judge Lookup via direct HTTP fetch.
 *
 * The RKC "Find a Judge" page server-renders results when the full set of
 * form parameters is included in the URL query string. This means we can
 * skip Firecrawl entirely and use a simple fetch + HTML parse.
 *
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

const KC_JUDGE_SEARCH_URL = 'https://www.royalkennelclub.com/search/find-a-judge/';
const KC_JUDGE_PROFILE_URL = 'https://www.royalkennelclub.com/search/find-a-judge/judge-profile/';

/**
 * Search for RKC judges by surname.
 *
 * Builds the full form-parameter URL that the RKC page expects, fetches the
 * server-rendered HTML, and parses judge cards from the response.
 */
export async function searchKcJudges(
  surname: string,
  _breed?: string,
): Promise<KcJudgeResult[]> {
  try {
    console.log(`[kc-judges] Searching for "${surname}"...`);

    const params = new URLSearchParams({
      KeywordSearch: surname,
      SelectedChampionshipActivities: '',
      SelectedNonChampionshipActivities: '',
      SelectedPanelAFieldTrials: '',
      SelectedPanelBFieldTrials: '',
      SelectedSearchOptions: '',
      SelectedSearchOptionsNotActivity: '',
      Championship: 'False',
      NonChampionship: 'False',
      PanelA: 'False',
      PanelB: 'False',
      Distance: '15',
      TotalResults: '0',
      SearchProfile: 'True',
      SelectedBestInBreedGroups: '',
      SelectedBestInSubGroups: '',
    });

    const url = `${KC_JUDGE_SEARCH_URL}?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Remi/1.0)',
        Accept: 'text/html',
      },
    });

    if (!response.ok) {
      console.error('[kc-judges] RKC returned HTTP ' + response.status);
      return [];
    }

    const html = await response.text();
    return parseJudgeSearchResults(html);
  } catch (error) {
    console.error('[kc-judges] Search failed:', error);
    return [];
  }
}

/**
 * Fetch a judge's profile to get their approved breeds and levels.
 *
 * Profile pages are also server-rendered, so we can fetch directly.
 */
export async function fetchKcJudgeProfile(kcJudgeId: string): Promise<KcJudgeProfile | null> {
  try {
    console.log('[kc-judges] Fetching profile for judgeId=' + kcJudgeId + '...');

    const url = `${KC_JUDGE_PROFILE_URL}?judgeId=${encodeURIComponent(kcJudgeId)}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Remi/1.0)',
        Accept: 'text/html',
      },
    });

    if (!response.ok) {
      console.error('[kc-judges] RKC returned HTTP ' + response.status);
      return null;
    }

    const html = await response.text();
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

  // Split by article tags (class may include additional modifiers like m-cardResult-BackgroundMedium)
  const articles = html.split(/<article class="m-judge-card[^"]*">/);
  articles.shift(); // remove everything before the first match

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
