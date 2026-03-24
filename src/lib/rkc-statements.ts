/**
 * Standard RKC regulatory statements for dog show schedules.
 * Categorised by type for the dropdown picker in schedule settings.
 *
 * Source: RKC Show Regulations F (2025), specimen schedules, and
 * common practice across UK breed clubs and open shows.
 */

export interface RkcStatement {
  id: string;
  text: string;
  category: string;
  regulation?: string;
}

export const RKC_STATEMENT_CATEGORIES = [
  'Venue & Facilities',
  'Welfare & Safety',
  'Entry & Competition',
  'Legal & Privacy',
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
    id: 'no_gangway_obstruction',
    text: 'PLEASE DO NOT OBSTRUCT GANGWAYS WITH CAGES, PENS, GROOMING TABLES, TROLLEYS AND DOGS',
    category: 'Venue & Facilities',
  },
  {
    id: 'no_crate_stacking',
    text: 'CRATE STACKING IS NOT PERMITTED AT THIS VENUE',
    category: 'Venue & Facilities',
  },
  {
    id: 'unbenched',
    text: 'THIS IS AN UNBENCHED SHOW — EXHIBITORS ARE RESPONSIBLE FOR ENSURING THEIR DOGS ARE AVAILABLE FOR JUDGING',
    category: 'Venue & Facilities',
  },

  // ── Welfare & Safety ──
  {
    id: 'no_punitive_correction',
    text: 'NO PERSON SHALL CARRY OUT PUNITIVE CORRECTION OR HARSH HANDLING OF A DOG AT ANY TIME WHILST AT THE LICENSED VENUE',
    category: 'Welfare & Safety',
  },
  {
    id: 'dogs_under_control',
    text: 'ALL DOGS MUST BE KEPT UNDER PROPER CONTROL AT ALL TIMES WITHIN THE LICENSED VENUE INCLUDING CAR PARKS AND APPROACHES',
    category: 'Welfare & Safety',
    regulation: 'F(1)',
  },
  {
    id: 'bitches_in_season',
    text: 'BITCHES IN SEASON ARE NOT ELIGIBLE FOR EXHIBITION AT THIS SHOW',
    category: 'Welfare & Safety',
  },
  {
    id: 'nfc_control',
    text: 'NOT FOR COMPETITION DOGS MUST BE KEPT UNDER CONTROL AND MAY NOT ENTER THE JUDGING RING',
    category: 'Welfare & Safety',
  },

  // ── Entry & Competition ──
  {
    id: 'no_refunds',
    text: 'ENTRY FEES CANNOT BE REFUNDED ONCE AN ENTRY HAS BEEN ACCEPTED',
    category: 'Entry & Competition',
  },
  {
    id: 'right_to_refuse',
    text: 'THE COMMITTEE RESERVES THE RIGHT TO REFUSE ANY ENTRIES',
    category: 'Entry & Competition',
  },
  {
    id: 'overseas_atc',
    text: 'ALL DOGS RESIDENT OUTSIDE THE UK MUST BE ISSUED WITH AN RKC AUTHORITY TO COMPETE NUMBER BEFORE ENTRY TO THE SHOW CAN BE MADE',
    category: 'Entry & Competition',
  },
  {
    id: 'exhibit_removal',
    text: 'EXHIBITS MAY NOT BE REMOVED FROM THE SHOW UNTIL THEIR BREED JUDGING HAS BEEN COMPLETED',
    category: 'Entry & Competition',
  },
  {
    id: 'bis_10_minutes',
    text: 'EXHIBITS WILL NOT BE ADMITTED TO BEST IN SHOW COMPETITION AFTER A PERIOD OF 10 MINUTES HAS ELAPSED SINCE THE ANNOUNCEMENT',
    category: 'Entry & Competition',
    regulation: 'F(1)26',
  },
  {
    id: 'jh_proof_of_age',
    text: 'JUNIOR HANDLERS MAY BE ASKED TO PROVIDE PROOF OF AGE',
    category: 'Entry & Competition',
  },

  // ── Legal & Privacy ──
  {
    id: 'no_liability',
    text: 'THE COMMITTEE WILL NOT BE RESPONSIBLE FOR THE LOSS OR DAMAGE TO ANY DOGS OR PROPERTY, OR PERSONAL INJURY WHETHER ARISING FROM ACCIDENT OR ANY OTHER CAUSE WHATSOEVER',
    category: 'Legal & Privacy',
  },
  {
    id: 'no_photography',
    text: 'NO FILMING OR OTHER FORM OF RECORDING MAY BE TAKEN OR MADE AT THE VENUE WITHOUT EXPRESS WRITTEN PERMISSION OF THE ORGANISERS',
    category: 'Legal & Privacy',
  },
  {
    id: 'gdpr',
    text: 'YOUR PRIVACY IS IMPORTANT — PERSONAL DATA IS HELD IN ACCORDANCE WITH OUR PRIVACY NOTICE WHICH IS AVAILABLE UPON REQUEST FROM THE SECRETARY',
    category: 'Legal & Privacy',
  },
  {
    id: 'catalogue_data',
    text: 'PLEASE NOTE THAT YOUR DETAILS WILL BE PUBLISHED IN THE SHOW CATALOGUE AS REQUIRED BY RKC REGULATIONS',
    category: 'Legal & Privacy',
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
  {
    id: 'no_ring_conversation',
    text: 'CONVERSATION IS NOT ALLOWED IN THE JUDGING RING — HANDLERS ARE NOT PERMITTED TO HOLD CONVERSATION WITH THE JUDGE DURING COMPETITION',
    category: 'Judging',
  },
];
