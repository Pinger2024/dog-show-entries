/**
 * Sign-in wording and links shared by the pages and emails that send someone
 * to sign in (extras without a dog, slice 2, 16 Oct 2026). ONE owner for the
 * label of the login page's emailed-link button and for the login URL.
 */

/** The login form's primary button when no password is typed. A guard test
 *  (src/__tests__/sign-in-copy.test.ts) fails if login-form.tsx drifts. */
export const MAGIC_LINK_BUTTON_LABEL = 'Send sign-in link';

/** `/login` that returns to `returnTo` (a same-site path) once signed in. */
export function signInHref(returnTo: string): string {
  return `/login?callbackUrl=${encodeURIComponent(returnTo)}`;
}

/** Page copy: what a guest does to see their order later. */
export function seeOrderLaterCopy(email: string): string {
  return `To see your order on Remi later, sign in with ${email}. We'll email you a link, no password needed.`;
}

/** Email copy: the same advice for the receipt (plain text; caller escapes). */
export function seeOrderInEmailCopy(email: string): string {
  return `To see your order on Remi, sign in with ${email} — choose “${MAGIC_LINK_BUTTON_LABEL}” and we'll email you a link.`;
}
