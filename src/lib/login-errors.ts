/**
 * What the login page says when NextAuth sends someone back with ?error=…
 * Pure, so it can be tested. The magic-link button's label comes from
 * lib/sign-in.ts (its one owner), so the message names the button exactly as
 * the form shows it.
 */
import { MAGIC_LINK_BUTTON_LABEL } from '@/lib/sign-in';

const GENERIC = 'Sign-in failed. Please try again, or use a different sign-in method.';

/** A plain, kind message for a NextAuth error code; '' when there is no error. */
export function loginErrorMessage(code: string | null | undefined): string {
  if (!code) return '';
  if (code === 'OAuthAccountNotLinked') {
    return `This email is already on Remi. Please sign in with an emailed link instead — type your email below and choose “${MAGIC_LINK_BUTTON_LABEL}”.`;
  }
  return GENERIC;
}
