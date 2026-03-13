import type { ComponentType } from 'react';

/** Props passed to every action panel component */
export interface ActionPanelProps {
  showId: string;
  itemId: string;
  actionKey?: string;
  entityId?: string | null;
  entityName?: string | null;
  onComplete?: () => void;
}

/** Registry entry: the component to render plus how it interacts with the default detail panel */
interface ActionRegistryEntry {
  component: ComponentType<ActionPanelProps>;
  /** 'replace' hides the default detail panel; 'augment' renders above it */
  mode: 'replace' | 'augment';
}

// Lazy imports — these are dynamically imported only when the panel is expanded
import { JudgeOffersAction } from './checklist-actions/judge-offers-action';
import { JudgeAcceptanceAction } from './checklist-actions/judge-acceptance-action';
import { JudgeConfirmationAction } from './checklist-actions/judge-confirmation-action';
import { JudgeHotelAction } from './checklist-actions/judge-hotel-action';
import { JudgeEntryNumbersAction } from './checklist-actions/judge-entry-numbers-action';
import { JudgeThankYouAction } from './checklist-actions/judge-thankyou-action';
import { ShowStatusAction } from './checklist-actions/show-status-action';
import { QuickLinkAction } from './checklist-actions/quick-link-action';
import { PrintOrderAction } from './checklist-actions/print-order-action';
import { ResultsApprovalAction } from './checklist-actions/results-approval-action';
import { ResultsPublishAction } from './checklist-actions/results-publish-action';
import { ShareShowAction } from './checklist-actions/share-show-action';

export const ACTION_REGISTRY: Record<string, ActionRegistryEntry> = {
  // Judge pipeline — the centrepiece
  judge_offers: { component: JudgeOffersAction, mode: 'replace' },

  // Per-judge actions
  judge_acceptance: { component: JudgeAcceptanceAction, mode: 'replace' },
  judge_confirmation: { component: JudgeConfirmationAction, mode: 'replace' },
  judge_hotel: { component: JudgeHotelAction, mode: 'replace' },
  judge_entry_numbers: { component: JudgeEntryNumbersAction, mode: 'replace' },
  judge_thankyou: { component: JudgeThankYouAction, mode: 'replace' },

  // Show status actions
  show_publish: { component: ShowStatusAction, mode: 'augment' },
  entries_open: { component: ShowStatusAction, mode: 'augment' },
  entries_close: { component: ShowStatusAction, mode: 'augment' },

  // Quick links to other sections
  venue_confirm: { component: QuickLinkAction, mode: 'augment' },
  classes_setup: { component: QuickLinkAction, mode: 'augment' },
  sponsors: { component: QuickLinkAction, mode: 'augment' },
  stewards_assign: { component: QuickLinkAction, mode: 'augment' },
  judges_assign_breeds: { component: QuickLinkAction, mode: 'augment' },
  rings_finalise: { component: QuickLinkAction, mode: 'augment' },
  catalogue_generate: { component: PrintOrderAction, mode: 'augment' },

  // Results publication pipeline
  results_approve: { component: ResultsApprovalAction, mode: 'replace' },
  results_publish: { component: ResultsPublishAction, mode: 'replace' },

  // Share / social prompts
  share_show: { component: ShareShowAction, mode: 'augment' },
  share_closing: { component: ShareShowAction, mode: 'augment' },
  share_results: { component: ShareShowAction, mode: 'augment' },
};
