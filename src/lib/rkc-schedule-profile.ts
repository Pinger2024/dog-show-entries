/**
 * Which edition of the RKC Dog Showing (F) regulations — and therefore which
 * specimen schedule — a show runs under.
 */
export type RkcRegulationYear = 2026 | 2027;

export const RKC_SCHEDULE_SPECIMEN_VERSIONS: Record<RkcRegulationYear, string> = {
  2026: 'April 2026',
  2027: '2027 edition',
};

/**
 * The regulations a show runs under. The 2027 amendments (RKC Dog Shows'
 * 26 Oct 2026 mailing to club secretaries) take effect for shows whose FIRST
 * DAY is on or after 1 January 2027 — NOT for schedules merely produced after
 * that date. A show on 10 January 2027 prints its schedule in December 2026
 * and already follows the new wording, so the show date is the only input that
 * can decide this.
 *
 * ONE owner (CLAUDE.md, "One owner per rule"): every 2026-vs-2027 text branch
 * in the schedule, the entry declaration and the catalogue front matter reads
 * this, so the cut-over happens in exactly one place and the 2026 golden
 * baselines stay byte-stable.
 *
 * No date at all (an unsaved draft) falls back to today, so the default can
 * never go stale once the cut-over passes.
 */
export function getRkcRegulationYear(startDate?: string | Date | null): RkcRegulationYear {
  const year = showCalendarYear(startDate) ?? new Date().getFullYear();
  return year >= 2027 ? 2027 : 2026;
}

/**
 * The calendar year of a show's first day. `start_date` is a Postgres `date`,
 * so it arrives as 'YYYY-MM-DD' and its year is literally the first four
 * characters — no parsing, and so no timezone to get wrong (see
 * project_document_dates_utc_bug_2026-09-03: CI runs UTC as the proof).
 */
function showCalendarYear(value?: string | Date | null): number | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const iso = /^(\d{4})-\d{2}-\d{2}/.exec(value);
    if (iso) return Number(iso[1]);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getFullYear();
  }
  return Number.isNaN(value.getTime()) ? null : value.getFullYear();
}

export interface RkcScheduleProfileInput {
  showType: string;
  showScope: string;
  judgedOnGroupSystem?: boolean | null;
  /** The show's first day — decides the regulation year. */
  startDate?: string | Date | null;
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
  specimenVersion: string;
  /** The F-regulation edition this show runs under — see {@link getRkcRegulationYear}. */
  regulationYear: RkcRegulationYear;
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
  startDate = null,
}: RkcScheduleProfileInput): RkcScheduleProfile {
  const regulationYear = getRkcRegulationYear(startDate);
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
    specimenVersion: RKC_SCHEDULE_SPECIMEN_VERSIONS[regulationYear],
    regulationYear,
    minimumClasses: singleBreed ? 12 : 16,
    minimumPuppyAgeMonths: singleBreed ? 4 : 6,
    allowsBabyPuppy: singleBreed,
    isGroupSystem,
  };
}
