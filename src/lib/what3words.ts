/**
 * ONE owner for how a venue's what3words is written and linked — the show page,
 * every schedule layout and the catalogue cover print it through here.
 *
 * Secretaries type it with and without the leading "///" (both are on file), and
 * sometimes with capitals or stray spaces; what3words addresses are lower-case
 * words joined by dots, so it's tidied once here rather than in each renderer.
 */
function words(raw: string | null | undefined): string | null {
  const w = (raw ?? '').trim().replace(/^\/+/, '').replace(/\s+/g, '').toLowerCase();
  return w || null;
}

/** "///toasters.acclaim.prompt", or null when none is set. */
export function what3wordsAddress(raw: string | null | undefined): string | null {
  const w = words(raw);
  return w ? `///${w}` : null;
}

/** The what3words map link for it, or null when none is set. */
export function what3wordsUrl(raw: string | null | undefined): string | null {
  const w = words(raw);
  return w ? `https://what3words.com/${w}` : null;
}
