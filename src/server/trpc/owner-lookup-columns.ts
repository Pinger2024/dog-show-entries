/**
 * The dog-owner fields a secretary's DOG SEARCH may return about a dog that
 * isn't (yet) entered at her show — name and email, which the Add Entry dialog
 * uses to show "Owner: …" and prefill the exhibitor's email. Never the owner's
 * home address or phone.
 *
 * Bug hunt 2026-09-22: secretary.searchDogs searches every dog on Remi (and
 * anyone can register a club and become a secretary) but returned the owner
 * row in full, so a few searches could harvest exhibitors' addresses and
 * phone numbers across the platform. Whether the search should be scoped more
 * tightly (e.g. to dogs already entered with this club) is an open question
 * for Mandy; this only stops the over-return.
 */
export const dogSearchOwnerColumns = {
  id: true,
  dogId: true,
  ownerName: true,
  ownerEmail: true,
  isPrimary: true,
  sortOrder: true,
} as const;
