import { pgEnum } from 'drizzle-orm/pg-core';
import { ACHIEVEMENT_TYPES } from '@/lib/placements';

export const showTypeEnum = pgEnum('show_type', [
  'companion',
  'primary',
  'limited',
  'open',
  'premier_open',
  'championship',
]);

export const showScopeEnum = pgEnum('show_scope', [
  'single_breed',
  'group',
  'general',
]);

export const showStatusEnum = pgEnum('show_status', [
  'draft',
  'published',
  'entries_open',
  'entries_closed',
  'in_progress',
  'completed',
  'cancelled',
]);

export const sexEnum = pgEnum('sex', ['dog', 'bitch']);

export const entryStatusEnum = pgEnum('entry_status', [
  'pending',
  'confirmed',
  'withdrawn',
  'transferred',
  'cancelled',
]);

export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'succeeded',
  'failed',
  'refunded',
  'partially_refunded',
]);

export const membershipStatusEnum = pgEnum('membership_status', [
  'active',
  'expired',
  'pending',
  'cancelled',
]);

export const userRoleEnum = pgEnum('user_role', [
  'exhibitor',
  'secretary',
  'steward',
  'judge',
  'admin',
]);

// ACHIEVEMENT_TYPES is the canonical ordering — see src/lib/placements.ts
export const achievementTypeEnum = pgEnum('achievement_type', ACHIEVEMENT_TYPES);

export const classTypeEnum = pgEnum('class_type', [
  'age',
  'achievement',
  'special',
  'junior_handler',
]);

// ── New enums for Amanda's requirements ──────────────────

export const dogTitleTypeEnum = pgEnum('dog_title_type', [
  'ch',
  'sh_ch',
  'ir_ch',
  'ir_sh_ch',
  'int_ch',
  'ob_ch',
  'ft_ch',
  'wt_ch',
]);

export const orderStatusEnum = pgEnum('order_status', [
  'draft',
  'pending_payment',
  'paid',
  'failed',
  'cancelled',
  'refunded',
]);

export const entryAuditActionEnum = pgEnum('entry_audit_action', [
  'created',
  'classes_changed',
  'class_transferred',
  'handler_changed',
  'withdrawn',
  'reinstated',
]);

export const entryTypeEnum = pgEnum('entry_type', [
  'standard',
  'junior_handler',
]);

export const catalogueFormatEnum = pgEnum('catalogue_format', [
  'standard',
  'branded',
  'premium',
]);

export const catalogueStatusEnum = pgEnum('catalogue_status', [
  'draft',
  'generating',
  'generated',
  'published',
]);

export const paymentTypeEnum = pgEnum('payment_type', [
  'initial',
  'adjustment',
  'refund',
]);

export const feedbackStatusEnum = pgEnum('feedback_status', [
  'pending',
  'in_progress',
  'completed',
  'dismissed',
]);

// ── Subscription & pricing enums ──────────────────────────

export const clubTypeEnum = pgEnum('club_type', [
  'single_breed',
  'multi_breed',
]);

export const serviceTierEnum = pgEnum('service_tier', [
  'diy',
  'managed',
]);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active',
  'trial',
  'past_due',
  'cancelled',
  'none',
]);

/**
 * Lifecycle of a club's Stripe Connect (Standard) account.
 * - not_started: no account created yet
 * - pending: account created but KYC / details not yet submitted by the club
 * - restricted: Stripe requires more info before charges can resume
 * - active: charges_enabled=true, ready to accept entry payments
 * - rejected: Stripe has declined the account (rare; blocks all charges)
 *
 * The authoritative source is Stripe itself; we mirror it to gate show
 * publishing without a round-trip to Stripe on every render.
 */
export const stripeAccountStatusEnum = pgEnum('stripe_account_status', [
  'not_started',
  'pending',
  'restricted',
  'active',
  'rejected',
]);

export const invitationStatusEnum = pgEnum('invitation_status', [
  'pending',
  'accepted',
  'expired',
  'revoked',
]);

export const secretaryApplicationStatusEnum = pgEnum('secretary_application_status', [
  'pending',
  'approved',
  'rejected',
]);

export const classSexArrangementEnum = pgEnum('class_sex_arrangement', [
  'separate_sex',
  'combined_sex',
]);

export const feedbackSourceEnum = pgEnum('feedback_source', [
  'email',
  'widget',
]);

export const feedbackTypeEnum = pgEnum('feedback_type', [
  'bug',
  'feature',
  'question',
  'general',
]);

export const backlogStatusEnum = pgEnum('backlog_status', [
  'awaiting_feedback',
  'planned',
  'in_progress',
  'completed',
  'dismissed',
]);

export const backlogPriorityEnum = pgEnum('backlog_priority', [
  'high',
  'medium',
  'low',
]);

export const timelinePostTypeEnum = pgEnum('timeline_post_type', [
  'photo',
  'note',
  'milestone',
  'video',
]);

// ── Sponsorship enums ──────────────────────────────────

export const sponsorCategoryEnum = pgEnum('sponsor_category', [
  'pet_food',
  'insurance',
  'automotive',
  'grooming',
  'health_testing',
  'pet_products',
  'local_business',
  'breed_club',
  'individual',
  'other',
]);

export const sponsorTierEnum = pgEnum('sponsor_tier', [
  'title',
  'show',
  'class',
  'prize',
  'advertiser',
]);

export const adSizeEnum = pgEnum('ad_size', [
  'full_page',
  'half_page',
  'quarter_page',
]);

// ── Print Shop enums ──────────────────────────────────

export const printOrderStatusEnum = pgEnum('print_order_status', [
  'draft',
  'awaiting_payment',
  'paid',
  'submitted',
  'in_production',
  'dispatched',
  'delivered',
  'cancelled',
  'failed',
]);

export const printServiceLevelEnum = pgEnum('print_service_level', [
  'saver',
  'standard',
  'express',
]);
