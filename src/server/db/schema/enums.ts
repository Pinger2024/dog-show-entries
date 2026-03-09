import { pgEnum } from 'drizzle-orm/pg-core';

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

export const achievementTypeEnum = pgEnum('achievement_type', [
  'cc',
  'reserve_cc',
  'best_of_breed',
  'best_in_show',
  'reserve_best_in_show',
  'best_puppy_in_breed',
  'best_puppy_in_show',
  'best_veteran_in_breed',
  'group_placement',
  'class_placement',
  'junior_warrant',
  'stud_book',
  // Championship & breed-specific awards
  'dog_cc',
  'reserve_dog_cc',
  'bitch_cc',
  'reserve_bitch_cc',
  'best_puppy_dog',
  'best_puppy_bitch',
  'best_long_coat_dog',
  'best_long_coat_bitch',
  'best_long_coat_in_show',
]);

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
]);

export const entryAuditActionEnum = pgEnum('entry_audit_action', [
  'created',
  'classes_changed',
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
]);
