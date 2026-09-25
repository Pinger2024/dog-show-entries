/** The `dog_title_type` enum values, spelled out here rather than imported
 *  from the Drizzle schema because this module is also used by the dog form
 *  (a client component) and must not drag the DB layer into the browser
 *  bundle. `dog-champion-status.test.ts` asserts this list equals
 *  `dogTitleTypeEnum.enumValues`, so adding a title to the schema fails the
 *  suite until it's added here too. */
export const DOG_TITLE_TYPES = [
  'ch',
  'sh_ch',
  'ir_ch',
  'ir_sh_ch',
  'int_ch',
  'ob_ch',
  'ft_ch',
  'wt_ch',
] as const;
export type DogTitleType = (typeof DOG_TITLE_TYPES)[number];

/**
 * RKC "show champion" titles — a dog holding any of these has won CCs (or
 * the equivalent under a recognised governing body) and is therefore barred
 * from every achievement class except Open (Limit/Post Graduate/Graduate/
 * Novice/Maiden/Undergraduate etc. all require the dog NOT to have become a
 * show champion — see CLAUDE.md's RKC class-eligibility note).
 *
 * `ob_ch` (Obedience Champion), `ft_ch` (Field Trial Champion) and `wt_ch`
 * (Working Trial Champion) are deliberately EXCLUDED — those are titles
 * from a different discipline and do not affect breed-class eligibility.
 */
export const SHOW_CHAMPION_TITLES: readonly DogTitleType[] = [
  'ch',
  'sh_ch',
  'ir_ch',
  'ir_sh_ch',
  'int_ch',
];

/**
 * The narrower "RKC Champion" concept used by the RKC title-progress
 * tracker (dashboard "how close is this dog to becoming a Champion")
 * — full Champion or Show Champion only. Bare "Ch"/"Sh Ch" prefixes and
 * `ch`/`sh_ch` title rows count; the international/Irish/foreign titles in
 * `SHOW_CHAMPION_TITLES` do not (they aren't the RKC title being tracked).
 */
export const RKC_CHAMPION_TITLES: readonly DogTitleType[] = ['ch', 'sh_ch'];

type ChampionStatusInput = {
  titles?: Array<{ title: DogTitleType }>;
  registeredName?: string | null;
};

/** Decorative words that can prefix a champion title but don't change which
 *  title it is — a country/kennel-club qualifier (used loosely; exhibitors
 *  write these inconsistently) or "Multi" (multiple titles/countries). */
const DECORATOR_TOKENS = new Set([
  'MULTI',
  'GER',
  'VDH',
  'FR',
  'AM',
  'CAN',
  'AUS',
  'LUX',
  'BEL',
  'NL',
  'DK',
]);

/** Modifiers that combine with a following "CH" token to select a specific
 *  show-champion title. */
const SHOW_MODIFIER_TOKENS = new Set(['SH', 'IR', 'INT']);

/** Modifiers for the non-show-champion disciplines — these must NOT be
 *  treated as show champions even though they also end in "Ch". */
const NON_SHOW_MODIFIER_TOKENS: Record<string, DogTitleType> = {
  OB: 'ob_ch',
  FT: 'ft_ch',
  WT: 'wt_ch',
};

/** Split a name into upper-cased tokens on whitespace and dots (so "Ch.",
 *  "Sh.Ch." etc. tokenise the same as "Ch Sh Ch"). */
function tokenise(name: string): string[] {
  return name
    .trim()
    .toUpperCase()
    .split(/[\s.]+/)
    .filter(Boolean);
}

/**
 * Parse any champion title(s) implied by the START of a dog's registered
 * name — e.g. "CH RENO DE LA PETITE LAETICIA (IMP FRA)" → ['ch'],
 * "IR SH CH SOME DOG" → ['ir_sh_ch'], "MULTI CH FOO" → ['ch'],
 * "CH IR CH FOO" → ['ch', 'ir_ch'].
 *
 * Deliberately conservative: only a whole token that is exactly "CH"
 * (after stripping trailing dots) counts, so "CHARLIE OF ..." or
 * "CHATSWORTH ..." never match — the token boundary is what protects us,
 * not a prefix check.
 *
 * Recognises the modifiers commonly seen in UK GSD circles — Sh(ow),
 * Ir(ish), Int(ernational), Multi, and country qualifiers people write
 * loosely (Ger/VDH, Fr, Am, Can, Aus, Lux, Bel, Nl, Dk) — treating the
 * country qualifiers as decorators (they change nothing about eligibility,
 * they're just "this CC/title was won abroad"). Obedience/Field
 * Trial/Working Trial ("Ob", "Ft", "Wt") are parsed too but map to their
 * own (non-show-champion) title so callers can tell the difference.
 *
 * Only scans the leading run of recognised tokens — the moment a token
 * isn't a modifier or "CH", parsing stops, so the rest of the dog's name
 * is never misread as a title.
 */
export function parseChampionPrefix(
  registeredName: string | null | undefined,
): DogTitleType[] {
  if (!registeredName) return [];

  const tokens = tokenise(registeredName);
  const titles: DogTitleType[] = [];

  let showModifiers = new Set<string>();
  let nonShowModifier: DogTitleType | null = null;

  for (const tok of tokens) {
    if (tok === 'CH') {
      if (nonShowModifier) {
        titles.push(nonShowModifier);
      } else {
        const ir = showModifiers.has('IR');
        const sh = showModifiers.has('SH');
        const intl = showModifiers.has('INT');
        titles.push(
          ir && sh ? 'ir_sh_ch' : ir ? 'ir_ch' : intl ? 'int_ch' : sh ? 'sh_ch' : 'ch',
        );
      }
      showModifiers = new Set();
      nonShowModifier = null;
      continue;
    }
    if (DECORATOR_TOKENS.has(tok)) continue;
    if (SHOW_MODIFIER_TOKENS.has(tok)) {
      showModifiers.add(tok);
      continue;
    }
    if (tok in NON_SHOW_MODIFIER_TOKENS) {
      nonShowModifier = NON_SHOW_MODIFIER_TOKENS[tok];
      continue;
    }
    // Not a recognised title token — the prefix run is over.
    break;
  }

  return titles;
}

/**
 * The ONE place that decides "has this dog become a show champion, and is
 * therefore only eligible for Open" — from a title row (recorded on Remi
 * or entered by an exhibitor/secretary) OR a title typed straight into the
 * registered name (very common for imports and imported dogs, which arrive
 * on Remi with no Remi win history at all).
 */
export function isShowChampion(dog: ChampionStatusInput): boolean {
  const fromTitleRows = (dog.titles ?? []).some((t) =>
    SHOW_CHAMPION_TITLES.includes(t.title),
  );
  if (fromTitleRows) return true;

  return parseChampionPrefix(dog.registeredName).some((t) =>
    SHOW_CHAMPION_TITLES.includes(t),
  );
}

/**
 * The narrower "is this dog already an RKC Champion" check used by the RKC
 * title-progress tracker (Champion/Show Champion only — see
 * `RKC_CHAMPION_TITLES`). Not for class-eligibility — use `isShowChampion`
 * for that.
 */
export function isRkcChampion(dog: ChampionStatusInput): boolean {
  const fromTitleRows = (dog.titles ?? []).some((t) =>
    RKC_CHAMPION_TITLES.includes(t.title),
  );
  if (fromTitleRows) return true;

  return parseChampionPrefix(dog.registeredName).some((t) =>
    RKC_CHAMPION_TITLES.includes(t),
  );
}
