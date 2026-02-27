/**
 * Kennel Club registration number utilities.
 *
 * This module provides:
 * - Registration number format validation
 * - A link to the KC Health Test Results Finder for manual verification
 * - Dog lookup via Firecrawl web scraping of the KC website
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
 * Look up a dog on the KC Health Test Results Finder via Firecrawl web scraping.
 *
 * Accepts a registration number or registered name. Returns structured dog
 * details if found, or null if the lookup fails or no results are found.
 */
export async function lookupDogByKcReg(
  query: string
): Promise<null | {
  registeredName: string;
  breed: string;
  dateOfBirth: string;
  sex: 'dog' | 'bitch';
  sire: string;
  dam: string;
  breeder: string;
  colour?: string;
}> {
  // Dynamic import to avoid loading Firecrawl when not needed
  const { scrapeKcDog } = await import('./firecrawl');
  return scrapeKcDog(query);
}
