export const RKC_SCHEDULE_SPECIMEN_VERSION = 'April 2026';

export interface RkcScheduleProfileInput {
  showType: string;
  showScope: string;
  judgedOnGroupSystem?: boolean | null;
}

export interface RkcScheduleProfile {
  title: string;
  specimenVersion: typeof RKC_SCHEDULE_SPECIMEN_VERSION;
  minimumClasses: 12 | 16;
  minimumPuppyAgeMonths: 4 | 6;
  allowsBabyPuppy: boolean;
  isGroupSystem: boolean;
}

/**
 * Selects the current RKC specimen family. Keeping this decision in one place
 * prevents the cover, numbered rules and lifecycle validation from drifting.
 */
export function getRkcScheduleProfile({
  showType,
  showScope,
  judgedOnGroupSystem = false,
}: RkcScheduleProfileInput): RkcScheduleProfile {
  const singleBreed = showScope === 'single_breed';
  const isGroupSystem = !singleBreed && judgedOnGroupSystem === true;
  const typeLabel = showType === 'championship'
    ? singleBreed ? 'BREED CHAMPIONSHIP' : 'GENERAL CHAMPIONSHIP'
    : showType === 'premier_open'
      ? 'PREMIER OPEN'
      : showType.toUpperCase().replaceAll('_', ' ');

  const systemLabel = !singleBreed && showType !== 'championship'
    ? isGroupSystem ? ' JUDGED ON THE GROUP SYSTEM' : ' NOT JUDGED ON THE GROUP SYSTEM'
    : '';
  const scopeLabel = singleBreed && showType !== 'championship' ? 'SINGLE BREED ' : '';

  return {
    title: `SCHEDULE OF UNBENCHED ${scopeLabel}${typeLabel} SHOW${systemLabel}`,
    specimenVersion: RKC_SCHEDULE_SPECIMEN_VERSION,
    minimumClasses: singleBreed ? 12 : 16,
    minimumPuppyAgeMonths: singleBreed ? 4 : 6,
    allowsBabyPuppy: singleBreed,
    isGroupSystem,
  };
}
