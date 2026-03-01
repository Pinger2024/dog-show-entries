import {
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { showTypeEnum, showScopeEnum, showStatusEnum } from './enums';
import { organisations } from './organisations';
import { venues } from './venues';
import { showClasses } from './show-classes';
import { entries } from './entries';
import { rings } from './rings';
import { judgeAssignments } from './judge-assignments';
import { judgeContracts } from './judge-contracts';
import { stewardAssignments } from './steward-assignments';
import { showChecklistItems } from './show-checklist';

export const shows = pgTable(
  'shows',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    showType: showTypeEnum('show_type').notNull(),
    showScope: showScopeEnum('show_scope').notNull(),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id),
    venueId: uuid('venue_id').references(() => venues.id),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }).notNull(),
    startTime: text('start_time'),
    endTime: text('end_time'),
    entriesOpenDate: timestamp('entries_open_date', { withTimezone: true }),
    entryCloseDate: timestamp('entry_close_date', { withTimezone: true }),
    postalCloseDate: timestamp('postal_close_date', { withTimezone: true }),
    status: showStatusEnum('status').notNull().default('draft'),
    kcLicenceNo: text('kc_licence_no'),
    scheduleUrl: text('schedule_url'),
    description: text('description'),
    firstEntryFee: integer('first_entry_fee'),
    subsequentEntryFee: integer('subsequent_entry_fee'),
    nfcEntryFee: integer('nfc_entry_fee'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('shows_organisation_id_idx').on(table.organisationId),
    index('shows_venue_id_idx').on(table.venueId),
    index('shows_start_date_idx').on(table.startDate),
    index('shows_status_idx').on(table.status),
  ]
);

export const showsRelations = relations(shows, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [shows.organisationId],
    references: [organisations.id],
  }),
  venue: one(venues, {
    fields: [shows.venueId],
    references: [venues.id],
  }),
  showClasses: many(showClasses),
  entries: many(entries),
  rings: many(rings),
  judgeAssignments: many(judgeAssignments),
  judgeContracts: many(judgeContracts),
  stewardAssignments: many(stewardAssignments),
  checklistItems: many(showChecklistItems),
}));
