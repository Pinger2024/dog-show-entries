/**
 * Schedule component dispatcher.
 *
 * Two top-level components live in this directory: the single-breed renderer
 * and the multi-breed renderer. They share types, palette, styles, and helper
 * elements via ./shared/ but are otherwise independent — single-breed shows
 * (Amanda's GSD club) don't touch multi-breed code, and vice-versa.
 *
 * Consumers (route.ts, pdf-generation.ts, preview scripts, tests) should
 * either import the dispatcher from here, or import the specific component
 * directly when they know which variant they want.
 */
import { ShowSchedule } from './show-schedule';
import { ShowScheduleMultibreed } from './show-schedule-multibreed';

export { ShowSchedule, ShowScheduleMultibreed };
export type {
  ScheduleShowInfo,
  ScheduleClass,
  ScheduleJudge,
  ScheduleSponsor,
} from './shared/types';

/**
 * Pick the right schedule component for a show based on its scope.
 * - 'single_breed' → ShowSchedule (single-breed, two-column class table)
 * - 'group' / 'general' → ShowScheduleMultibreed (multi-breed, group-banded table)
 */
export function pickScheduleComponent(showScope: string) {
  return showScope === 'single_breed' ? ShowSchedule : ShowScheduleMultibreed;
}
