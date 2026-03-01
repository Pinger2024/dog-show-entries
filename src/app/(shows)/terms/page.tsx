export const metadata = {
  title: 'Terms of Service - Remi',
  description: 'Terms and conditions for using Remi.',
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
        Terms of Service
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated: February 2026
      </p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="text-lg font-semibold text-foreground">
            1. About Remi
          </h2>
          <p className="mt-2">
            Remi is an online platform that facilitates dog show entries in the
            United Kingdom. We connect exhibitors with show societies, making
            it easy to browse, enter, and manage show entries online.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            2. Your Account
          </h2>
          <p className="mt-2">
            You are responsible for maintaining the security of your account
            and for all activities that occur under your account. You must
            provide accurate information about yourself and your dogs when
            creating entries.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            3. Show Entries
          </h2>
          <p className="mt-2">
            When you submit a show entry through Remi, you are entering into
            an agreement with the show society. Remi acts as an intermediary
            to process your entry and payment. Entry rules, eligibility, and
            refund policies are set by each individual show society.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            4. Payments
          </h2>
          <p className="mt-2">
            Entry fees are processed through Stripe. By submitting an entry,
            you authorise the charge for the applicable entry fees. Refunds
            are subject to the individual show society&apos;s refund policy.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            5. Show Society Responsibilities
          </h2>
          <p className="mt-2">
            Show societies using Remi are responsible for the accuracy of
            their show information, including dates, classes, venues, and
            entry fees. Remi is not responsible for changes or cancellations
            made by show societies.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            6. Acceptable Use
          </h2>
          <p className="mt-2">
            You agree not to misuse the platform, submit fraudulent entries,
            or provide false information about your dogs. We reserve the right
            to suspend accounts that violate these terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            7. Limitation of Liability
          </h2>
          <p className="mt-2">
            Remi provides the platform &ldquo;as is&rdquo;. We are not liable
            for show cancellations, changes, or disputes between exhibitors
            and show societies. Our liability is limited to the fees paid to
            Remi for the service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            8. Changes to Terms
          </h2>
          <p className="mt-2">
            We may update these terms from time to time. Continued use of
            Remi after changes are posted constitutes acceptance of the
            updated terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            9. Contact
          </h2>
          <p className="mt-2">
            For questions about these terms, contact us at{' '}
            <a
              href="mailto:hello@remishow.co.uk"
              className="text-primary hover:underline"
            >
              hello@remishow.co.uk
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
