/**
 * Schedule component dispatcher.
 *
 * Three top-level components live in this directory:
 *   - `ShowSchedule` — single-breed RKC renderer.
 *   - `ShowScheduleMultibreed` — multi-breed RKC renderer.
 *   - `SvShowSchedule` — WUSV/SV regional renderer ("Sieger Editorial").
 *
 * They share types, palette, styles, and helper elements via `./shared/` but
 * are otherwise independent. Consumers (route.ts, pdf-generation.ts, preview
 * scripts, tests) should either import the dispatcher from here, or import
 * the specific component directly when they know which variant they want.
 */
import { ShowSchedule } from './show-schedule';
import { ShowScheduleMultibreed } from './show-schedule-multibreed';
import { SvShowSchedule } from './sv-show-schedule';

export { ShowSchedule, ShowScheduleMultibreed, SvShowSchedule };
export type {
  ScheduleShowInfo,
  ScheduleClass,
  ScheduleJudge,
  ScheduleSponsor,
  SchedulePanelJudge,
} from './shared/types';

/**
 * Pick the right schedule component for a show.
 *
 *   showRuleset === 'wusv'     → SvShowSchedule           (six-page Sieger)
 *   showScope === 'single_breed' → ShowSchedule           (RKC single-breed)
 *   otherwise                  → ShowScheduleMultibreed   (RKC multi-breed)
 *
 * Defaults: showRuleset='rkc'. Callers that don't yet know the ruleset can
 * omit it and get the legacy RKC behaviour.
 */
export function pickScheduleComponent(
  showScope: string,
  showRuleset: 'rkc' | 'wusv' = 'rkc',
) {
  if (showRuleset === 'wusv') return SvShowSchedule;
  return showScope === 'single_breed' ? ShowSchedule : ShowScheduleMultibreed;
}
