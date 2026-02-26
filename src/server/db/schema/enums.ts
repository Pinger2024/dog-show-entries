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
]);

export const classTypeEnum = pgEnum('class_type', [
  'age',
  'achievement',
  'special',
]);
