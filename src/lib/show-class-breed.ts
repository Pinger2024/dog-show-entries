/**
 * Which breed a new show class is saved with — the ONE owner (CLAUDE.md "One
 * owner per rule"). Every path that inserts show_classes calls this.
 *
 * Why it matters: Remi reads a judge line with no breed and no sex as the
 * Junior Handling judge (buildJudgeBreedAndClassification in
 * lib/judge-breed-classification.ts, and the renderers that share that test).
 * The Add Judge wizard copies each class's breed and sex onto the judge's lines.
 * So a mixed breed class saved with no breed gave its judge the Junior Handling
 * shape: South Western's Open Show (set up "Combined Dog & Bitch") offered its
 * breed judge "… Dogs & Bitches classes / Junior Handling" (Mandy, Telegram
 * 8355, 19 Nov 2026).
 *
 * The rule, matching every earlier single-breed show on live:
 *   - a breed the caller chose is kept;
 *   - on a single-breed show, a mixed class that is not Junior Handling
 *     (Veteran, a Special Award Class, every class of a combined show) is saved
 *     with the show's breed;
 *   - Dog and Bitch classes on a single-breed show stay breed-less (the breed is
 *     implicit, and their sex already tells them apart from Junior Handling);
 *   - Junior Handling is never given a breed; it judges the handler, not the dog.
 *
 * Pure (no db imports) so tests and client code can use it.
 */

export interface ShowForClassBreed {
  showScope: string | null;
  /** The show's own breed — set on single-breed shows. */
  breedId: string | null;
}

export interface NewShowClassForBreed {
  sex: 'dog' | 'bitch' | null | undefined;
  /** class_definitions.type — 'junior_handler' for Junior Handling. */
  classDefinitionType: string | null | undefined;
  /** A breed the secretary (or a per-breed bulk path) chose for this class. */
  breedId?: string | null;
}

export function newShowClassBreed(
  show: ShowForClassBreed,
  cls: NewShowClassForBreed,
): { breedId: string | null; isBreedSpecific: boolean } {
  if (cls.classDefinitionType === 'junior_handler') return { breedId: null, isBreedSpecific: false };
  if (cls.breedId) return { breedId: cls.breedId, isBreedSpecific: true };
  if (show.showScope === 'single_breed' && show.breedId && cls.sex == null) {
    return { breedId: show.breedId, isBreedSpecific: true };
  }
  return { breedId: null, isBreedSpecific: false };
}
