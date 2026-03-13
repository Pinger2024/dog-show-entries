/**
 * Default show checklist items based on RKC regulations and best practices.
 * Items with `autoDetectKey` will auto-complete when the corresponding
 * Remi data is present. `relativeDueDays` is days before the show
 * (positive = before, negative = after show date).
 */

type Phase =
  | 'pre_planning'
  | 'planning'
  | 'pre_show'
  | 'final_prep'
  | 'show_day'
  | 'post_show';

export interface DefaultChecklistItem {
  title: string;
  description?: string;
  phase: Phase;
  sortOrder: number;
  relativeDueDays?: number;
  autoDetectKey?: string;
  championshipOnly?: boolean;
  /** Whether this item expects a document upload as evidence */
  requiresDocument?: boolean;
  /** Whether this item tracks a document with an expiry date */
  hasExpiry?: boolean;
  /** Per-judge: create one instance of this item per assigned judge */
  perJudge?: boolean;
  /** Maps to an inline action component in the checklist command center */
  actionKey?: string;
}

export const DEFAULT_CHECKLIST_ITEMS: DefaultChecklistItem[] = [
  // ── Pre-Planning (12+ months out) ─────────────────────
  {
    title: 'Apply for RKC show licence',
    description:
      'Submit licence application and fee to the Royal Kennel Club. Per regulation F4, this must be done at least 12 months before the show date.',
    phase: 'pre_planning',
    sortOrder: 0,
    relativeDueDays: 365,
    actionKey: 'rkc_licence_apply',
    requiresDocument: true,
  },
  {
    title: 'Send judge offer letters',
    description:
      'Send written offers to proposed judges. This is stage 1 of the mandatory three-part contract process.',
    phase: 'pre_planning',
    sortOrder: 1,
    relativeDueDays: 365,
    autoDetectKey: 'judge_offers_sent',
    actionKey: 'judge_offers',
  },
  {
    title: 'Confirm venue',
    description: 'Book and confirm the show venue. Ensure it meets RKC requirements for space, access and facilities.',
    phase: 'pre_planning',
    sortOrder: 2,
    relativeDueDays: 300,
    autoDetectKey: 'venue_set',
    actionKey: 'venue_confirm',
  },
  {
    title: 'Obtain public liability insurance',
    description:
      'Mandatory — without current insurance the show licence is invalid. Certificate must be displayed at the venue on show day.',
    phase: 'pre_planning',
    sortOrder: 3,
    relativeDueDays: 180,
    requiresDocument: true,
    hasExpiry: true,
    actionKey: 'insurance',
  },

  // ── Planning (6–12 months out) ────────────────────────
  {
    title: 'Receive judge acceptance letters',
    description:
      'Stage 2 of three-part contract: judges return written acceptance. For championship CC judges, RKC committee approval may also be required.',
    phase: 'planning',
    sortOrder: 0,
    relativeDueDays: 270,
    requiresDocument: true,
    perJudge: true,
    actionKey: 'judge_acceptance',
  },
  {
    title: 'Send judge confirmation letters',
    description:
      'Stage 3 of three-part contract: society confirms the appointment in writing to each judge.',
    phase: 'planning',
    sortOrder: 1,
    relativeDueDays: 240,
    perJudge: true,
    actionKey: 'judge_confirmation',
  },
  {
    title: 'Record RKC licence number',
    description:
      'Once your licence is approved, enter the RKC licence number in the show details.',
    phase: 'planning',
    sortOrder: 2,
    relativeDueDays: 240,
    autoDetectKey: 'kc_licence_recorded',
    actionKey: 'rkc_licence_record',
  },
  {
    title: 'Complete venue risk assessment',
    description:
      'Risk assessment and fire safety assessment of the venue. Must be available on show day.',
    phase: 'planning',
    sortOrder: 3,
    relativeDueDays: 120,
    requiresDocument: true,
    actionKey: 'venue_risk',
  },
  {
    title: 'Order rosettes, trophies and special awards',
    description:
      'Including any perpetual trophies, junior handling awards, and special prizes.',
    phase: 'planning',
    sortOrder: 4,
    relativeDueDays: 120,
    actionKey: 'rosettes',
  },
  {
    title: 'Source sponsors and donations',
    description: 'Approach sponsors for prizes, donations or advertising in the catalogue.',
    phase: 'planning',
    sortOrder: 5,
    relativeDueDays: 90,
    actionKey: 'sponsors',
  },
  {
    title: 'Arrange awards board',
    description: 'Commission or prepare the awards display board for results.',
    phase: 'planning',
    sortOrder: 6,
    relativeDueDays: 90,
    actionKey: 'awards_board',
  },

  // ── Pre-Show (2–8 weeks out) ──────────────────────────
  {
    title: 'Set up show classes',
    description:
      'Create all breed classes, entry fees, and any special classes (junior handling, etc.) in Remi.',
    phase: 'pre_show',
    sortOrder: 0,
    relativeDueDays: 56,
    autoDetectKey: 'classes_created',
    actionKey: 'classes_setup',
  },
  {
    title: 'Publish schedule',
    description:
      'Make the show live on Remi so exhibitors can view classes and judges. The schedule PDF is generated automatically.',
    phase: 'pre_show',
    sortOrder: 1,
    relativeDueDays: 42,
    autoDetectKey: 'show_published',
    actionKey: 'show_publish',
  },
  {
    title: 'Open entries',
    description:
      'Open entries for exhibitors. Online entries can remain open until at least 14 days before the show.',
    phase: 'pre_show',
    sortOrder: 2,
    relativeDueDays: 42,
    autoDetectKey: 'entries_opened',
    actionKey: 'entries_open',
  },
  {
    title: 'Share show on social media',
    description:
      'Share the show page on Facebook, WhatsApp, and breed groups to attract entries. The link includes a beautiful social preview card automatically.',
    phase: 'pre_show',
    sortOrder: 3,
    relativeDueDays: 35,
    actionKey: 'share_show',
  },
  {
    title: 'Arrange veterinary cover',
    description: 'Confirm a vet will be available or on-call on the day of the show.',
    phase: 'pre_show',
    sortOrder: 4,
    relativeDueDays: 28,
    actionKey: 'vet_cover',
  },
  {
    title: 'Book judges hotel and travel',
    description: 'Arrange accommodation and travel for judges attending from out of area.',
    phase: 'pre_show',
    sortOrder: 5,
    relativeDueDays: 28,
    perJudge: true,
    actionKey: 'judge_hotel',
  },
  {
    title: 'Assign stewards',
    description: 'Assign stewards to rings. Ensure enough stewards for each ring.',
    phase: 'pre_show',
    sortOrder: 6,
    relativeDueDays: 21,
    autoDetectKey: 'stewards_assigned',
    actionKey: 'stewards_assign',
  },
  {
    title: 'Obtain challenge certificates from RKC',
    description: 'Championship shows only — request and receive the physical CCs from the Royal Kennel Club.',
    phase: 'pre_show',
    sortOrder: 7,
    relativeDueDays: 21,
    championshipOnly: true,
    actionKey: 'obtain_ccs',
  },
  {
    title: 'Arrange refreshments for judges and stewards',
    description: 'Organise food, drinks and hospitality for judges and stewards on show day.',
    phase: 'pre_show',
    sortOrder: 8,
    relativeDueDays: 14,
    actionKey: 'refreshments',
  },

  // ── Final Prep (0–2 weeks out) ────────────────────────
  {
    title: 'Send last-call reminder',
    description:
      'Entries close soon — share a last-call reminder in your breed groups and on social media to catch late entries.',
    phase: 'final_prep',
    sortOrder: 0,
    relativeDueDays: 16,
    actionKey: 'share_closing',
  },
  {
    title: 'Close entries',
    description:
      'RKC regulations require entries to close at least 14 days before the show date.',
    phase: 'final_prep',
    sortOrder: 1,
    relativeDueDays: 14,
    autoDetectKey: 'entries_closed',
    actionKey: 'entries_close',
  },
  {
    title: 'Assign judges to breeds and rings',
    description: 'Map each judge to their assigned breeds and ring numbers in Remi.',
    phase: 'final_prep',
    sortOrder: 2,
    relativeDueDays: 10,
    autoDetectKey: 'judges_assigned',
    actionKey: 'judges_assign_breeds',
  },
  {
    title: 'Finalise ring plan',
    description: 'Set up rings in Remi with numbers, and assign breeds/classes to rings.',
    phase: 'final_prep',
    sortOrder: 3,
    relativeDueDays: 7,
    autoDetectKey: 'rings_created',
    actionKey: 'rings_finalise',
  },
  {
    title: 'Generate and print catalogue',
    description: 'Assign catalogue numbers and generate the show catalogue for printing.',
    phase: 'final_prep',
    sortOrder: 4,
    relativeDueDays: 7,
    actionKey: 'catalogue_generate',
  },
  {
    title: 'Prepare exhibitor entry passes',
    description: 'Print or prepare entry passes/confirmations for exhibitors.',
    phase: 'final_prep',
    sortOrder: 5,
    relativeDueDays: 7,
    actionKey: 'entry_passes',
  },
  {
    title: 'Advise judges of entry numbers',
    description: 'Send judges the number of entries in each class they are judging.',
    phase: 'final_prep',
    sortOrder: 6,
    relativeDueDays: 7,
    perJudge: true,
    actionKey: 'judge_entry_numbers',
  },

  // ── Show Day ──────────────────────────────────────────
  {
    title: 'Display insurance certificate',
    description: 'Public liability insurance must be displayed prominently at the venue.',
    phase: 'show_day',
    sortOrder: 0,
    relativeDueDays: 0,
    actionKey: 'show_day_insurance',
  },
  {
    title: 'Bring RKC licence',
    description: 'Have the RKC licence available (electronic or printed) at the show.',
    phase: 'show_day',
    sortOrder: 1,
    relativeDueDays: 0,
    actionKey: 'show_day_licence',
  },
  {
    title: 'Bring incident book',
    description:
      'The official RKC incident book must be present. Record any incidents that occur during the show.',
    phase: 'show_day',
    sortOrder: 2,
    relativeDueDays: 0,
    actionKey: 'show_day_incident_book',
  },
  {
    title: 'Bring RKC regulations and breed standards',
    description: 'Have the RKC Year Book, regulations and relevant breed standards available for reference.',
    phase: 'show_day',
    sortOrder: 3,
    relativeDueDays: 0,
    actionKey: 'show_day_regulations',
  },
  {
    title: 'Bring first aid kit',
    description: 'A first aid box must be available at the venue.',
    phase: 'show_day',
    sortOrder: 4,
    relativeDueDays: 0,
    actionKey: 'show_day_first_aid',
  },
  {
    title: 'Bring ring equipment and numbers',
    description: 'Ring markers, number boards, ring ropes/barriers, exhibitor numbers.',
    phase: 'show_day',
    sortOrder: 5,
    relativeDueDays: 0,
    actionKey: 'show_day_ring_equipment',
  },
  {
    title: 'Bring cash float',
    description: 'Cash for on-the-day catalogue sales, membership forms, etc.',
    phase: 'show_day',
    sortOrder: 6,
    relativeDueDays: 0,
    actionKey: 'show_day_cash_float',
  },
  {
    title: 'Bring risk and fire safety assessments',
    description: 'Both documents must be available at the venue on the day.',
    phase: 'show_day',
    sortOrder: 7,
    relativeDueDays: 0,
    actionKey: 'show_day_risk_assessment',
  },

  // ── Post-Show ─────────────────────────────────────────
  {
    title: 'Submit entry analysis form to RKC',
    description:
      'Must be submitted to the RKC Regional Support Advisor within 14 days of the show.',
    phase: 'post_show',
    sortOrder: 0,
    relativeDueDays: -14,
    actionKey: 'rkc_analysis',
    requiresDocument: true,
  },
  {
    title: 'Submit marked catalogue to RKC',
    description:
      'Championship shows only — marked-up catalogue, absentee report and additional fee form due within 14 days.',
    phase: 'post_show',
    sortOrder: 1,
    relativeDueDays: -14,
    championshipOnly: true,
    actionKey: 'rkc_marked_catalogue',
    requiresDocument: true,
  },
  {
    title: 'Submit results for judge approval',
    description:
      'Stewards submit results to each judge for digital approval after judging is complete.',
    phase: 'post_show',
    sortOrder: 2,
    relativeDueDays: -1,
    actionKey: 'results_approve',
    autoDetectKey: 'judge_approvals_sent',
  },
  {
    title: 'Publish results',
    description:
      'Make results public and send notification emails to exhibitors.',
    phase: 'post_show',
    sortOrder: 3,
    relativeDueDays: -2,
    actionKey: 'results_publish',
    autoDetectKey: 'results_published',
  },
  {
    title: 'Share results',
    description:
      'Share the results page with exhibitors and breed groups. Winners love to see their results shared!',
    phase: 'post_show',
    sortOrder: 4,
    relativeDueDays: -3,
    actionKey: 'share_results',
  },
  {
    title: 'Send judge thank-you letters',
    description: 'Send written thanks to all judges. Include expenses if not already settled.',
    phase: 'post_show',
    sortOrder: 5,
    relativeDueDays: -7,
    perJudge: true,
    actionKey: 'judge_thankyou',
  },
  {
    title: 'Archive show records',
    description:
      'Retain marked catalogue indefinitely. Keep schedules and entry forms for at least 1 year per RKC regulations.',
    phase: 'post_show',
    sortOrder: 6,
    relativeDueDays: -30,
    actionKey: 'archive',
  },
];

/** Calculate absolute due date from show date and relative days */
export function calculateDueDate(
  showDate: string,
  relativeDueDays: number
): string {
  const d = new Date(showDate);
  d.setDate(d.getDate() - relativeDueDays);
  return d.toISOString().split('T')[0]!;
}

/** Phase display labels and sort order */
export const PHASE_CONFIG: Record<
  Phase,
  { label: string; sortOrder: number }
> = {
  pre_planning: { label: '12+ Months Out', sortOrder: 0 },
  planning: { label: '6–12 Months Out', sortOrder: 1 },
  pre_show: { label: '2–8 Weeks Out', sortOrder: 2 },
  final_prep: { label: 'Final 2 Weeks', sortOrder: 3 },
  show_day: { label: 'Show Day', sortOrder: 4 },
  post_show: { label: 'After the Show', sortOrder: 5 },
};
