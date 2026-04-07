/**
 * Shared RKC regulatory compliance helpers.
 * Used by schedule PDFs, catalogue PDFs, and the print pipeline.
 */

/**
 * Docking statement per RKC F(1).7.c(2).
 * Varies by country (England/Wales have different effective dates) and
 * whether the show charges public admission (which triggers stricter rules).
 */
export function getDockingStatement(
  country: string = 'england',
  publicAdmission: boolean = true,
): string {
  if (publicAdmission && country === 'england') {
    return 'A dog docked on or after 6 April 2007 may not be entered for exhibition at this show.';
  }
  if (publicAdmission && country === 'wales') {
    return 'A dog docked on or after 28th March 2007 may not be entered for exhibition at this show.';
  }
  return 'Only undocked dogs and legally docked dogs may be entered for exhibition at this show.';
}

/**
 * Extract docking statement from scheduleData JSON.
 * Convenience wrapper that reads country and publicAdmission from the
 * untyped scheduleData object stored on the show.
 */
export function getDockingStatementFromScheduleData(
  sd: Record<string, unknown> | null,
): string {
  const country = (sd?.country as string) ?? 'england';
  const publicAdmission = sd?.publicAdmission !== false;
  return getDockingStatement(country, publicAdmission);
}
