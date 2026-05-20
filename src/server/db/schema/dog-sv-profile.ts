import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import {
  hipGradeEnum,
  elbowGradeEnum,
  haemophiliaClearEnum,
  dmTestEnum,
  koerungEnum,
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
  workingTitle: text('working_title'),
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
