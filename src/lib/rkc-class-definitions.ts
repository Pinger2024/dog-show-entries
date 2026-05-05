/**
 * Verbatim RKC class definitions per the specimen breed championship schedule
 * (RKC, Feb 2026 edition). Used by the generated schedule PDF.
 *
 * RKC F(1) requires every scheduled class to be defined in the schedule, with
 * a definition matching the published specimen. Keep this in sync with:
 * https://www.royalkennelclub.com/dog-showing/becoming-a-show-secretary/
 *
 * The schedule generator looks up by exact class-definition `name` (case
 * insensitive). Classes not in this map fall back to the description stored
 * in the `class_definitions` row, so club-specific Special classes still
 * render — they just won't be RKC-verbatim.
 */

export interface RkcClassDefinition {
  /** Display name shown in the schedule definition list (uppercased). */
  label: string;
  /** Sort order in the definition list — matches the RKC specimen ordering. */
  sortOrder: number;
  /** Verbatim RKC definition text. */
  text: string;
}

/**
 * Map keys are the lowercased `class_definitions.name`. Lookup is case
 * insensitive — the schedule normalises before lookup.
 */
export const RKC_CLASS_DEFINITIONS: Record<string, RkcClassDefinition> = {
  'baby puppy': {
    label: 'BABY PUPPY',
    sortOrder: 5,
    text: 'A baby puppy is a dog of four and less than six calendar months of age on the first day of the show.',
  },
  'minor puppy': {
    label: 'MINOR PUPPY',
    sortOrder: 10,
    text: 'For dogs of six and not exceeding nine calendar months of age on the first day of the Show.',
  },
  'puppy': {
    label: 'PUPPY',
    sortOrder: 20,
    text: 'For dogs of six and not exceeding twelve calendar months of age on the first day of the Show.',
  },
  'junior': {
    label: 'JUNIOR',
    sortOrder: 30,
    text: 'For dogs of six and not exceeding eighteen calendar months of age on the first day of the Show.',
  },
  'yearling': {
    label: 'YEARLING',
    sortOrder: 40,
    text: 'For dogs of twelve and not exceeding twenty four calendar months of age on the first day of the Show.',
  },
  'beginners': {
    label: 'BEGINNERS',
    sortOrder: 45,
    text: 'For owner, handler or exhibit not having won a first prize at a Championship or Open Show.',
  },
  'maiden': {
    label: 'MAIDEN',
    sortOrder: 50,
    text: 'For dogs which have not won a Challenge Certificate/CACIB/CAC/Green Star or a First Prize at an Open or championship show (Minor Puppy, Special Minor Puppy, Puppy and Special Puppy classes excepted, whether restricted or not).',
  },
  'novice': {
    label: 'NOVICE',
    sortOrder: 60,
    text: 'For dogs which have not won a Challenge Certificate/CACIB/CAC/Green Star or three or more First Prizes at Open and Championship Shows (Minor Puppy, Special Minor Puppy, Puppy and Special Puppy classes excepted, whether restricted or not).',
  },
  'tyro': {
    label: 'TYRO',
    sortOrder: 65,
    text: 'For dogs which have not won a Challenge Certificate/CACIB/CAC/Green Star or five or more First Prizes at Open and Championship Shows (Minor Puppy, Special Minor Puppy, Puppy and Special Puppy classes excepted, whether restricted or not).',
  },
  'debutant': {
    label: 'DEBUTANT',
    sortOrder: 68,
    text: 'For dogs which have not won a Challenge Certificate/CACIB/CAC/Green Star or a First Prize at a Championship Show where Challenge Certificates were offered for the breed (Minor Puppy, Special Minor Puppy, Puppy and Special Puppy classes excepted, whether restricted or not).',
  },
  'undergraduate': {
    label: 'UNDERGRADUATE',
    sortOrder: 70,
    text: 'For dogs which have not won a Challenge Certificate/CACIB/CAC/Green Star or three or more First Prizes at Championship Shows in Undergraduate, Graduate, Post Graduate, Minor Limit, Mid Limit, Limit or Open Classes whether restricted or not where Challenge Certificates were offered for the breed.',
  },
  'graduate': {
    label: 'GRADUATE',
    sortOrder: 80,
    text: 'For dogs which have not won a Challenge Certificate/CACIB/CAC/Green Star or four or more First Prizes at Championship Shows in Graduate, Post Graduate, Minor Limit, Mid Limit, Limit and Open classes, whether restricted or not where Challenge Certificates were offered for the breed.',
  },
  'post graduate': {
    label: 'POST GRADUATE',
    sortOrder: 90,
    text: 'For dogs which have not won a Challenge Certificate/CACIB/CAC/Green Star or five or more First Prizes at Championship Shows in Post Graduate, Minor Limit, Mid Limit, Limit and Open classes, whether restricted or not where Challenge Certificates were offered for the breed.',
  },
  'minor limit': {
    label: 'MINOR LIMIT',
    sortOrder: 95,
    text: 'For dogs which have not won two Challenge Certificates/CACIB/CAC/Green Stars or three or more First Prizes in all at Championship Shows in Minor Limit, Mid Limit, Limit and Open classes, confined to the breed, whether restricted or not at Shows where Challenge Certificates were offered for the breed.',
  },
  'mid limit': {
    label: 'MID LIMIT',
    sortOrder: 100,
    text: 'For dogs which have not become show Champions under Royal Kennel Club Regulations or under the rules of any governing body recognised by The Royal Kennel Club, or won 3 or more CC/CACIB/CAC/Green Stars or won five or more First Prizes in all at Championship Shows in Mid Limit, Limit or Open Classes confined to the breed, whether restricted or not, at shows where Challenge Certificates were offered for the breed.',
  },
  'limit': {
    label: 'LIMIT',
    sortOrder: 110,
    text: 'For dogs which have not become show Champions under The Royal Kennel Club Regulations or under the rules of any governing body recognised by The Royal Kennel Club, or won 3 or more CC/CACIB/CAC/Green Stars or won 7 or more First Prizes in all at Championship Shows in Limit or Open Classes confined to the Breed, whether restricted or not at Shows where Challenge Certificates were offered for the breed.',
  },
  'open': {
    label: 'OPEN',
    sortOrder: 120,
    text: 'For all dogs of the breed for which the class is provided and eligible for entry at the Show.',
  },
  'veteran': {
    label: 'VETERAN',
    sortOrder: 200,
    text: 'For dogs of not less than seven years of age on the first day of the Show.',
  },
  'champion': {
    label: 'CHAMPION',
    sortOrder: 210,
    text: 'For dogs which have been confirmed a Champion or Show Champion under Royal Kennel Club Regulations or under the rules of any governing body recognised by The Royal Kennel Club.',
  },
  'field trial': {
    label: 'FIELD TRIAL',
    sortOrder: 220,
    text: 'For dogs which have won prizes, Diplomas of Merit or Certificates of Merit in actual competition at a Field Trial held under Royal Kennel Club or Irish Kennel Club Field Trial Regulations.',
  },
  'working trial': {
    label: 'WORKING TRIAL',
    sortOrder: 230,
    text: 'For dogs which have won prizes in competition at a Bloodhound Working Trial and Royal Kennel Club licensed Working Trials, held under Royal Kennel Club Regulations.',
  },
  'stud dog': {
    label: 'STUD DOG',
    sortOrder: 240,
    text: 'For stud dogs and at least two progeny of which only the progeny must be entered and exhibited in a breed class at the Show.',
  },
  'brood bitch': {
    label: 'BROOD BITCH',
    sortOrder: 250,
    text: 'For Brood Bitches and at least two progeny of which only the progeny must be entered and exhibited in a breed class at the Show.',
  },
  'progeny': {
    label: 'PROGENY',
    sortOrder: 260,
    text: 'For a dog or bitch, accompanied by at least three of its registered progeny. The dog or bitch not necessarily entered in another class however, all progeny having been entered and exhibited in another class. The dog or bitch and the progeny need not be registered in the same ownership.',
  },
  'brace': {
    label: 'BRACE',
    sortOrder: 270,
    text: 'For two exhibits (either sex or mixed) of one breed belonging to the same exhibitor, each exhibit having been entered in some class other than Brace or Team.',
  },
  'team': {
    label: 'TEAM',
    sortOrder: 280,
    text: 'For three or more exhibits (either sex or mixed) of one breed belonging to the same exhibitor, each exhibit having been entered in some class other than Brace or Team.',
  },
  'breeders': {
    label: 'BREEDERS',
    sortOrder: 290,
    text: 'For dogs bred by the exhibitor.',
  },
  'good citizen dog scheme': {
    label: 'GOOD CITIZEN DOG SCHEME CLASS',
    sortOrder: 300,
    text: 'For dogs that have achieved their GCDS Bronze Award Certificate or above.',
  },
};

/** Generic NFC entry — included separately as it isn't a competitive class. */
export const RKC_NFC_DEFINITION: RkcClassDefinition = {
  label: 'NOT FOR COMPETITION',
  sortOrder: 999,
  text: 'Dogs may be entered Not for Competition. Such entries must be recorded on the entry form and must be Royal Kennel Club registered. NFC dogs do not compete for awards.',
};

/**
 * Look up a definition by class name (case insensitive). Returns null if not
 * a recognised RKC class — caller should fall back to the DB description.
 */
export function lookupRkcDefinition(className: string): RkcClassDefinition | null {
  const key = className.trim().toLowerCase();
  return RKC_CLASS_DEFINITIONS[key] ?? null;
}
