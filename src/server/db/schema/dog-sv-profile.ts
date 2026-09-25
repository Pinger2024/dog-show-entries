import { boolean, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import {
  hipGradeEnum,
  elbowGradeEnum,
  haemophiliaClearEnum,
  dmTestEnum,
  koerungEnum,
  dnaRecordingEnum,
} from './enums';
import { dogs } from './dogs';

export const dogSvProfile = pgTable('dog_sv_profile', {
  dogId: uuid('dog_id')
    .primaryKey()
    .references(() => dogs.id, { onDelete: 'cascade' }),
  breedSurveyClass: text('breed_survey_class'),
  /** Year the breed survey (Körung) was awarded — required for SV Adult-
   *  class entries (Amanda 2026-05-19). */
  breedSurveyYear: integer('breed_survey_year'),
  /** Name of the SV surveyor who awarded the breed survey. */
  breedSurveyor: text('breed_surveyor'),
  hipGrade: hipGradeEnum('hip_grade'),
  hipScore: text('hip_score'),
  /** Free-text alternative when hipGrade='other' — name of the body that
   *  graded the dog and the score format used. */
  hipScoreOther: text('hip_score_other'),
  elbowGrade: elbowGradeEnum('elbow_grade'),
  elbowScore: text('elbow_score'),
  elbowScoreOther: text('elbow_score_other'),
  haemophiliaClear: haemophiliaClearEnum('haemophilia_clear'),
  dmTest: dmTestEnum('dm_test'),
  koerung: koerungEnum('koerung'),
  /** SV DNA status — mandatory for Yearling+ classes per GSDL/WUSV
   *  rules. 'recorded' = DNA on file; 'proven' = parentage verified. */
  dna: dnaRecordingEnum('dna'),
  workingTitle: text('working_title'),
  /** ── Other Qualifications (Mandy 2026-08-19) ──────────────────────────
   *  The GSDL-BRG exhibit data form's "Other Qualifications: BH / AD / WB
   *  (Character Assessment) / Other" row, which we had no home for.
   *
   *  These are RECORDED, never required — Mandy confirmed no regional class
   *  gates on them, and GSDL-BRG's own rules list BH and AD only as things
   *  to declare. They are also NOT working qualifications and must never be
   *  treated as one: SV's own Prüfungsordnung says outright that "das
   *  Kennzeichen 'AD' ist kein Ausbildungskennzeichen", and BH is the
   *  prerequisite that unlocks the working-title ladder rather than a title
   *  in its own right. `hasWorkingTitle()` guards that boundary — a dog
   *  holding only these belongs in Adult, not Working.
   *
   *  They DO print: the regional catalogue lists them after the working
   *  title and Körung, e.g. "IGP1 Current Year Kkl WB, BH, AD". */
  bh: boolean('bh').default(false).notNull(),
  ad: boolean('ad').default(false).notNull(),
  /** Wesensbeurteilung — the SV character assessment. Sat between 9 and 13
   *  months and impossible to obtain later, so a dog that missed the window
   *  can never acquire it. */
  wb: boolean('wb').default(false).notNull(),
  /** The form's "Other ………" escape hatch, for a qualification outside the
   *  three above (same pattern as hipScoreOther). */
  otherQualifications: text('other_qualifications'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const dogSvProfileRelations = relations(dogSvProfile, ({ one }) => ({
  dog: one(dogs, {
    fields: [dogSvProfile.dogId],
    references: [dogs.id],
  }),
}));
