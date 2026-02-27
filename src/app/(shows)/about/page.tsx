import { Dog, Users, Shield, Heart } from 'lucide-react';

export const metadata = {
  title: 'About Remi',
  description: 'The trusted platform for entering KC-licensed dog shows, built for exhibitors and show secretaries.',
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="gold-rule font-serif text-3xl font-bold tracking-tight sm:text-4xl">
        About Remi
      </h1>
      <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
        Remi is a trusted platform for entering KC-licensed dog shows, built to
        make life easier for exhibitors, show secretaries, and the entire UK
        dog show community. We understand the show ring because we&apos;re part
        of it.
      </p>

      <div className="mt-14 grid gap-10 sm:grid-cols-2">
        <div className="flex gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Dog className="size-6 text-primary" />
          </div>
          <div>
            <h3 className="font-serif text-lg font-bold">For Exhibitors</h3>
            <p className="mt-2 leading-relaxed text-muted-foreground">
              Browse upcoming shows, enter online in minutes, and manage all
              your dogs and entries in one place. No more posting paper forms.
            </p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Users className="size-6 text-primary" />
          </div>
          <div>
            <h3 className="font-serif text-lg font-bold">For Show Secretaries</h3>
            <p className="mt-2 leading-relaxed text-muted-foreground">
              Set up shows, manage entries, assign catalogue numbers, and
              generate catalogues — all from one dashboard. Hours of work,
              done in minutes.
            </p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Shield className="size-6 text-primary" />
          </div>
          <div>
            <h3 className="font-serif text-lg font-bold">Secure Payments</h3>
            <p className="mt-2 leading-relaxed text-muted-foreground">
              Entry fees are handled securely through Stripe. Your payment is
              protected, and you&apos;ll receive an instant confirmation email.
            </p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Heart className="size-6 text-primary" />
          </div>
          <div>
            <h3 className="font-serif text-lg font-bold">Community First</h3>
            <p className="mt-2 leading-relaxed text-muted-foreground">
              Built with input from exhibitors and secretaries to solve real
              problems in the dog show world. Your feedback shapes every
              feature.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-14 rounded-xl border bg-card p-8">
        <h2 className="font-serif text-lg font-bold">Get in Touch</h2>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          We&apos;d love to hear from you. Whether you&apos;re a show
          secretary looking to list your shows, or an exhibitor with
          feedback, reach out at{' '}
          <a
            href="mailto:hello@remishow.co.uk"
            className="text-primary hover:underline"
          >
            hello@remishow.co.uk
          </a>
        </p>
      </div>
    </div>
  );
}
