/**
 * The setup wizard's steps, and which step fixes which entries-open blocker.
 *
 * ONE owner (CLAUDE.md, "One owner per rule"). Before 28 Oct 2026 the wizard
 * decided for itself when a step was "Complete" (fees + close date +
 * secretary details, nothing else) while `getPhaseBlockers` decided for
 * itself what blocks opening entries (those three plus venue, licence, show
 * times, guarantors…). Mandy saw a green tick on the step and a red "Venue
 * not confirmed" in the banner on the same screen, with nowhere to go.
 *
 * Now every blocker says which wizard step puts it right (`Blocker.step`),
 * the wizard ticks a step only when no REQUIRED blocker points at it, and
 * the blocker's link opens the wizard on that step. One table, read by all.
 */

export const WIZARD_STEPS = [
  { id: 'classes', label: 'Classes & Breeds', shortLabel: 'Classes' },
  { id: 'judge', label: 'Judge', shortLabel: 'Judge' },
  { id: 'details', label: 'Venue, Fees & Setup', shortLabel: 'Setup' },
  { id: 'schedule', label: 'Schedule', shortLabel: 'Schedule' },
  { id: 'open', label: 'Open Entries', shortLabel: 'Open' },
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number]['id'];

/** The steps a blocker can send the secretary to (never "open" — that is the goal, not a fix). */
export type WizardStepKey = Exclude<WizardStepId, 'open'>;

const STEP_IDS = new Set<string>(WIZARD_STEPS.map((s) => s.id));

/** Is this (a query-string value, say) one of the wizard's step ids? */
export function isWizardStepId(value: string | null | undefined): value is WizardStepId {
  return value != null && STEP_IDS.has(value);
}

/** The human label of a wizard step, for "Choose the venue in Venue, Fees & Setup". */
export function wizardStepLabel(step: WizardStepId): string {
  return WIZARD_STEPS.find((s) => s.id === step)?.label ?? step;
}

/**
 * The query-string name the wizard reads to open on a given step. The
 * blocker's `actionPath` is appended to the show's URL by the banner and
 * the action panel, so this is the whole suffix.
 */
export const WIZARD_STEP_PARAM = 'step';

/** The `actionPath` that opens the setup wizard on `step`. */
export function wizardStepPath(step: WizardStepKey): string {
  return `?${WIZARD_STEP_PARAM}=${step}`;
}

/**
 * Does any blocker that a secretary MUST clear point at this step? The
 * wizard ticks a step when this is false. `blockers` undefined (still
 * loading) means "don't know yet", which must never read as "complete".
 */
export function wizardStepBlocked(
  step: WizardStepId,
  blockers: ReadonlyArray<{ step?: WizardStepKey | null; severity: 'required' | 'recommended' }> | undefined,
): boolean {
  if (!blockers) return true;
  return blockers.some((b) => b.step === step && b.severity === 'required');
}
