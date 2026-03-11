import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { showTypeEnum, showScopeEnum, showStatusEnum, classSexArrangementEnum } from './enums';

// ── Schedule data stored as JSONB on each show ──
export interface ScheduleData {
  // Location (determines docking statement wording)
  country?: 'england' | 'wales' | 'scotland' | 'northern_ireland';
  publicAdmission?: boolean;

  // Facilities
  wetWeatherAccommodation?: boolean;
  isBenched?: boolean;
  benchingRemovalTime?: string;

  // NFC policy
  acceptsNfc?: boolean;

  // Group system
  judgedOnGroupSystem?: boolean;

  // Show timing
  latestArrivalTime?: string;

  // People
  showManager?: string;
  guarantors?: { name: string; address?: string }[];
  officers?: { name: string; position: string }[];

  // Awards & prizes
  awardsDescription?: string;
  prizeMoney?: string;

  // Sponsorship
  sponsorships?: { sponsorName: string; description: string }[];

  // Optional text sections
  directions?: string;
  catering?: string;
  futureShowDates?: string;
  additionalNotes?: string;
}
import { organisations } from './organisations';
import { users } from './users';
import { venues } from './venues';
import { showClasses } from './show-classes';
import { entries } from './entries';
import { rings } from './rings';
import { judgeAssignments } from './judge-assignments';
import { judgeContracts } from './judge-contracts';
import { stewardAssignments } from './steward-assignments';
import { showChecklistItems } from './show-checklist';
import { sundryItems } from './sundry-items';
import { showSponsors } from './sponsors';

export const shows = pgTable(
  'shows',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').unique(),
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
    secretaryUserId: uuid('secretary_user_id').references(() => users.id),
    secretaryEmail: text('secretary_email'),
    secretaryName: text('secretary_name'),
    secretaryAddress: text('secretary_address'),
    secretaryPhone: text('secretary_phone'),
    showOpenTime: text('show_open_time'),
    onCallVet: text('on_call_vet'),
    acceptsPostalEntries: boolean('accepts_postal_entries').notNull().default(false),
    classSexArrangement: classSexArrangementEnum('class_sex_arrangement'),
    scheduleData: jsonb('schedule_data').$type<ScheduleData>(),
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
  secretary: one(users, {
    fields: [shows.secretaryUserId],
    references: [users.id],
    relationName: 'showSecretary',
  }),
  showClasses: many(showClasses),
  entries: many(entries),
  rings: many(rings),
  judgeAssignments: many(judgeAssignments),
  judgeContracts: many(judgeContracts),
  stewardAssignments: many(stewardAssignments),
  checklistItems: many(showChecklistItems),
  sundryItems: many(sundryItems),
  showSponsors: many(showSponsors),
}));
