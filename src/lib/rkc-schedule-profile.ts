export const RKC_SCHEDULE_SPECIMEN_VERSION = 'April 2026';

export interface RkcScheduleProfileInput {
  showType: string;
  showScope: string;
  judgedOnGroupSystem?: boolean | null;
}

export interface RkcScheduleProfile {
  title: string;
  /**
   * The designation portion of `title` — everything after "SCHEDULE OF "
   * (e.g. "UNBENCHED BREED CHAMPIONSHIP SHOW"). Exposed so other RKC
   * documents can compose their own "<DOCUMENT> OF <designation>" line
   * (the catalogue cover reads "CATALOGUE OF …") without hand-copying the
   * type/scope/group-system wording logic below — Mandy 2026-08-17: the
   * catalogue must carry the same formal designation as the schedule.
   */
  designation: string;
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
  const isGroupShow = showScope === 'group';
  const ordinaryTypeLabel = showType === 'premier_open'
    ? 'PREMIER OPEN'
    : showType.toUpperCase().replaceAll('_', ' ');
  const typeLabel = showType === 'championship'
    ? singleBreed
      ? 'BREED CHAMPIONSHIP'
      : isGroupShow
        ? 'GROUP CHAMPIONSHIP'
        : 'GENERAL CHAMPIONSHIP'
    : singleBreed
      ? `${ordinaryTypeLabel} SINGLE BREED`
      : ordinaryTypeLabel;

  const systemLabel = !singleBreed && showType !== 'championship'
    ? isGroupSystem ? ' JUDGED ON THE GROUP SYSTEM' : ' NOT JUDGED ON THE GROUP SYSTEM'
    : '';

  const designation = `UNBENCHED ${typeLabel} SHOW${systemLabel}`;

  return {
    title: `SCHEDULE OF ${designation}`,
    designation,
    specimenVersion: RKC_SCHEDULE_SPECIMEN_VERSION,
    minimumClasses: singleBreed ? 12 : 16,
    minimumPuppyAgeMonths: singleBreed ? 4 : 6,
    allowsBabyPuppy: singleBreed,
    isGroupSystem,
  };
}
