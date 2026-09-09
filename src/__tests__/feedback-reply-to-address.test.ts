import { describe, it, expect } from 'vitest';
import { scanFiles } from './helpers/static-scan';

// remishowmanager.co.uk's MX points at Zoho, which has no mailbox for
// feedback@remishowmanager.co.uk — replies bounce with 550 5.1.1. The real
// receiving address lives on the inbound. subdomain (FEEDBACK_REPLY_TO in
// '@/lib/email-addresses'). This guard stops the bouncing literal creeping
// back into a reply-to call site.
describe('feedback reply-to address', () => {
  it('never references the bouncing feedback@remishowmanager.co.uk address', () => {
    const pattern = /feedback@remishowmanager\.co\.uk/;
    const matches = scanFiles(['src'], ['.ts', '.tsx'], pattern).filter(
      (m) => !m.file.includes('__tests__'),
    );

    if (matches.length > 0) {
      const details = matches.map((m) => `  ${m.file}:${m.line}  ${m.content}`).join('\n');
      expect.fail(
        `Found references to the bouncing feedback@remishowmanager.co.uk address ` +
          `(Zoho has no mailbox for it — replies bounce). Use FEEDBACK_REPLY_TO from ` +
          `'@/lib/email-addresses' instead:\n${details}`,
      );
    }
  });
});
