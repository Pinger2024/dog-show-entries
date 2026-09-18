/**
 * ONE owner for "does this championship show have the classes it must have"
 * (CLAUDE.md, "One owner per rule").
 *
 * THE RULE: for a CHAMPIONSHIP show, every breed must have an Open class and
 * a Limit class for BOTH sexes before the show is 'ready'. SV/WUSV regionals
 * are `showType === 'championship'` but run under WUSV rules, not the RKC
 * F-regulations this check enforces, so they are always satisfied here.
 *
 * Open/Limit are identified the same way both existing call sites already
 * did: by the *class definition name*, lower-cased and compared to
 * 'open' / 'limit' (not a slug or enum — `classDefinitions.name` is free
 * text, e.g. "Open", "Limit", "Junior", "Special Award Class Dog").
 *
 * Single-breed fallback: `show_classes.breed_id` is nullable, and on a
 * single-breed show a class row may simply never have had a breed FK set —
 * the breed is implicit in the show's scope, and there is no separate
 * "this show's breed" column on `shows` to read instead. So when
 * `showScope === 'single_breed'`, a class with no breedId is folded into the
 * show's one breed rather than dropped. The pre-existing client copy
 * (class-manager.tsx) did this; the pre-existing server copy
 * (secretary.ts `getChecklistAutoDetect`) did not — it `continue`d past any
 * class with a null breedId, so a fully-classed single-breed show whose rows
 * happened to carry no breedId was reported NOT complete (`breedClassMap`
 * stayed empty, so `size > 0 && allComplete` was false). The client's
 * behaviour is the one that matches the data model — there is no other
 * source of truth for "this show's breed" to fall back to — so it is the one
 * kept here.
 *
 * The fallback breed identity is derived the same way the client derived it:
 * the name of the first class row that DOES carry a breed. If no row in a
 * single-breed show carries a breed at all, breedless rows are grouped under
 * a single implicit-breed bucket with no name.
 */

export type ChampionshipClassSex = 'dog' | 'bitch';

export interface ChampionshipClassInput {
  /** Nullable FK — see single-breed fallback above. */
  breedId?: string | null;
  breedName?: string | null;
  /** The class definition's free-text name, e.g. 'Open', 'Limit'. */
  classDefinitionName?: string | null;
  sex?: ChampionshipClassSex | null;
}

export interface MissingChampionshipClass {
  /** breedId when known; null for the single-breed implicit-fallback bucket. */
  breedId: string | null;
  /** Display name — the breed's name, or 'the breed' when none is known. */
  breedName: string;
  sex: ChampionshipClassSex;
  className: 'Open' | 'Limit';
}

export interface ChampionshipClassRequirementsInput {
  showType: string;
  showScope?: string | null;
  /** SV/WUSV regionals are championship-typed but exempt — see module doc. */
  showRuleset?: string | null;
  classes: ChampionshipClassInput[];
}

const SINGLE_BREED_FALLBACK_KEY = '__single_breed_fallback__';

function classKind(name: string | null | undefined): 'open' | 'limit' | null {
  const normalised = name?.trim().toLowerCase() ?? '';
  if (normalised === 'open') return 'open';
  if (normalised === 'limit') return 'limit';
  return null;
}

/**
 * Returns the list of missing Open/Limit classes for a championship show.
 * Empty when the show is not a championship show, runs under WUSV rules, or
 * already has every required class. Both the class-manager live warning and
 * `getChecklistAutoDetect` / `getPhaseBlockers` on the server must call this
 * rather than re-deriving the Open/Limit-per-breed-per-sex check inline.
 */
export function missingChampionshipClasses({
  showType,
  showScope,
  showRuleset,
  classes,
}: ChampionshipClassRequirementsInput): MissingChampionshipClass[] {
  if (showType !== 'championship' || showRuleset === 'wusv') return [];

  const isSingleBreed = showScope === 'single_breed';
  const fallbackBreed = isSingleBreed
    ? classes.find((c) => c.breedId && c.breedName)
    : undefined;

  type Entry = {
    breedId: string | null;
    breedName: string;
    hasOpenDog: boolean;
    hasOpenBitch: boolean;
    hasLimitDog: boolean;
    hasLimitBitch: boolean;
  };
  const breedMap = new Map<string, Entry>();

  for (const sc of classes) {
    let key: string | null;
    let breedId: string | null;
    let breedName: string;
    if (sc.breedId) {
      key = sc.breedId;
      breedId = sc.breedId;
      breedName = sc.breedName?.trim() || 'the breed';
    } else if (isSingleBreed) {
      key = SINGLE_BREED_FALLBACK_KEY;
      breedId = fallbackBreed?.breedId ?? null;
      breedName = fallbackBreed?.breedName?.trim() || sc.breedName?.trim() || 'the breed';
    } else if (sc.breedName) {
      // Multi-breed show, class row with no breed FK but a breed name to
      // hand — the client's class shape has no id at all, only a name, so
      // name is the only key it can group by. Server rows always carry the
      // real id and take the branch above instead.
      key = sc.breedName.trim();
      breedId = null;
      breedName = sc.breedName.trim();
    } else {
      // No breed FK and no breed name — nothing to attribute this class to.
      continue;
    }

    if (!breedMap.has(key)) {
      breedMap.set(key, { breedId, breedName, hasOpenDog: false, hasOpenBitch: false, hasLimitDog: false, hasLimitBitch: false });
    }
    const entry = breedMap.get(key)!;
    const kind = classKind(sc.classDefinitionName);
    if (kind === 'open' && sc.sex === 'dog') entry.hasOpenDog = true;
    if (kind === 'open' && sc.sex === 'bitch') entry.hasOpenBitch = true;
    if (kind === 'limit' && sc.sex === 'dog') entry.hasLimitDog = true;
    if (kind === 'limit' && sc.sex === 'bitch') entry.hasLimitBitch = true;
  }

  const missing: MissingChampionshipClass[] = [];
  for (const entry of breedMap.values()) {
    const checks: [boolean, ChampionshipClassSex, 'Open' | 'Limit'][] = [
      [entry.hasOpenDog, 'dog', 'Open'],
      [entry.hasOpenBitch, 'bitch', 'Open'],
      [entry.hasLimitDog, 'dog', 'Limit'],
      [entry.hasLimitBitch, 'bitch', 'Limit'],
    ];
    for (const [has, sex, className] of checks) {
      if (!has) missing.push({ breedId: entry.breedId, breedName: entry.breedName, sex, className });
    }
  }
  return missing;
}
