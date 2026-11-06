/**
 * Single source of truth for the captions / messages we put alongside
 * shared show URLs. Used by:
 *   - The "Copy post" button (caption + URL bundled to clipboard)
 *   - The WhatsApp share link's prefilled text
 *   - The OS share-sheet payload (when navigator.share is invoked)
 *
 * Keeping it in one place so we can A/B variants from a single edit
 * later. Style notes:
 *   - First line lands in WhatsApp link previews + IG bio reads — must
 *     hook in 8 words or fewer
 *   - Mention the host club + date prominently — that's the proof of
 *     legitimacy a UK breed-group reader looks for
 *   - End with a clear "what to do" CTA
 *   - No more than ~2 emojis — too many feels spammy to the 60+ cohort
 */
export interface ShareCaptionInput {
  showName: string;
  showType: string;
  organisationName: string;
  showDate: string;
  venueName?: string | null;
  /** ISO date string for the entry close, used to compute urgency. */
  entryCloseDate?: string | null;
}

/**
 * Build the caption + URL together — one string, ready to paste into
 * a Facebook post, WhatsApp message, or Instagram bio.
 */
export function buildSharePost(input: ShareCaptionInput, shareUrl: string): string {
  return `${buildShareCaption(input)}\n\n👉 ${shareUrl}`;
}

/**
 * Just the caption (no URL). Useful when the URL is being attached
 * separately, e.g. by the WhatsApp share link which appends it.
 */
export function buildShareCaption(input: ShareCaptionInput): string {
  const { showName, showType, organisationName, showDate, venueName, entryCloseDate } = input;

  const lines: string[] = [];

  // Hook line — short, scannable
  lines.push(`🐾 ${showName}`);
  lines.push('');

  // Body line — who, what, when, where
  const where = venueName ? ` at ${venueName}` : '';
  lines.push(`A ${showType.toLowerCase()} hosted by ${organisationName}, ${showDate}${where}.`);

  // Urgency hint if entries are closing in the next week
  if (entryCloseDate) {
    const daysToClose = (new Date(entryCloseDate).getTime() - Date.now()) / 86_400_000;
    if (daysToClose > 0 && daysToClose <= 7) {
      const close = new Date(entryCloseDate).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
      lines.push('');
      lines.push(`⏰ Entries close ${close}.`);
    }
  }

  lines.push('');
  lines.push('Enter online in a few easy steps — Apple Pay & Google Pay accepted.');

  return lines.join('\n');
}
