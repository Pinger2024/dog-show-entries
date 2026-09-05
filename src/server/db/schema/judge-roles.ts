import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Judge roles taxonomy for multi-breed shows. Mirrors the class_definitions
 * "stock + custom" pattern — RKC-recognised roles are pre-seeded with
 * `isCustom = false`; secretaries can add their own rows for one-off shows
 * (e.g. "Stud Dog Group Judge") with `isCustom = true`.
 *
 * Roles cover the full multi-breed judging chain:
 *   - Group Judge / Puppy / Veteran / Breeders / Special Beginners / Junior
 *     Group Judge — judges the relevant best-of-group at each RKC group
 *   - Best in Show Judge / Best Puppy in Show Judge / Best Veteran in Show
 *     Judge — show-level finals
 *
 * Single-breed shows do not use this table — judge_assignments.breedId is
 * sufficient for breed-club show pairings.
 */
export const judgeRoles = pgTable(
  'judge_roles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    /** Short label for compact rendering ("Puppy Group", "BIS"). */
    shortLabel: text('short_label'),
    /** Render order for the BIS & Group Judges panel and per-group banner. */
    sortOrder: integer('sort_order').notNull().default(0),
    /** True for user-defined roles, false for the RKC-stock seeded list.
     *  UI uses this to differentiate "RKC standard" vs "Custom" badges. */
    isCustom: boolean('is_custom').notNull().default(false),
    /** True when this role is a per-group role (Group Judge, Puppy Group,
     *  etc.) — used by the per-group banner renderer. False for show-level
     *  roles (BIS, BPIS, BVIS) which appear only on the panel page. */
    isGroupLevel: boolean('is_group_level').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('judge_roles_name_idx').on(table.name),
    index('judge_roles_sort_order_idx').on(table.sortOrder),
  ]
);
