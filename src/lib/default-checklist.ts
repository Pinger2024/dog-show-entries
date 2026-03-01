/**
 * Default show checklist items based on KC regulations and best practices.
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
}

export const DEFAULT_CHECKLIST_ITEMS: DefaultChecklistItem[] = [
  // ── Pre-Planning (12+ months out) ─────────────────────
  {
    title: 'Apply for KC show licence',
    description:
      'Submit licence application and fee to the Kennel Club. Per regulation F4, this must be done at least 12 months before the show date.',
    phase: 'pre_planning',
    sortOrder: 0,
    relativeDueDays: 365,
  },
  {
    title: 'Send judge offer letters',
    description:
      'Send written offers to proposed judges. This is stage 1 of the mandatory three-part contract process.',
    phase: 'pre_planning',
    sortOrder: 1,
    relativeDueDays: 365,
    autoDetectKey: 'judge_offers_sent',
  },
  {
    title: 'Confirm venue',
    description: 'Book and confirm the show venue. Ensure it meets KC requirements for space, access and facilities.',
    phase: 'pre_planning',
    sortOrder: 2,
    relativeDueDays: 300,
    autoDetectKey: 'venue_set',
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
  },

  // ── Planning (6–12 months out) ────────────────────────
  {
    title: 'Receive judge acceptance letters',
    description:
      'Stage 2 of three-part contract: judges return written acceptance. For championship CC judges, KC committee approval may also be required.',
    phase: 'planning',
    sortOrder: 0,
    relativeDueDays: 270,
    requiresDocument: true,
    perJudge: true,
  },
  {
    title: 'Send judge confirmation letters',
    description:
      'Stage 3 of three-part contract: society confirms the appointment in writing to each judge.',
    phase: 'planning',
    sortOrder: 1,
    relativeDueDays: 240,
    perJudge: true,
  },
  {
    title: 'Record KC licence number',
    description:
      'Once your licence is approved, enter the KC licence number in the show details.',
    phase: 'planning',
    sortOrder: 2,
    relativeDueDays: 240,
    autoDetectKey: 'kc_licence_recorded',
  },
  {
    title: 'Complete venue risk assessment',
    description:
      'Risk assessment and fire safety assessment of the venue. Must be available on show day.',
    phase: 'planning',
    sortOrder: 3,
    relativeDueDays: 120,
    requiresDocument: true,
  },
  {
    title: 'Order rosettes, trophies and special awards',
    description:
      'Including any perpetual trophies, junior handling awards, and special prizes.',
    phase: 'planning',
    sortOrder: 4,
    relativeDueDays: 120,
  },
  {
    title: 'Source sponsors and donations',
    description: 'Approach sponsors for prizes, donations or advertising in the catalogue.',
    phase: 'planning',
    sortOrder: 5,
    relativeDueDays: 90,
  },
  {
    title: 'Arrange awards board',
    description: 'Commission or prepare the awards display board for results.',
    phase: 'planning',
    sortOrder: 6,
    relativeDueDays: 90,
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
  },
  {
    title: 'Publish schedule',
    description:
      'Make the show live on Remi so exhibitors can view classes and judges. Upload a PDF schedule if required.',
    phase: 'pre_show',
    sortOrder: 1,
    relativeDueDays: 42,
    autoDetectKey: 'show_published',
  },
  {
    title: 'Open entries',
    description:
      'Open entries for exhibitors. Online entries can remain open until at least 14 days before the show.',
    phase: 'pre_show',
    sortOrder: 2,
    relativeDueDays: 42,
    autoDetectKey: 'entries_opened',
  },
  {
    title: 'Arrange veterinary cover',
    description: 'Confirm a vet will be available or on-call on the day of the show.',
    phase: 'pre_show',
    sortOrder: 3,
    relativeDueDays: 28,
  },
  {
    title: 'Book judges hotel and travel',
    description: 'Arrange accommodation and travel for judges attending from out of area.',
    phase: 'pre_show',
    sortOrder: 4,
    relativeDueDays: 28,
    perJudge: true,
  },
  {
    title: 'Assign stewards',
    description: 'Assign stewards to rings. Ensure enough stewards for each ring.',
    phase: 'pre_show',
    sortOrder: 5,
    relativeDueDays: 21,
    autoDetectKey: 'stewards_assigned',
  },
  {
    title: 'Obtain challenge certificates from KC',
    description: 'Championship shows only — request and receive the physical CCs from the Kennel Club.',
    phase: 'pre_show',
    sortOrder: 6,
    relativeDueDays: 21,
    championshipOnly: true,
  },
  {
    title: 'Arrange refreshments for judges and stewards',
    description: 'Organise food, drinks and hospitality for judges and stewards on show day.',
    phase: 'pre_show',
    sortOrder: 7,
    relativeDueDays: 14,
  },

  // ── Final Prep (0–2 weeks out) ────────────────────────
  {
    title: 'Close entries',
    description:
      'KC regulations require entries to close at least 14 days before the show date.',
    phase: 'final_prep',
    sortOrder: 0,
    relativeDueDays: 14,
    autoDetectKey: 'entries_closed',
  },
  {
    title: 'Assign judges to breeds and rings',
    description: 'Map each judge to their assigned breeds and ring numbers in Remi.',
    phase: 'final_prep',
    sortOrder: 1,
    relativeDueDays: 10,
    autoDetectKey: 'judges_assigned',
  },
  {
    title: 'Finalise ring plan',
    description: 'Set up rings in Remi with numbers, and assign breeds/classes to rings.',
    phase: 'final_prep',
    sortOrder: 2,
    relativeDueDays: 7,
    autoDetectKey: 'rings_created',
  },
  {
    title: 'Generate and print catalogue',
    description: 'Assign catalogue numbers and generate the show catalogue for printing.',
    phase: 'final_prep',
    sortOrder: 3,
    relativeDueDays: 7,
  },
  {
    title: 'Prepare exhibitor entry passes',
    description: 'Print or prepare entry passes/confirmations for exhibitors.',
    phase: 'final_prep',
    sortOrder: 4,
    relativeDueDays: 7,
  },
  {
    title: 'Advise judges of entry numbers',
    description: 'Send judges the number of entries in each class they are judging.',
    phase: 'final_prep',
    sortOrder: 5,
    relativeDueDays: 7,
    perJudge: true,
  },

  // ── Show Day ──────────────────────────────────────────
  {
    title: 'Display insurance certificate',
    description: 'Public liability insurance must be displayed prominently at the venue.',
    phase: 'show_day',
    sortOrder: 0,
    relativeDueDays: 0,
  },
  {
    title: 'Bring KC licence',
    description: 'Have the KC licence available (electronic or printed) at the show.',
    phase: 'show_day',
    sortOrder: 1,
    relativeDueDays: 0,
  },
  {
    title: 'Bring incident book',
    description:
      'The official KC incident book must be present. Record any incidents that occur during the show.',
    phase: 'show_day',
    sortOrder: 2,
    relativeDueDays: 0,
  },
  {
    title: 'Bring KC regulations and breed standards',
    description: 'Have the KC Year Book, regulations and relevant breed standards available for reference.',
    phase: 'show_day',
    sortOrder: 3,
    relativeDueDays: 0,
  },
  {
    title: 'Bring first aid kit',
    description: 'A first aid box must be available at the venue.',
    phase: 'show_day',
    sortOrder: 4,
    relativeDueDays: 0,
  },
  {
    title: 'Bring ring equipment and numbers',
    description: 'Ring markers, number boards, ring ropes/barriers, exhibitor numbers.',
    phase: 'show_day',
    sortOrder: 5,
    relativeDueDays: 0,
  },
  {
    title: 'Bring cash float',
    description: 'Cash for on-the-day catalogue sales, membership forms, etc.',
    phase: 'show_day',
    sortOrder: 6,
    relativeDueDays: 0,
  },
  {
    title: 'Bring risk and fire safety assessments',
    description: 'Both documents must be available at the venue on the day.',
    phase: 'show_day',
    sortOrder: 7,
    relativeDueDays: 0,
  },

  // ── Post-Show ─────────────────────────────────────────
  {
    title: 'Submit entry analysis form to KC',
    description:
      'Must be submitted to the KC Regional Support Advisor within 14 days of the show.',
    phase: 'post_show',
    sortOrder: 0,
    relativeDueDays: -14,
  },
  {
    title: 'Submit marked catalogue to KC',
    description:
      'Championship shows only — marked-up catalogue, absentee report and additional fee form due within 14 days.',
    phase: 'post_show',
    sortOrder: 1,
    relativeDueDays: -14,
    championshipOnly: true,
  },
  {
    title: 'Send judge thank-you letters',
    description: 'Send written thanks to all judges. Include expenses if not already settled.',
    phase: 'post_show',
    sortOrder: 2,
    relativeDueDays: -7,
    perJudge: true,
  },
  {
    title: 'Archive show records',
    description:
      'Retain marked catalogue indefinitely. Keep schedules and entry forms for at least 1 year per KC regulations.',
    phase: 'post_show',
    sortOrder: 3,
    relativeDueDays: -30,
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
