/**
 * Additional show-specific statements for dog show schedules.
 *
 * These are statements that vary by show and are NOT already covered
 * by the standard RKC rules auto-generated in the schedule PDF.
 * The schedule PDF already includes the full set of numbered rules
 * (1-20), additional rules (i-xi), Annex B, welfare warnings, etc.
 *
 * These are for prominent bold notices that secretaries choose to
 * highlight for their specific show circumstances.
 */

export interface RkcStatement {
  id: string;
  text: string;
  category: string;
  regulation?: string;
}

export const RKC_STATEMENT_CATEGORIES = [
  'Venue & Facilities',
  'Show-Specific',
] as const;

/**
 * This undertaking is mandatory in every RKC schedule. It used to be offered
 * as an optional preset too, which allowed it to appear twice. Keep the
 * recogniser tolerant of the older saved wording ("health or well being") so
 * existing shows are cleaned up automatically when rendered.
 */
export const RKC_JUDGES_WELFARE_STATEMENT =
  'All Judges at this show agree to abide by the following statement: “In assessing dogs, judges must penalise any features or exaggerations which they consider would be detrimental to the soundness, health and well being of the dog.”';

export function isRkcJudgesWelfareStatement(statement: string): boolean {
  const normalised = statement
    .toLowerCase()
    .replace(/[“”"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return normalised.includes('all judges at this show agree to abide by the following statement:')
    && normalised.includes('judges must penalise any features or exaggerations')
    && normalised.includes('soundness, health');
}

export const RKC_STATEMENTS: RkcStatement[] = [
  // ── Venue & Facilities ──
  {
    id: 'outside_attraction',
    text: 'PLEASE NOTE: OUTSIDE ATTRACTION — RKC REGULATION F(1) 16h WILL BE STRICTLY ENFORCED',
    category: 'Venue & Facilities',
    regulation: 'F(1)16h',
  },
  {
    id: 'no_wet_weather',
    text: 'NO WET WEATHER ACCOMMODATION IS PROVIDED',
    category: 'Venue & Facilities',
  },
  {
    id: 'unbenched',
    text: 'THIS IS AN UNBENCHED SHOW — EXHIBITORS ARE RESPONSIBLE FOR ENSURING THEIR DOGS ARE AVAILABLE FOR JUDGING',
    category: 'Venue & Facilities',
  },
  {
    id: 'no_smoking_indoor',
    text: 'IT IS ILLEGAL TO SMOKE OR VAPE INSIDE THE VENUE',
    category: 'Venue & Facilities',
  },
  {
    id: 'no_smoking_grounds',
    text: 'SMOKING IS NOT PERMITTED WITHIN THE SHOW AREA OR NEAR THE RINGS',
    category: 'Venue & Facilities',
  },
  {
    id: 'no_crate_stacking',
    text: 'CRATE STACKING IS NOT PERMITTED AT THIS VENUE',
    category: 'Venue & Facilities',
  },

  // ── Show-Specific ──
  {
    id: 'no_refunds',
    text: 'ENTRY FEES CANNOT BE REFUNDED ONCE AN ENTRY HAS BEEN ACCEPTED',
    category: 'Show-Specific',
  },
  {
    id: 'exhibit_removal',
    text: 'EXHIBITS MAY NOT BE REMOVED FROM THE SHOW UNTIL THEIR BREED JUDGING HAS BEEN COMPLETED',
    category: 'Show-Specific',
  },
  {
    id: 'no_photography',
    text: 'NO PHOTOGRAPHY, FILMING OR OTHER FORM OF RECORDING IS PERMITTED AT THE VENUE OR IN JUDGING RINGS WITHOUT EXPRESS WRITTEN PERMISSION OF THE ORGANISERS',
    category: 'Show-Specific',
  },
  {
    id: 'bitches_in_season',
    text: 'BITCHES IN SEASON ARE NOT ELIGIBLE FOR EXHIBITION AT THIS SHOW',
    category: 'Show-Specific',
  },
  {
    id: 'jh_proof_of_age',
    text: 'JUNIOR HANDLERS MAY BE ASKED TO PROVIDE PROOF OF AGE',
    category: 'Show-Specific',
  },
];
