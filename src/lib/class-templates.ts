/**
 * Class template presets for quick show setup.
 * Each template defines which class definition names to include.
 */

export interface ClassTemplate {
  id: string;
  name: string;
  description: string;
  classNames: string[];
  defaultFeePence: number;
  splitBySex: boolean;
}

export const CLASS_TEMPLATES: ClassTemplate[] = [
  {
    id: 'championship_standard',
    name: 'Championship Standard',
    description: 'Full KC championship class schedule with all standard classes, split by sex.',
    classNames: [
      'Minor Puppy',
      'Puppy',
      'Junior',
      'Yearling',
      'Maiden',
      'Novice',
      'Graduate',
      'Post Graduate',
      'Limit',
      'Open',
      'Veteran',
    ],
    defaultFeePence: 2500,
    splitBySex: true,
  },
  {
    id: 'open_standard',
    name: 'Open Standard',
    description: 'Standard open show class schedule with popular classes.',
    classNames: [
      'Minor Puppy',
      'Puppy',
      'Junior',
      'Novice',
      'Post Graduate',
      'Limit',
      'Open',
      'Veteran',
    ],
    defaultFeePence: 500,
    splitBySex: false,
  },
  {
    id: 'limited_basic',
    name: 'Limited Basic',
    description: 'Basic limited show schedule with core classes.',
    classNames: [
      'Puppy',
      'Junior',
      'Novice',
      'Post Graduate',
      'Open',
    ],
    defaultFeePence: 300,
    splitBySex: false,
  },
  {
    id: 'companion',
    name: 'Companion',
    description: 'Companion show schedule for fun and social events.',
    classNames: [
      'Puppy',
      'Open',
      'Veteran',
      'Special Beginners',
    ],
    defaultFeePence: 200,
    splitBySex: false,
  },
];
