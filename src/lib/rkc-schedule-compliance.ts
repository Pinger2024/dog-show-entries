import { getRkcScheduleProfile } from '@/lib/rkc-schedule-profile';

export interface RkcComplianceShow {
  showType: string;
  showScope: string;
  showRuleset?: 'rkc' | 'wusv' | null;
  judgedOnGroupSystem?: boolean | null;
}

export interface RkcComplianceClass {
  className: string;
  classType?: string | null;
  breedId?: string | null;
  breedName?: string | null;
  breedGroupName?: string | null;
  classGroup?: string | null;
  sex?: string | null;
}

export interface RkcComplianceShowBreed {
  breedId: string;
  breedName: string;
  ccOffered?: boolean | null;
}

export interface RkcComplianceIssue {
  code:
    | 'minimum_classes'
    | 'single_breed_open_class'
    | 'breed_open_class'
    | 'baby_puppy_not_permitted'
    | 'group_avnsc'
    | 'group_avibr'
    | 'cc_breed_minimum_classes'
    | 'cc_breed_open_limit';
  severity: 'required';
  message: string;
}

function normalise(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function isLicensedClass(item: RkcComplianceClass): boolean {
  if (item.classType === 'junior_handler') return false;
  return !normalise(item.className).startsWith('special award class');
}

function isNamed(item: RkcComplianceClass, ...names: string[]): boolean {
  const value = normalise(item.className);
  return names.some((name) => value === normalise(name));
}

/** Returns only hard RKC failures: every result must be fixed before entries open. */
export function validateRkcSchedule({
  show,
  classes,
  showBreeds = [],
}: {
  show: RkcComplianceShow;
  classes: RkcComplianceClass[];
  showBreeds?: RkcComplianceShowBreed[];
}): RkcComplianceIssue[] {
  if (show.showRuleset === 'wusv' || show.showType === 'companion') return [];

  const profile = getRkcScheduleProfile(show);
  const licensedClasses = classes.filter(isLicensedClass);
  const issues: RkcComplianceIssue[] = [];

  if (licensedClasses.length < profile.minimumClasses) {
    issues.push({
      code: 'minimum_classes',
      severity: 'required',
      message: `${licensedClasses.length} licensed classes; the RKC minimum is ${profile.minimumClasses}. Junior Handling and Special Award Classes do not count.`,
    });
  }

  if (show.showScope === 'single_breed') {
    if (!licensedClasses.some((item) => isNamed(item, 'Open'))) {
      issues.push({
        code: 'single_breed_open_class',
        severity: 'required',
        message: 'The single-breed classification must include an Open class.',
      });
    }
    return issues;
  }

  if (licensedClasses.some((item) => isNamed(item, 'Baby Puppy'))) {
    issues.push({
      code: 'baby_puppy_not_permitted',
      severity: 'required',
      message: 'Baby Puppy classes may only be scheduled at breed club shows.',
    });
  }

  const breedRows = new Map<string, { name: string; classes: RkcComplianceClass[] }>();
  for (const item of licensedClasses) {
    if (!item.breedId) continue;
    const row = breedRows.get(item.breedId) ?? {
      name: item.breedName?.trim() || 'Unnamed breed',
      classes: [],
    };
    row.classes.push(item);
    breedRows.set(item.breedId, row);
  }

  const missingOpen = Array.from(breedRows.values())
    .filter((breed) => !breed.classes.some((item) => isNamed(item, 'Open')))
    .map((breed) => breed.name);
  if (missingOpen.length > 0) {
    issues.push({
      code: 'breed_open_class',
      severity: 'required',
      message: `Open class missing for: ${missingOpen.join(', ')}.`,
    });
  }

  if (profile.isGroupSystem) {
    const groups = new Set(
      licensedClasses
        .filter((item) => item.breedId && item.breedGroupName)
        .map((item) => item.breedGroupName!.trim())
        .filter(Boolean),
    );
    for (const group of groups) {
      const hasAvnsc = licensedClasses.some((item) =>
        isNamed(item, 'AVNSC', 'Any Variety Not Separately Classified') && item.classGroup === group,
      );
      const hasAvibr = licensedClasses.some((item) =>
        isNamed(item, 'AVIBR', 'Any Variety Imported Breed Register') && item.classGroup === group,
      );
      if (!hasAvnsc) {
        issues.push({ code: 'group_avnsc', severity: 'required', message: `${group} requires an AVNSC class assigned to that group.` });
      }
      if (!hasAvibr) {
        issues.push({ code: 'group_avibr', severity: 'required', message: `${group} requires an AVIBR class assigned to that group.` });
      }
    }
  }

  if (show.showType === 'championship') {
    for (const showBreed of showBreeds.filter((item) => item.ccOffered)) {
      const breedClasses = breedRows.get(showBreed.breedId)?.classes ?? [];
      if (breedClasses.length < 8) {
        issues.push({
          code: 'cc_breed_minimum_classes',
          severity: 'required',
          message: `${showBreed.breedName} offers CCs and needs at least 8 classes; ${breedClasses.length} are scheduled.`,
        });
      }
      const required = [
        ['Open', 'dog'],
        ['Open', 'bitch'],
        ['Limit', 'dog'],
        ['Limit', 'bitch'],
      ] as const;
      const missing = required.filter(([name, sex]) =>
        !breedClasses.some((item) => isNamed(item, name) && item.sex === sex),
      );
      if (missing.length > 0) {
        issues.push({
          code: 'cc_breed_open_limit',
          severity: 'required',
          message: `${showBreed.breedName} is missing ${missing.map(([name, sex]) => `${name} ${sex === 'dog' ? 'Dog' : 'Bitch'}`).join(', ')}.`,
        });
      }
    }
  }

  return issues;
}
