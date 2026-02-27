/**
 * Kennel Club registration number utilities.
 *
 * The KC does not provide a public API for dog registration lookups.
 * This module provides:
 * - Registration number format validation
 * - A link to the KC Health Test Results Finder for manual verification
 * - A placeholder for future API integration if one becomes available
 */

/**
 * Validate a Kennel Club registration number format.
 *
 * KC registration numbers come in several formats:
 * - Standard pedigree: 2-4 letters followed by 5-6 digits (e.g., "AK03456789")
 * - Older format: letters/digits with slashes (e.g., "0123AB/2019")
 * - Activity register: "ATC" prefix
 *
 * This is a lenient check — we accept alphanumeric strings of 5-15 characters
 * with optional slashes, as the KC has used many formats over the decades.
 */
export function isValidKcRegNumber(kcRegNumber: string): boolean {
  const cleaned = kcRegNumber.trim();
  if (cleaned.length < 4 || cleaned.length > 20) return false;
  // Alphanumeric characters, slashes, and spaces only
  return /^[A-Za-z0-9/\s-]+$/.test(cleaned);
}

/**
 * Format a KC registration number for display.
 */
export function formatKcRegNumber(kcRegNumber: string): string {
  return kcRegNumber.trim().toUpperCase();
}

/**
 * Get the KC Health Test Results Finder URL for manual dog lookup.
 * Users can search by registration number or registered name.
 */
export function getKcLookupUrl(): string {
  return 'https://www.thekennelclub.org.uk/search/health-test-results-finder/';
}

/**
 * Placeholder for future KC API integration.
 *
 * If the KC provides an API in the future, this function would:
 * - Accept a registration number
 * - Return dog details (registered name, breed, DOB, sire, dam, breeder, etc.)
 *
 * For now, returns null to indicate no API lookup is available.
 */
export async function lookupDogByKcReg(
  _kcRegNumber: string
): Promise<null | {
  registeredName: string;
  breed: string;
  dateOfBirth: string;
  sex: 'dog' | 'bitch';
  sire: string;
  dam: string;
  breeder: string;
}> {
  // KC does not provide a public API.
  // Return null to indicate manual entry is required.
  return null;
}
