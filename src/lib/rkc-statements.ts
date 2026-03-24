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
  'Judging',
] as const;

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
    text: 'NO FILMING OR OTHER FORM OF RECORDING MAY BE TAKEN OR MADE AT THE VENUE WITHOUT EXPRESS WRITTEN PERMISSION OF THE ORGANISERS',
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

  // ── Judging ──
  {
    id: 'judges_assessment',
    text: 'ALL JUDGES AT THIS SHOW AGREE TO ABIDE BY THE FOLLOWING STATEMENT: "IN ASSESSING DOGS, JUDGES MUST PENALISE ANY FEATURES OR EXAGGERATIONS WHICH THEY CONSIDER WOULD BE DETRIMENTAL TO THE SOUNDNESS, HEALTH OR WELL BEING OF THE DOG"',
    category: 'Judging',
    regulation: 'F.9',
  },
  {
    id: 'no_ring_photography',
    text: 'NO PHOTOGRAPHY OR FILMING IS PERMITTED IN BREED JUDGING RINGS WHILST JUDGING IS TAKING PLACE',
    category: 'Judging',
  },
];
