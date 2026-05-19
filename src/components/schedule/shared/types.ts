import type { ScheduleData } from '@/server/db/schema/shows';

/**
 * Types shared by both the single-breed and multi-breed schedule renderers.
 * Live in `shared/` so neither top-level component owns them.
 */

export interface ScheduleShowInfo {
  slug: string;
  name: string;
  showType: string;
  showScope: string;
  date: string;
  endDate: string;
  startTime: string | null;
  entriesOpenDate: string | null;
  entryCloseDate: string | null;
  postalCloseDate: string | null;
  kcLicenceNo: string | null;
  secretaryEmail: string | null;
  secretaryName: string | null;
  secretaryAddress: string | null;
  secretaryPhone: string | null;
  showOpenTime: string | null;
  onCallVet: string | null;
  description: string | null;
  firstEntryFee: number | null;
  subsequentEntryFee: number | null;
  nfcEntryFee: number | null;
  juniorHandlerFee: number | null;
  multiDogThreshold: number | null;
  multiDogPackagePence: number | null;
  /** Per-show named discount tiers (Members, Pensioners, etc.). Each row
   *  carries its first-class fee and optional multi-dog package price. */
  discountGroups: Array<{
    label: string;
    firstEntryFeePence: number;
    multiDogPackagePence: number | null;
  }>;
  acceptsPostalEntries: boolean;
  scheduleData: ScheduleData | null;
  organisation: {
    name: string;
    contactEmail: string | null;
    contactPhone: string | null;
    website: string | null;
    logoUrl: string | null;
  } | null;
  venue: {
    name: string;
    address: string | null;
    postcode: string | null;
  } | null;
}

export interface ScheduleClass {
  classNumber: number | null;
  /** Display label — "1" for numbered classes, "JHA"/"JHB" for Junior
   *  Handler classes which sit outside the RKC-licensed class count. */
  classLabel: string;
  className: string;
  classDescription: string | null;
  sex: string | null;
  breedName: string | null;
  classType?: string | null;
  /** Per-class entry fee in pence. When this differs from the show's
   *  show.firstEntryFee the schedule should surface it as a "Special
   *  class fees" override line — e.g. SAC or Junior classes priced at
   *  £3 on an otherwise £20 show. Null = use the show-level fee. */
  entryFee?: number | null;
  /** RKC group of the class's breed. Populated for multi-breed shows so the
   *  schedule can render Group classification headings (HOUND GROUP, etc.).
   *  Null for breed-less classes (AVNSC, Variety, JH) and for single-breed
   *  shows where the heading is unnecessary. */
  breedGroupName?: string | null;
  /** Sort order for the breed's group (used to render groups in the RKC's
   *  conventional order regardless of breed name alphabetisation). */
  breedGroupSortOrder?: number | null;
}

export interface ScheduleJudge {
  name: string;
  affix?: string | null;
  breeds: string[];
  sex?: string | null; // 'dog' | 'bitch' | null (both)
  /** Role label, e.g. "Dogs & Bitches" or "Junior Handling" */
  role?: string;
  /** Pre-formatted label for display, e.g. "Mr A Winfrow (Sadira) — Dogs & Bitches" */
  displayLabel?: string;
}

/** Full-page A5 advert that slots into the schedule or catalogue PDF.
 *  Secretaries upload these via the Adverts page. */
export interface ScheduleAdvert {
  id: string;
  advertiserName: string;
  document: 'schedule' | 'catalogue' | 'both';
  position: 'inside_front' | 'inside_back' | 'last_page';
  imageUrl: string | null;
  sortOrder: number;
}

export interface ScheduleSponsor {
  name: string;
  tier: string;
  customTitle: string | null;
  logoUrl: string | null;
  website: string | null;
  specialPrizes: string | null;
  classSponsorships: Array<{
    className: string;
    trophyName: string | null;
    trophyDonor: string | null;
    prizeDescription: string | null;
  }>;
}

/** Multi-breed shows have RKC group-level "best in group" awards plus
 *  variants for puppy/veteran. Single-breed shows only declare best in
 *  show / best of breed. The `variant` prop on shared subcomponents
 *  branches on this. */
export type ScheduleVariant = 'single-breed' | 'multi-breed';

/**
 * Multi-breed group/show-level judge assignment. Renders on the
 * "BIS & Group Judges" panel page near the front of the schedule and
 * (for group-level entries) on the per-group banner above each group's
 * classification block.
 *
 * Single-breed shows don't use this — their judges live in the existing
 * `judges: ScheduleJudge[]` prop.
 */
export interface SchedulePanelJudge {
  /** Judge's display name, including any affix in parentheses. */
  displayLabel: string;
  /** Role name as stored in judge_roles (e.g. "Group Judge"). */
  roleName: string;
  /** Short label for compact rendering ("Puppy Group", "BIS"). */
  roleShortLabel: string | null;
  /** Sort order for rendering — both within the panel table and the per-group banner. */
  roleSortOrder: number;
  /** True for per-group roles, false for show-level (BIS, BPIS, BVIS). */
  isGroupLevel: boolean;
  /** Group name (e.g. "Hound") for group-level entries. Null for show-level. */
  groupName: string | null;
  /** Sort order for the group (drives row ordering on the panel table). */
  groupSortOrder: number | null;
}
