import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  searchKcDogs,
  fetchKcDogProfile,
  generateSearchVariants,
  parseSearchPage,
  parseHealthCards,
  RkcUnavailableError,
} from '../kc-lookup';

// ── Fixture HTML — small snippets extracted from a real RKC search page and
//    /tmp/kc-profile-sample.html (a saved profile) plus live no-results and
//    real-hip-score probes taken 2026-08-12, NOT the full 259KB pages. ──

/** A real RKC no-results response contains this exact metadata div — the
 *  same "t-search__metadata-results" wrapper also appears on a HIT page
 *  (with "Found N results" instead), so the marker has to be the phrase. */
const NO_RESULTS_HTML = `
<div class="t-search__metadata">
  <div class="t-search__metadata-results"> No results can be found for the search term &#x27;zzzz&#x27;</div>
</div>
<div class="u-card-grid u-card-grid--columns-3"></div>`;

/** Neither a dog card nor the no-results phrase — simulates RKC changing
 *  the page markup under us. */
const CANARY_HTML = `<div class="t-search__unexpected-layout">Something else entirely</div>`;

function dogCardHtml(opts: {
  name: string;
  breed?: string;
  sex?: string;
  dob?: string;
  colour?: string;
  dogId?: string;
}): string {
  const { name, breed = 'German Shepherd Dog', sex = 'Dog', dob = '01/01/2023', colour = 'Black & Tan', dogId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' } = opts;
  return `<div class="m-dog-card">
    <a class="m-dog-card__link" href="/search/dog-profile/?dogId=${dogId}">
      <div class="m-dog-card__header">
        <div class="m-dog-card__body">
          <div class="m-dog-card__category">${breed}</div>
          <strong class="m-dog-card__title">${name}</strong>
        </div>
      </div>
    </a>
    <div class="m-dog-card__summary">
      <dl class="m-breed-summary__list">
        <div class="m-breed-summary__item">
          <dt class="m-breed-summary__key"><span class="m-breed-summary__key-label">Sex</span></dt>
          <dd class="m-breed-summary__value">${sex}</dd>
        </div>
        <div class="m-breed-summary__item">
          <dt class="m-breed-summary__key"><span class="m-breed-summary__key-label">Colour</span></dt>
          <dd class="m-breed-summary__value">${colour}</dd>
        </div>
        <div class="m-breed-summary__item">
          <dt class="m-breed-summary__key"><span class="m-breed-summary__key-label">Date of birth</span></dt>
          <dd class="m-breed-summary__value">${dob}</dd>
        </div>
      </dl>
    </div>
  </div>`;
}

function hitPageHtml(cards: Parameters<typeof dogCardHtml>[0][]): string {
  return `<div class="t-search__metadata-results">Found ${cards.length} results</div>
  <div class="u-card-grid u-card-grid--columns-3">${cards.map(dogCardHtml).join('\n')}</div>`;
}

/** A "No Record Held" health card — the shape every screening/DNA card uses
 *  when RKC has nothing on file (the common case; real values are rarer). */
function noRecordCard(title: string): string {
  return `<div class="t-dog-profile__card health-card">
    <strong class="t-dog-profile__card-title ">
        ${title}
         - No Record Held
    </strong>
        <p>Our records indicate this health result is not recorded on our system.</p>
</div>`;
}

/** A real BVA/KC hip or elbow dysplasia card, matching the exact markup a
 *  live scored dog's profile page renders (Left/Right/Total score spans). */
function dysplasiaCard(title: string, left: number, right: number, total?: number): string {
  return `<div class="t-dog-profile__card health-card">
    <strong class="t-dog-profile__card-title ">
        ${title}

    </strong>
        <span class="t-dog-profile__card-result">
            Left score: ${left}
        </span>
        <span class="t-dog-profile__card-result">
            Right score: ${right}
        </span>
        <span class="t-dog-profile__card-result">
            Total score: ${total ?? left + right}
        </span>
            <small class="t-dog-profile__card-detail">Test performed on 02 November 2022</small>
</div>`;
}

/** A real DNA test card with a single result value. */
function dnaResultCard(title: string, result: string): string {
  return `<div class="t-dog-profile__card health-card">
    <strong class="t-dog-profile__card-title ">
        ${title}

    </strong>
        <span class="t-dog-profile__card-result">
            ${result}
        </span>
</div>`;
}

/** The unrelated EBV card shape — same "t-dog-profile__card" base class but
 *  WITHOUT "health-card", and no trailing space on card-title's class. Used
 *  to prove parseHealthCards doesn't pick these up (they use plain titles
 *  like "Hip" / "Elbow" that would otherwise collide with real tests). */
function ebvCardHtml(title: string): string {
  return `<div class="t-dog-profile__card t-dog-profile__card--centred">
    <strong class="t-dog-profile__card-title">${title}</strong>
    <div class="m-ebv-gauge">Score: 0/0=0</div>
</div>`;
}

const PEDIGREE_HTML = `
<div class="m-pedigree-graph__dog m-pedigree-graph__dog--current">CURRENT DOG</div>
<ul class="m-pedigree-graph__list">
  <li>
    <div class="m-pedigree-graph__dog-name"><a href="#">SIRE OF TEST</a></div>
    <ul class="m-pedigree-graph__list">
      <li><div class="m-pedigree-graph__dog-name">GRANDSIRE (SHOULD BE IGNORED)</div></li>
    </ul>
  </li>
  <li>
    <div class="m-pedigree-graph__dog-name"><a href="#">DAM OF TEST</a></div>
  </li>
</ul>`;

const STUDBOOK_HTML = `<dt>Studbook number</dt>\n<dd>3223DJ</dd>`;

function fullProfileHtml(healthCardsHtml: string): string {
  return `${PEDIGREE_HTML}\n${STUDBOOK_HTML}\n<section>${healthCardsHtml}</section>`;
}

/** A minimal fetch Response stand-in. */
function fakeResponse(status: number, html = ''): Response {
  return { ok: status < 400, status, text: async () => html } as Response;
}

/** Routes a stubbed `fetch` by the URL's `Filter` (search) or `dogId`
 *  (profile) query param — each call returns whatever the route function
 *  returns for that value, or throws if the test didn't expect that call. */
function routedFetch(routes: Record<string, () => Response>): ReturnType<typeof vi.fn> {
  return vi.fn(async (url: string) => {
    const parsed = new URL(url);
    const key = parsed.searchParams.get('Filter') ?? parsed.searchParams.get('dogId') ?? '';
    const route = routes[key];
    if (!route) throw new Error(`kc-lookup test: no route stubbed for "${key}" (url: ${url})`);
    return route();
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('generateSearchVariants', () => {
  it('dedupes when the apostrophe-strip and possessive-flip transforms coincide', () => {
    const variants = generateSearchVariants("GAYVILLE'S PICASSO");
    // Straight->curly, then "GAYVILLES PICASSO" (apostrophe-strip and
    // possessive-flip land on the same string here) exactly once, then
    // whitespace-collapse is a no-op (already single-spaced) so it's absent.
    expect(variants).toEqual(["GAYVILLE’S PICASSO", 'GAYVILLES PICASSO', 'GAYVILLE PICASSO']);
  });

  it('adds a possessive apostrophe back in when the first token has none', () => {
    const variants = generateSearchVariants('ESPERANZAS EZRA');
    expect(variants).toContain("ESPERANZA'S EZRA");
  });

  it('collapses irregular whitespace only when it changes something', () => {
    const variants = generateSearchVariants('THORNFIELD    REX');
    expect(variants).toContain('THORNFIELD REX');
  });

  it('drops the possessive entirely — the real 2026-08-08 case', () => {
    // "ESPERANZA EZRA" is the registered name; the owner typed
    // "Esperanza's Ezra" five ways before finding it by hand.
    const variants = generateSearchVariants("Esperanza's Ezra");
    expect(variants).toContain('Esperanza Ezra');
  });

  it('never returns more than 5 variants', () => {
    // Every transform applies to this input (apostrophe present + first
    // token ends 's' in a way both apostrophe rules fire + ragged spacing).
    const variants = generateSearchVariants("KENNEL'S   DOG'S NAME");
    expect(variants.length).toBeLessThanOrEqual(5);
  });

  it('returns nothing to try for a query with no apostrophe and clean spacing', () => {
    expect(generateSearchVariants('ROVER FIDO')).toEqual([]);
  });
});

describe('parseSearchPage (parser canary)', () => {
  it('parses dog cards on a hit page', () => {
    const outcome = parseSearchPage(hitPageHtml([{ name: 'TEST DOG ONE' }]));
    expect(outcome.kind).toBe('hit');
    if (outcome.kind === 'hit') {
      expect(outcome.results).toHaveLength(1);
      expect(outcome.results[0].registeredName).toBe('TEST DOG ONE');
    }
  });

  it('recognises the genuine no-results marker', () => {
    expect(parseSearchPage(NO_RESULTS_HTML).kind).toBe('no-results');
  });

  it('flags a page with neither shape as a canary, not a silent no-results', () => {
    expect(parseSearchPage(CANARY_HTML).kind).toBe('canary');
  });
});

describe('parseHealthCards', () => {
  it('marks a "No Record Held" card as absent and strips the suffix from the title', () => {
    const [card] = parseHealthCards(noRecordCard('DNA - DM (CDRM)'));
    expect(card.noRecordHeld).toBe(true);
    expect(card.title).toBe('DNA - DM (CDRM)');
    expect(card.results).toEqual([]);
  });

  it('extracts Left/Right/Total scores from a real dysplasia card', () => {
    const [card] = parseHealthCards(dysplasiaCard('BVA/KC Hip Dysplasia', 4, 6, 10));
    expect(card.noRecordHeld).toBe(false);
    expect(card.results).toEqual(['Left score: 4', 'Right score: 6', 'Total score: 10']);
  });

  it('extracts a single result value from a real DNA test card', () => {
    const [card] = parseHealthCards(dnaResultCard('DNA - PDP-1', 'Hereditary Clear'));
    expect(card.noRecordHeld).toBe(false);
    expect(card.results).toEqual(['Hereditary Clear']);
  });

  it('does not pick up unrelated EBV cards (different div class, no trailing space on title class)', () => {
    const cards = parseHealthCards(ebvCardHtml('Hip'));
    expect(cards).toEqual([]);
  });

  it('parses multiple cards from one page in document order', () => {
    const html = noRecordCard('DNA - EIC') + dysplasiaCard('BVA/KC Elbow Dysplasia', 0, 0, 0);
    const cards = parseHealthCards(html);
    expect(cards.map((c) => c.title)).toEqual(['DNA - EIC', 'BVA/KC Elbow Dysplasia']);
  });
});

describe('searchKcDogs', () => {
  it('returns results from the exact query with a single fetch when it hits', async () => {
    const fetchMock = routedFetch({
      'Exact Hit Dog': () => fakeResponse(200, hitPageHtml([{ name: 'EXACT HIT DOG' }])),
    });
    vi.stubGlobal('fetch', fetchMock);

    const results = await searchKcDogs('Exact Hit Dog');
    expect(results).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to a variant when the exact query misses, and stops at the first hit', async () => {
    const fetchMock = routedFetch({
      "Variant Fallback's Dog": () => fakeResponse(200, NO_RESULTS_HTML),
      // The curly-apostrophe variant is tried first and hits.
      'Variant Fallback’s Dog': () => fakeResponse(200, hitPageHtml([{ name: 'VARIANT FALLBACK DOG' }])),
    });
    vi.stubGlobal('fetch', fetchMock);

    const results = await searchKcDogs("Variant Fallback's Dog");
    expect(results).toHaveLength(1);
    expect(results[0].registeredName).toBe('VARIANT FALLBACK DOG');
    // Exact query + exactly one successful variant — no further variants tried.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caches a confirmed-empty result so a repeat search does not refetch', async () => {
    const fetchMock = routedFetch({
      'Cached Miss Dog': () => fakeResponse(200, NO_RESULTS_HTML),
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = await searchKcDogs('Cached Miss Dog');
    const callsAfterFirst = fetchMock.mock.calls.length;
    const second = await searchKcDogs('Cached Miss Dog');

    expect(first).toEqual([]);
    expect(second).toEqual([]);
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst); // no new fetches
  });

  it('serves a fresh cached hit without refetching', async () => {
    const fetchMock = routedFetch({
      'Fresh Cache Dog': () => fakeResponse(200, hitPageHtml([{ name: 'FRESH CACHE DOG' }])),
    });
    vi.stubGlobal('fetch', fetchMock);

    await searchKcDogs('Fresh Cache Dog');
    const callsAfterFirst = fetchMock.mock.calls.length;
    const second = await searchKcDogs('fresh cache dog'); // different case — same normalised key
    expect(second[0].registeredName).toBe('FRESH CACHE DOG');
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
  });

  it('retries once on a 5xx and succeeds on the retry', async () => {
    let attempt = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      attempt++;
      if (attempt === 1) return fakeResponse(503);
      return fakeResponse(200, hitPageHtml([{ name: 'RETRY SUCCESS DOG' }]));
    }));

    const results = await searchKcDogs('Retry Success Dog');
    expect(results).toHaveLength(1);
    expect(attempt).toBe(2);
  });

  it('throws RkcUnavailableError when still 5xx after retry and nothing is cached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(503)));
    await expect(searchKcDogs('Never Cached Down Dog')).rejects.toBeInstanceOf(RkcUnavailableError);
  });

  it('serves a stale cached result instead of throwing when RKC is down but a cache entry exists', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(200, hitPageHtml([{ name: 'STALE SERVE DOG' }]))));
    await searchKcDogs('Stale Serve Dog');

    // Age the cache past its 24h TTL, then make every fetch fail 5xx.
    vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000);
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(503)));

    const promise = searchKcDogs('Stale Serve Dog');
    await vi.advanceTimersByTimeAsync(1000); // let the internal retry delay elapse
    const results = await promise;

    expect(results).toHaveLength(1);
    expect(results[0].registeredName).toBe('STALE SERVE DOG');
  });

  it('logs a parser canary and still falls through to variants rather than silently returning nothing', async () => {
    const canarySpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = routedFetch({
      'Canary Test Dog': () => fakeResponse(200, CANARY_HTML),
      'Canary Test Dog’': () => fakeResponse(200, CANARY_HTML), // won't actually be requested, safety net
    });
    vi.stubGlobal('fetch', fetchMock);

    const results = await searchKcDogs('Canary Test Dog');
    expect(results).toEqual([]);
    expect(canarySpy.mock.calls.some((call) => String(call[0]).includes('PARSER CANARY'))).toBe(true);
    canarySpy.mockRestore();
  });
});

