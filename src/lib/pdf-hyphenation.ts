/**
 * No PDF Remi makes ever breaks a word with a hyphen — not a dog's name, not a
 * pedigree, not a show's name ("British Re-gional", "Cat-alogue" on a grading
 * card, Mandy's demo check, 30 Sept 2026). @react-pdf/renderer hyphenates by
 * default and the setting is one process-wide switch.
 *
 * ONE owner. This used to be switched off in nine separate PDF modules; the
 * grading cards had none of them, so whether a card split words depended on
 * which other document happened to have been loaded in the same process
 * first. Every PDF module imports this (directly, or through
 * `@/lib/pdf-fonts`); a guard test fails the suite if the call appears
 * anywhere else.
 */
import { Font } from '@react-pdf/renderer';

Font.registerHyphenationCallback((word) => [word]);
