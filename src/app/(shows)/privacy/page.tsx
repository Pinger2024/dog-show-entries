export const metadata = {
  title: 'Privacy Policy - Remi',
  description: 'How Remi collects, uses, and protects your personal data.',
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12 sm:px-6">
      <h1 className="font-serif text-3xl font-extrabold tracking-tight sm:text-4xl">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated: 28 April 2026
      </p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="text-lg font-semibold text-foreground">1. Who we are</h2>
          <p className="mt-2">
            Remi is an online platform for UK Royal Kennel Club dog show entry
            management. Remi is a trading name of{' '}
            <strong className="text-foreground">
              Michael James and Amanda McAteer
            </strong>
            , a partnership trading from 115 Lime Avenue, Lowestoft, Suffolk,
            NR32 3FH, United Kingdom.
          </p>
          <p className="mt-2">
            For the purposes of UK GDPR and the Data Protection Act 2018 the
            partners are jointly the{' '}
            <strong className="text-foreground">data controller</strong> for
            the personal data of our exhibitor account holders.
          </p>
          <p className="mt-2">
            When a show society uses Remi to collect entries for their show,
            the society is the data controller for the entry data relating to
            that show, and Remi acts as their{' '}
            <strong className="text-foreground">data processor</strong> under
            Article 28 UK GDPR.
          </p>
          <p className="mt-2">
            Data protection questions:{' '}
            <a className="text-primary hover:underline" href="mailto:privacy@remishowmanager.co.uk">
              privacy@remishowmanager.co.uk
            </a>
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">2. What we collect</h2>
          <p className="mt-2">We collect the following categories of data:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong className="text-foreground">Account data</strong> &mdash;
              name, email address, password hash (or Google OAuth identifier),
              postal address, phone number, role, organisation memberships.
            </li>
            <li>
              <strong className="text-foreground">Dog records</strong> &mdash;
              registered name, call name, breed, sex, date of birth, RKC
              registration number, sire/dam, breeder, co-owners, titles,
              photos.
            </li>
            <li>
              <strong className="text-foreground">Entry data</strong> &mdash;
              which shows and classes you enter, NFC markers, Junior Handler
              details, special requirements.
            </li>
            <li>
              <strong className="text-foreground">Payment data</strong> &mdash;
              order total, line items, payment status. Card numbers and bank
              details are handled directly by Stripe; Remi never sees or
              stores them.
            </li>
            <li>
              <strong className="text-foreground">Communications</strong>{' '}
              &mdash; emails you send us (including feedback replies), emails
              we send you, and limited delivery metadata.
            </li>
            <li>
              <strong className="text-foreground">Technical data</strong>{' '}
              &mdash; IP address, device/browser fingerprint from session
              cookies, basic request logs for security and debugging.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">3. Why we use it &mdash; lawful basis</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong className="text-foreground">Contract (Art. 6(1)(b))</strong>{' '}
              &mdash; to provide your account, process entries and payments,
              send confirmation and payment-receipt emails, and operate the
              Service.
            </li>
            <li>
              <strong className="text-foreground">Legitimate interests (Art. 6(1)(f))</strong>{' '}
              &mdash; security and fraud prevention, detecting abuse,
              improving the Service, and responding to feedback.
            </li>
            <li>
              <strong className="text-foreground">Legal obligation (Art. 6(1)(c))</strong>{' '}
              &mdash; keeping financial records required by HMRC and
              responding to lawful requests.
            </li>
            <li>
              <strong className="text-foreground">Consent (Art. 6(1)(a))</strong>{' '}
              &mdash; used only where required, e.g. optional marketing
              communications. You can withdraw consent at any time.
            </li>
          </ul>
          <p className="mt-2">
            We do not use automated decision-making or profiling that
            produces legal effects.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">4. Who we share it with</h2>
          <p className="mt-2">
            We share personal data with the following categories of recipient:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong className="text-foreground">Show societies</strong>{' '}
              whose shows you enter &mdash; they receive the exhibitor and dog
              details needed to run the show (name, dog details, class
              selections, contact address). They act as independent data
              controllers for that entry data.
            </li>
            <li>
              <strong className="text-foreground">Stripe</strong> &mdash; our
              payment processor (data controller for payment card data; see{' '}
              <a className="text-primary hover:underline" href="https://stripe.com/gb/privacy" target="_blank" rel="noreferrer noopener">stripe.com/gb/privacy</a>).
            </li>
            <li>
              <strong className="text-foreground">Resend</strong> &mdash; our
              transactional email provider, handles outbound and inbound email
              content.
            </li>
            <li>
              <strong className="text-foreground">Render</strong> &mdash; our
              application and database hosting provider.
            </li>
            <li>
              <strong className="text-foreground">Cloudflare</strong> &mdash;
              our DNS provider and object storage (R2) for photos and
              generated PDFs.
            </li>
            <li>
              <strong className="text-foreground">Google</strong> &mdash; if
              you sign in with Google, Google provides your OAuth profile
              (name, email, avatar).
            </li>
            <li>
              <strong className="text-foreground">Law enforcement or regulators</strong>{' '}
              &mdash; where required to comply with a lawful request.
            </li>
          </ul>
          <p className="mt-2">
            We do not sell personal data and we do not share it for
            third-party marketing.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">5. International transfers</h2>
          <p className="mt-2">
            Some sub-processors (Stripe, Google, Cloudflare) operate globally
            and may transfer data outside the UK. Where they do, the transfer
            is protected by the UK International Data Transfer Agreement, UK
            addendum to the EU Standard Contractual Clauses, or an adequacy
            decision, in line with UK GDPR Articles 44&ndash;49.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">6. How long we keep it</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong className="text-foreground">Account data</strong>{' '}
              &mdash; for as long as your account is active. If you close your
              account we keep the minimum needed for legal records (below).
            </li>
            <li>
              <strong className="text-foreground">Entry and show records</strong>{' '}
              &mdash; retained for the lifetime of the dog show season&rsquo;s
              reference value and then archived. RKC audit-relevant records
              (judge contracts, award entries, catalogue) are retained for at
              least 6 years.
            </li>
            <li>
              <strong className="text-foreground">Payment records</strong>{' '}
              &mdash; retained for 6 years after the transaction to comply
              with HMRC record-keeping rules.
            </li>
            <li>
              <strong className="text-foreground">Emails and feedback</strong>{' '}
              &mdash; retained while useful for support, then deleted on
              request or when no longer needed.
            </li>
            <li>
              <strong className="text-foreground">Server logs</strong>{' '}
              &mdash; rotated within 30 days.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">7. Your rights</h2>
          <p className="mt-2">Under UK GDPR you have the right to:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>access a copy of the personal data we hold about you</li>
            <li>have inaccurate data corrected</li>
            <li>have data erased (subject to legal retention rules)</li>
            <li>restrict or object to certain processing</li>
            <li>data portability in a machine-readable format</li>
            <li>withdraw any consent you have given, at any time</li>
          </ul>
          <p className="mt-2">
            To exercise any of these rights, email{' '}
            <a className="text-primary hover:underline" href="mailto:privacy@remishowmanager.co.uk">
              privacy@remishowmanager.co.uk
            </a>
            . We will respond within one month.
          </p>
          <p className="mt-2">
            You can also complain to the UK Information Commissioner&rsquo;s
            Office at{' '}
            <a className="text-primary hover:underline" href="https://ico.org.uk" target="_blank" rel="noreferrer noopener">
              ico.org.uk
            </a>
            . We&rsquo;d appreciate the chance to resolve any concern first.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">8. Security</h2>
          <p className="mt-2">
            We protect your data with HTTPS/TLS in transit, encryption at
            rest, hashed passwords, role-based access controls, and restricted
            access to production systems. No system is perfect &mdash; if you
            suspect a security issue, email{' '}
            <a className="text-primary hover:underline" href="mailto:privacy@remishowmanager.co.uk">
              privacy@remishowmanager.co.uk
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">9. Cookies</h2>
          <p className="mt-2">
            We use a small number of essential cookies to keep you signed in,
            remember your active organisation, and protect forms against CSRF.
            We do not use advertising or cross-site tracking cookies.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">10. Children</h2>
          <p className="mt-2">
            Remi is not intended for under-16s. Junior Handler entries are
            submitted by a parent or guardian&rsquo;s Remi account on behalf
            of the young handler. If you believe we are holding data about an
            under-16 who has their own account, contact us and we will remove
            it.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">11. Changes to this policy</h2>
          <p className="mt-2">
            If we make material changes we&rsquo;ll notify active users by
            email or on sign-in. The &ldquo;Last updated&rdquo; date at the
            top reflects the current version.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">12. Contact</h2>
          <p className="mt-2">
            Data protection queries:{' '}
            <a className="text-primary hover:underline" href="mailto:privacy@remishowmanager.co.uk">
              privacy@remishowmanager.co.uk
            </a>
            <br />
            General queries:{' '}
            <a className="text-primary hover:underline" href="mailto:hello@remishowmanager.co.uk">
              hello@remishowmanager.co.uk
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