describe('fetchKcDogProfile', () => {
  it('parses sire, dam, studbook number, hip/elbow scores and DM result from a full profile page', async () => {
    const healthHtml =
      dysplasiaCard('BVA/KC Hip Dysplasia', 4, 6, 10) +
      dysplasiaCard('BVA/KC Elbow Dysplasia', 0, 1, 1) +
      dnaResultCard('DNA - DM (CDRM)', 'Clear (Hereditary)');
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(200, fullProfileHtml(healthHtml))));

    const profile = await fetchKcDogProfile('profile-dog-1');
    expect(profile).not.toBeNull();
    expect(profile?.sire).toBe('SIRE OF TEST');
    expect(profile?.dam).toBe('DAM OF TEST');
    expect(profile?.studbookNumber).toBe('3223DJ');
    expect(profile?.hipScore).toBe('4:6 (total 10)');
    expect(profile?.elbowScore).toBe('0:1 (total 1)');
    expect(profile?.dmTest).toBe('clear');
  });

  it('treats "No Record Held" as absent, not as a not_tested result', async () => {
    const healthHtml = noRecordCard('DNA - DM (CDRM)');
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(200, fullProfileHtml(healthHtml))));

    const profile = await fetchKcDogProfile('profile-dog-2');
    expect(profile?.dmTest).toBeUndefined();
  });

  it('maps a carrier-worded DM result onto the SV health card vocabulary', async () => {
    const healthHtml = dnaResultCard('DNA - DM (CDRM)', 'Carrier (Hereditary)');
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(200, fullProfileHtml(healthHtml))));

    const profile = await fetchKcDogProfile('profile-dog-3');
    expect(profile?.dmTest).toBe('carrier');
  });

  it('stores nothing and warns when a DM result does not map onto clear/carrier/affected', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const healthHtml = dnaResultCard('DNA - DM (CDRM)', 'Inconclusive — resample requested');
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(200, fullProfileHtml(healthHtml))));

    const profile = await fetchKcDogProfile('profile-dog-4');
    expect(profile?.dmTest).toBeUndefined();
    expect(warnSpy.mock.calls.some((call) => String(call[0]).includes('DNA - DM (CDRM)'))).toBe(true);
    warnSpy.mockRestore();
  });

  it('serves a cached profile without refetching', async () => {
    const fetchMock = vi.fn(async () => fakeResponse(200, fullProfileHtml(noRecordCard('DNA - DM (CDRM)'))));
    vi.stubGlobal('fetch', fetchMock);

    await fetchKcDogProfile('profile-dog-cache-1');
    const callsAfterFirst = fetchMock.mock.calls.length;
    await fetchKcDogProfile('profile-dog-cache-1');
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
  });
});
