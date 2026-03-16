/**
 * Show lifecycle phase utilities.
 * Pure functions — no React, no imports from server.
 */

export type ShowPhase = 'setup' | 'entries_open' | 'pre_show' | 'show_day' | 'post_show' | 'cancelled';

export type ChecklistPhase = 'pre_planning' | 'planning' | 'pre_show' | 'final_prep' | 'show_day' | 'post_show';

/** Derive the lifecycle phase from the show's DB status */
export function derivePhase(status: string): ShowPhase {
  switch (status) {
    case 'draft':
    case 'published':
      return 'setup';
    case 'entries_open':
      return 'entries_open';
    case 'entries_closed':
      return 'pre_show';
    case 'in_progress':
      return 'show_day';
    case 'completed':
      return 'post_show';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'setup';
  }
}

/** Map show status to the most relevant checklist phase */
export function deriveCurrentChecklistPhase(status: string): ChecklistPhase {
  switch (status) {
    case 'draft':
      return 'pre_planning';
    case 'published':
      return 'planning';
    case 'entries_open':
      return 'pre_show';
    case 'entries_closed':
      return 'final_prep';
    case 'in_progress':
      return 'show_day';
    case 'completed':
      return 'post_show';
    default:
      return 'pre_planning';
  }
}

/** Format days until a date as a human-readable string */
export function formatDaysUntil(date: string | Date): string {
  const target = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (days < 0) return `${Math.abs(days)} days ago`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days <= 7) return `${days} days`;
  if (days <= 30) return `${Math.ceil(days / 7)} weeks`;
  return `${Math.ceil(days / 30)} months`;
}

/** Format a deadline with urgency context */
export function formatDeadline(date: string | Date, label: string): { text: string; urgent: boolean; overdue: boolean } {
  const target = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (days < 0) {
    return { text: `${label} was ${Math.abs(days)} days ago`, urgent: true, overdue: true };
  }
  if (days === 0) {
    return { text: `${label} is today`, urgent: true, overdue: false };
  }
  if (days <= 3) {
    return { text: `${label} in ${days} day${days !== 1 ? 's' : ''}`, urgent: true, overdue: false };
  }
  if (days <= 7) {
    return { text: `${label} in ${days} days`, urgent: false, overdue: false };
  }
  return {
    text: `${label} on ${target.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
    urgent: false,
    overdue: false,
  };
}

/** Phase display config */
export const PHASE_CONFIG: Record<ShowPhase, { label: string; color: string; bgColor: string; borderColor: string }> = {
  setup: { label: 'Setting Up', color: 'text-amber-700', bgColor: 'bg-amber-50', borderColor: 'border-amber-200' },
  entries_open: { label: 'Entries Open', color: 'text-emerald-700', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200' },
  pre_show: { label: 'Pre-Show Prep', color: 'text-blue-700', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' },
  show_day: { label: 'Show Day', color: 'text-primary', bgColor: 'bg-primary/5', borderColor: 'border-primary/20' },
  post_show: { label: 'Post-Show', color: 'text-muted-foreground', bgColor: 'bg-muted/30', borderColor: 'border-border' },
  cancelled: { label: 'Cancelled', color: 'text-destructive', bgColor: 'bg-destructive/5', borderColor: 'border-destructive/20' },
};
