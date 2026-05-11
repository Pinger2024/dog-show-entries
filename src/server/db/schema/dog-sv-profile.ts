import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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
  hipGrade: hipGradeEnum('hip_grade'),
  hipScore: text('hip_score'),
  elbowGrade: elbowGradeEnum('elbow_grade'),
  elbowScore: text('elbow_score'),
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
