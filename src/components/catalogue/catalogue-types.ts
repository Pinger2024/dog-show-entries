/**
 * Shared type definitions for catalogue rendering.
 *
 * Previously these lived inside `catalogue-standard.tsx`, which caused a
 * circular import between that renderer and `catalogue-front-matter.tsx`
 * (each imported types from the other). They also made it impossible to
 * delete `catalogue-standard.tsx` when that format was retired, because
 * every other renderer still needed the types.
 *
 * Living in their own file means renderers depend on *types* rather than
 * on each other, so individual renderers can be removed or added freely.
 */

export interface CatalogueEntry {
  catalogueNumber: string | null;
  dogName: string | null;
  breed: string | undefined;
  breedId?: string | undefined;
  group: string | undefined;
  groupSortOrder: number | undefined;
  sex: string | undefined;
  dateOfBirth: string | null | undefined;
  kcRegNumber: string | null | undefined;
  colour: string | null | undefined;
  sire: string | null | undefined;
  dam: string | null | undefined;
  breeder: string | null | undefined;
  owners: { name: string; address: string | null; userId: string | null }[];
  exhibitorId: string | undefined;
  // handler comes from an optional related row — the name field there is
  // nullable, so the full join can yield null as well as undefined.
  handler: string | null | undefined;
  exhibitor: string | null | undefined;
  jhHandlerName: string | null | undefined;
  classes: {
    name: string | undefined;
    sex: string | null | undefined;
    classNumber: number | null | undefined;
    sortOrder: number | undefined;
    showClassId?: string | undefined;
  }[];
  status: string;
  entryType: string;
  /** RKC F(1).11.b.(6)/(8) — when true, owner name and address are withheld from the catalogue */
  withholdFromPublication?: boolean;
}

export interface ShowSponsorInfo {
  name: string;
  tier: string;
  logoUrl: string | null;
  website: string | null;
  customTitle: string | null;
}

/** A show class for rendering empty classes in the catalogue */
export interface ShowClassInfo {
  className: string;
  classNumber: number | null;
  sortOrder: number;
  sex: string | null;
}

/** Class-level sponsorship/trophy data used by the trophies page and inline class display */
export interface ClassSponsorshipInfo {
  className: string;
  classNumber: number | null;
  trophyName: string | null;
  trophyDonor: string | null;
  sponsorName: string | null;
  sponsorAffix: string | null;
  prizeDescription: string | null;
}

export interface CatalogueShowInfo {
  name: string;
  showType: string | undefined;
  date: string;
  endDate?: string;
  venue: string | undefined;
  venueAddress: string | undefined;
  organisation: string | undefined;
  kcLicenceNo: string | null | undefined;
  startTime?: string | null;
  logoUrl?: string;
  secretaryName?: string;
  secretaryEmail?: string;
  secretaryPhone?: string;
  secretaryAddress?: string;
  onCallVet?: string;
  showOpenTime?: string | null;
  totalClasses?: number;
  wetWeatherAccommodation?: boolean;
  judgedOnGroupSystem?: boolean;
  judgesByBreedName?: Record<string, string>;
  /** Sex-annotated judge labels: ["Dogs — Mr A Winfrow", "Bitches — Ms A Swift"] */
  judgeDisplayList?: string[];
  /** Judge name -> bio text */
  judgeBios?: Record<string, string>;
  /** Breed name -> ring number */
  judgeRingNumbers?: Record<string, string>;
  classDefinitions?: { name: string; description: string | null }[];
  showScope?: string;
  /** Class sponsorship data for trophies page + inline display */
  classSponsorships?: ClassSponsorshipInfo[];
  /** Custom statements for cover page (e.g. "OUTSIDE ATTRACTION - KC RULE F(1) 16h") */
  customStatements?: string[];
  /** Show-level sponsors for the cover/front matter */
  showSponsors?: ShowSponsorInfo[];
  /** All show classes (for rendering empty classes) */
  allShowClasses?: ShowClassInfo[];
  /** Secretary's welcome note to exhibitors — shown in catalogue front matter */
  welcomeNote?: string;
  /** Judge name -> photo URL */
  judgePhotos?: Record<string, string>;
  /** Skip the separate trophies page (when sponsorships are shown inline) */
  skipTrophiesPage?: boolean;
  /** Whether the show has outside attraction (KC Reg F(1) 16H) — shown prominently on cover */
  outsideAttraction?: boolean;
  /** Show manager name */
  showManager?: string;
  /** Docking statement per F(1).7.c(2) — varies by country and public admission */
  dockingStatement?: string;
}
