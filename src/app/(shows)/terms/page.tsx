export const metadata = {
  title: 'Terms of Service - Remi',
  description: 'Terms and conditions for using Remi.',
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12 sm:px-6">
      <h1 className="font-serif text-3xl font-extrabold tracking-tight sm:text-4xl">
        Terms of Service
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated: 28 April 2026
      </p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="text-lg font-semibold text-foreground">1. About Remi</h2>
          <p className="mt-2">
            Remi is an online platform for UK Royal Kennel Club (RKC) dog show
            entry management.
          </p>
          <p className="mt-2">
            Remi is a trading name of{' '}
            <strong className="text-foreground">
              Michael James and Amanda McAteer
            </strong>
            , a partnership trading from William House, Mobbs Way,
            Lowestoft, NR32 3AL, United Kingdom. General contact:{' '}
            <a
              className="text-primary hover:underline"
              href="mailto:hello@remishowmanager.co.uk"
            >
              hello@remishowmanager.co.uk
            </a>
            .
          </p>
          <p className="mt-2">
            These terms form a legally binding agreement between you and Remi
            when you use the Remi website, apps, or services (together, the
            &ldquo;Service&rdquo;).
          </p>
          <p className="mt-2">
            Different sections apply depending on how you use Remi: Sections
            4&ndash;6 apply if you enter shows as an exhibitor. Section 7 applies
            if you run shows for a show society or club.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">2. Your account</h2>
          <p className="mt-2">
            You must be at least 16 years old to hold a Remi account. You are
            responsible for keeping your login details secure and for anything
            done through your account. Provide accurate information about
            yourself and your dogs &mdash; misleading information may cause
            entries to be rejected by show societies and breaches Section 8.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">3. The service</h2>
          <p className="mt-2">
            Remi provides tools for exhibitors to browse and enter dog shows,
            and for show societies to manage entries, schedules, catalogues, and
            results. We aim for the Service to be available at all times but
            do not guarantee uninterrupted access.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            4. Entering shows &mdash; how payments work
          </h2>
          <p className="mt-2">
            When you enter a show through Remi, you pay Remi directly. Remi is
            the merchant of record for your payment. We collect the entry fees
            on behalf of the show society and pass the net amount on to them
            after entries close, less any platform fees shown at checkout.
          </p>
          <p className="mt-2">
            Payments are processed by{' '}
            <strong className="text-foreground">
              Stripe Payments UK, Ltd.
            </strong>
            , regulated by the Financial Conduct Authority. Your card details
            are handled by Stripe and are never seen or stored by Remi. By
            submitting an entry you authorise Remi (via Stripe) to charge
            the card or payment method you provide for the total shown at
            checkout.
          </p>
          <p className="mt-2">
            Once card payments clear, Remi receives the funds and holds
            them on the host show society&rsquo;s behalf pending payout.
          </p>
          <p className="mt-2">
            <strong className="text-foreground">
              We pay the net entry fees to the host show society by BACS
              within 21 days of the close-of-entries date for the show.
            </strong>{' '}
            Remi&rsquo;s platform fee is deducted from the total collected
            for the show. The secretary dashboard shows the running net
            payout to the club at all times &mdash; updated as each entry
            comes in &mdash; alongside the exact target payout date, so
            there are no surprises.
          </p>
          <p className="mt-2">
            Your contract for the entry itself &mdash; eligibility, judging,
            conduct of the show, prizes &mdash; is with the show society. Remi
            is not the show organiser and is not responsible for how the show
            is run.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">5. Fees</h2>
          <p className="mt-2">
            A platform fee of &pound;1.00 plus 1% of the entry total is added
            at checkout and paid by you, the exhibitor. The fee covers payment
            processing and use of the Service. The breakdown is shown before
            you confirm payment.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">6. Refunds, cancellations and chargebacks</h2>
          <p className="mt-2">
            <strong className="text-foreground">
              Whether to grant a refund is at the show society&rsquo;s
              discretion.
            </strong>{' '}
            The general convention across RKC shows is that entries are not
            refundable once the closing date has passed; some societies are
            more flexible than others. If you want a refund (full or
            partial), contact the show secretary first. If they authorise
            it, Remi processes the refund through Stripe back to the
            original payment method.
          </p>
          <p className="mt-2">
            If a show is cancelled by the society, Remi will work with the
            secretary to deliver the desired outcome &mdash; whether that
            is refunding affected entries, deferring them to a later show,
            or another agreed resolution.
          </p>
          <p className="mt-2">
            If you raise a chargeback with your card issuer, Remi (as
            merchant of record) handles the dispute. If the chargeback is
            found to be without basis, you may be liable for the disputed
            amount plus any dispute fees Remi incurs.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            7. Show societies using Remi
          </h2>
          <p className="mt-2">
            If you manage a show society, club, or organisation on Remi, the
            following also applies:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              You must provide accurate show information (dates, venue,
              classes, judges, fees) and keep it up to date.
            </li>
            <li>
              You must provide accurate UK bank account details for payout.
              Remi transfers the net collected entry fees to that account by
              BACS within 21 days of the close-of-entries date for the show.
            </li>
            <li>
              You are the data controller for entry data relating to your
              show. Remi processes that data on your behalf. See the{' '}
              <a className="text-primary hover:underline" href="/privacy">
                Privacy Policy
              </a>{' '}
              for details.
            </li>
            <li>
              You are responsible for compliance with RKC rules, show
              licensing, and all laws applying to running a dog show.
            </li>
            <li>
              You must not instruct Remi to pay any person or bank account
              other than your own society&rsquo;s registered account.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">8. Acceptable use</h2>
          <p className="mt-2">You must not:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>submit fraudulent entries or false information about dogs</li>
            <li>attempt to interfere with the Service, access other users&rsquo; accounts, or scrape data at scale</li>
            <li>use the Service to send unsolicited marketing</li>
            <li>re-use exhibitor contact details provided through the Service for any purpose other than running the show</li>
          </ul>
          <p className="mt-2">
            We may suspend or close accounts that breach these terms, and
            report serious misuse to the RKC or law enforcement.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">9. Intellectual property</h2>
          <p className="mt-2">
            Remi&rsquo;s branding, software, and site content are ours. You
            keep the rights to content you upload (logos, photos, show
            documents) and grant Remi a licence to host and display that
            content as needed to run the Service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">10. Limitation of liability</h2>
          <p className="mt-2">
            Nothing in these terms limits liability for death, personal injury
            caused by negligence, fraud, or anything else that cannot be
            limited in law.
          </p>
          <p className="mt-2">
            Subject to that, Remi&rsquo;s total liability to you in connection
            with the Service in any 12-month period is limited to the greater
            of (a) the platform fees you paid to Remi in that period, or (b)
            &pound;100.
          </p>
          <p className="mt-2">
            We are not liable for: show cancellation or changes by the
            society; disputes between exhibitors and societies; indirect or
            consequential losses; loss of profit, revenue, or reputation; or
            anything outside our reasonable control.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">11. Suspension and termination</h2>
          <p className="mt-2">
            You can close your account at any time from your account settings.
            We may suspend or close an account in response to a breach of
            these terms, a chargeback dispute, or a regulatory requirement.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">12. Changes to these terms</h2>
          <p className="mt-2">
            We may update these terms from time to time. Material changes will
            be notified by email to affected users or on your next sign-in.
            The &ldquo;Last updated&rdquo; date above always reflects the
            current version.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">13. Governing law</h2>
          <p className="mt-2">
            These terms are governed by the laws of England and Wales.
          </p>
          <p className="mt-2">
            If you are a consumer resident in Scotland or Northern Ireland,
            you may bring court proceedings about these terms in either the
            courts of England and Wales or the courts of the part of the
            United Kingdom where you live. Business users may only bring
            proceedings in the courts of England and Wales.
          </p>
          <p className="mt-2">
            Nothing in this section affects the statutory consumer rights you
            have under the law of your country of residence.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">14. Contact</h2>
          <p className="mt-2">
            Questions about these terms:{' '}
            <a
              href="mailto:hello@remishowmanager.co.uk"
              className="text-primary hover:underline"
            >
              hello@remishowmanager.co.uk
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
