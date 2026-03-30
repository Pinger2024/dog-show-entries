/**
 * Class template presets for quick show setup.
 * Each template defines which class definition names to include.
 */

/** "Special Long Coat" classes are restricted to German Shepherd Dogs only. */
const GSD_ONLY_CLASS_RE = /^Special Long Coat/i;
const GSD_BREED_RE = /german shepherd/i;

export const isGsdOnlyClass = (className: string) => GSD_ONLY_CLASS_RE.test(className);
export const isGsdBreed = (breedName: string) => GSD_BREED_RE.test(breedName);

export interface ClassTemplate {
  id: string;
  name: string;
  description: string;
  classNames: string[];
  defaultFeePence: number;
  splitBySex: boolean;
  isHandling?: boolean;
  /** Show types this template is relevant for. If undefined, shown for all types. */
  showTypes?: string[];
  /** If true, only shown for GSD single-breed shows. */
  gsdOnly?: boolean;
}

/** Filter templates to those relevant for a given show type. GSD-only templates
 *  are excluded unless the show is known to be a GSD breed show. */
export function getRelevantTemplates(showType?: string): ClassTemplate[] {
  return CLASS_TEMPLATES.filter((t) => {
    // Handling templates always shown (they're add-ons)
    if (t.isHandling) return true;
    // GSD-only templates: hide for now (would need breed context to show)
    if (t.gsdOnly) return false;
    // If template has showTypes restriction, check it
    if (t.showTypes && showType && !t.showTypes.includes(showType)) return false;
    return true;
  });
}

export const CLASS_TEMPLATES: ClassTemplate[] = [
  {
    id: 'championship_standard',
    name: 'Championship Standard',
    description: 'Full RKC championship class schedule with all standard classes, split by sex.',
    showTypes: ['championship'],
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
    showTypes: ['open', 'premier_open'],
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
    showTypes: ['limited', 'primary'],
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
    id: 'gsd_championship_single_breed',
    name: 'GSD Championship (Single Breed)',
    description: 'Full class schedule for GSD single-breed championship shows, including Long Coat varieties.',
    showTypes: ['championship'],
    gsdOnly: true,
    classNames: [
      'Minor Puppy',
      'Puppy',
      'Junior',
      'Yearling',
      'Maiden',
      'Novice',
      'Undergraduate',
      'Graduate',
      'Post Graduate',
      'Mid Limit',
      'Limit',
      'Open',
      'Veteran',
      'Special Long Coat Puppy',
      'Special Long Coat Junior',
      'Special Long Coat Yearling',
      'Special Long Coat Open',
    ],
    defaultFeePence: 2500,
    splitBySex: true,
  },
  {
    id: 'gsd_open_single_breed',
    name: 'GSD Open (Single Breed)',
    description: 'Standard open show schedule for GSD single-breed shows, including Long Coat varieties.',
    showTypes: ['open', 'premier_open'],
    gsdOnly: true,
    classNames: [
      'Minor Puppy',
      'Puppy',
      'Junior',
      'Novice',
      'Undergraduate',
      'Post Graduate',
      'Mid Limit',
      'Limit',
      'Open',
      'Veteran',
      'Special Long Coat Puppy',
      'Special Long Coat Junior',
      'Special Long Coat Yearling',
      'Special Long Coat Open',
    ],
    defaultFeePence: 500,
    splitBySex: false,
  },
  {
    id: 'companion',
    name: 'Companion',
    description: 'Companion show schedule for fun and social events.',
    showTypes: ['companion'],
    classNames: [
      'Puppy',
      'Open',
      'Veteran',
      'Special Beginners',
    ],
    defaultFeePence: 200,
    splitBySex: false,
  },
  {
    id: 'ykc_handling',
    name: 'YKC Handling',
    description: 'Young Kennel Club handling classes — official RKC route with Crufts qualifier pathway.',
    classNames: [
      'YKC Handling (6-11)',
      'YKC Handling (12-17)',
      'YKC Handling (18-24)',
    ],
    defaultFeePence: 0,
    splitBySex: false,
    isHandling: true,
  },
  {
    id: 'jha_handling',
    name: 'JHA Handling',
    description: 'Junior Handling Association classes — independent organisation with its own finals pathway.',
    classNames: [
      'JHA Handling (6-11)',
      'JHA Handling (12-16)',
    ],
    defaultFeePence: 0,
    splitBySex: false,
    isHandling: true,
  },
];
