// Shared home for Remi's inbound-email addressing.
//
// `remishowmanager.co.uk`'s MX points at Zoho, which has no mailbox for
// `feedback@` that bare domain — replies to it bounce with
// `550 5.1.1 Invalid email recipients`. The real receiving address is on the
// `inbound.` subdomain, whose MX points at Resend; the webhook at
// `src/app/api/webhooks/resend/route.ts` turns mail received there into
// `feedback` rows. Every outbound email that sets a feedback reply-to must
// use FEEDBACK_REPLY_TO below, never the bare `@remishowmanager.co.uk` address.

export const INBOUND_EMAIL_DOMAIN =
  process.env.INBOUND_EMAIL_DOMAIN ?? 'inbound.remishowmanager.co.uk';

export const FEEDBACK_REPLY_TO =
  process.env.FEEDBACK_EMAIL ?? `feedback@${INBOUND_EMAIL_DOMAIN}`;
