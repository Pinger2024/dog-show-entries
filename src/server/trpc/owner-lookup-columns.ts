/**
 * The dog-owner fields a secretary's DOG SEARCH may return about a dog that
 * isn't (yet) entered at her show — name and email, which the Add Entry dialog
 * uses to show "Owner: …" and prefill the exhibitor's email. Never the owner's
 * home address or phone.
 *
 * Bug hunt 2026-09-22: secretary.searchDogs searches every dog on Remi (and
 * anyone can register a club and become a secretary) but returned the owner
 * row in full, so a few searches could harvest exhibitors' addresses and
 * phone numbers across the platform. This stops the over-return.
 *
 * Scope decided by Mandy (30 Sept 2026): "if you are just searching for a dog
 * already entered in the entries tab it should just search dogs entered but if
 * your adding an entry you need to be able to search for all dogs on remi".
 * So this search — used only by the Add Entry dialog — stays platform-wide;
 * the entries tab's own search box filters the show's entries and never
 * calls it.
 */
export const dogSearchOwnerColumns = {
  id: true,
  dogId: true,
  ownerName: true,
  ownerEmail: true,
  isPrimary: true,
  sortOrder: true,
} as const;
