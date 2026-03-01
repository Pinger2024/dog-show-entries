export const metadata = {
  title: 'Privacy Policy - Remi',
  description: 'How Remi handles your personal data.',
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated: February 2026
      </p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="text-lg font-semibold text-foreground">
            1. Information We Collect
          </h2>
          <p className="mt-2">
            When you use Remi, we collect information you provide directly:
            your name, email address, and details about your dogs (registered
            names, breed, KC registration numbers). We also collect show entry
            information when you enter shows through our platform.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            2. How We Use Your Information
          </h2>
          <p className="mt-2">We use your information to:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Process your show entries and manage your account</li>
            <li>Share entry details with show secretaries for the shows you enter</li>
            <li>Send you confirmations and updates about your entries</li>
            <li>Improve our service</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            3. Data Sharing
          </h2>
          <p className="mt-2">
            We share your entry information with show societies for the
            purposes of administering the shows you enter. We use Stripe to
            process payments — your payment details are handled directly by
            Stripe and we never store your card information.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            4. Data Security
          </h2>
          <p className="mt-2">
            We use industry-standard security measures to protect your data,
            including encryption in transit and at rest. Access to personal
            data is restricted to authorised personnel only.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            5. Your Rights
          </h2>
          <p className="mt-2">
            Under UK GDPR, you have the right to access, correct, or delete
            your personal data. You can manage most of your data directly
            through your Remi account. For any data requests, contact us at{' '}
            <a
              href="mailto:privacy@remishow.co.uk"
              className="text-primary hover:underline"
            >
              privacy@remishow.co.uk
            </a>
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            6. Cookies
          </h2>
          <p className="mt-2">
            We use essential cookies to keep you signed in and remember your
            preferences. We do not use advertising or tracking cookies.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">
            7. Contact Us
          </h2>
          <p className="mt-2">
            If you have questions about this privacy policy, contact us at{' '}
            <a
              href="mailto:privacy@remishow.co.uk"
              className="text-primary hover:underline"
            >
              privacy@remishow.co.uk
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
