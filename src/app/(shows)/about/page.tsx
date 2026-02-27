import { Dog, Users, Shield, Heart } from 'lucide-react';

export const metadata = {
  title: 'About Remi',
  description: 'The modern dog show entry platform built for the UK show community.',
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
        About Remi
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
        Remi is a modern dog show entry platform built to make life easier for
        exhibitors, show secretaries, and the entire UK dog show community.
      </p>

      <div className="mt-12 grid gap-8 sm:grid-cols-2">
        <div className="flex gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Dog className="size-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">For Exhibitors</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Browse upcoming shows, enter online in minutes, and manage all
              your dogs and entries in one place.
            </p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Users className="size-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">For Show Secretaries</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Set up shows, manage entries, assign rings and judges, and
              generate catalogues — all from one dashboard.
            </p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Shield className="size-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">Secure Payments</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Entry fees are handled securely through Stripe, with funds going
              directly to the show society.
            </p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Heart className="size-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">Community First</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Built with input from exhibitors and secretaries to solve real
              problems in the dog show world.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-12 rounded-lg border bg-muted/30 p-6">
        <h2 className="font-semibold">Get in Touch</h2>
        <p className="mt-2 text-sm text-muted-foreground">
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
