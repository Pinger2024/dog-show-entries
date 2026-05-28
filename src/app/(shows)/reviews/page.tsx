import Link from 'next/link';
import { Quote, Star, ArrowRight } from 'lucide-react';
import { AnimateIn } from '@/components/animate-in';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Reviews — Remi',
  description:
    'Kind words from exhibitors and secretaries using Remi for online entries, payments, and show management on the UK RKC dog show circuit.',
};

/**
 * Reviews come in from Amanda via Telegram / email. Add new ones here in
 * the order received — newest at the top. First name + role only, per
 * Amanda 2026-05-28 (no surnames, no clubs, no contact details).
 */
const REVIEWS: { quote: string; name: string; role: string }[] = [
  {
    quote:
      'I have just did my first entry through Remi — that’s just fantastic, so easy and quick. Amazing work 😀',
    name: 'Hammad',
    role: 'GSD exhibitor',
  },
];

export default function ReviewsPage() {
  return (
    <main className="bg-background">
      {/* Hero */}
      <section className="border-b bg-gradient-to-b from-primary/5 to-transparent">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-24 lg:px-8">
          <AnimateIn>
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Quote className="size-7" strokeWidth={1.5} />
            </div>
            <h1 className="mt-6 font-serif text-3xl font-bold tracking-tight sm:text-5xl">
              What people are saying
            </h1>
            <p className="mt-4 text-base text-muted-foreground sm:text-lg">
              Real messages from exhibitors and secretaries using Remi day to day.
              No paid testimonials, no marketing fluff — just what landed in our inbox.
            </p>
          </AnimateIn>
        </div>
      </section>

      {/* Reviews list */}
      <section>
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <ul className="space-y-6">
            {REVIEWS.map((r, i) => (
              <AnimateIn key={`${r.name}-${i}`} delay={i * 80}>
                <li className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
                  <div className="flex items-center gap-1 text-amber-500">
                    {Array.from({ length: 5 }).map((_, idx) => (
                      <Star key={idx} className="size-4 fill-current" strokeWidth={0} />
                    ))}
                  </div>
                  <blockquote className="mt-4 font-serif text-lg leading-relaxed text-foreground sm:text-xl">
                    &ldquo;{r.quote}&rdquo;
                  </blockquote>
                  <figcaption className="mt-5 flex items-baseline gap-2 text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{r.name}</span>
                    <span>&middot;</span>
                    <span>{r.role}</span>
                  </figcaption>
                </li>
              </AnimateIn>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t bg-card">
        <div className="mx-auto max-w-3xl px-4 py-12 text-center sm:px-6 sm:py-16 lg:px-8">
          <AnimateIn>
            <h2 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">
              See for yourself
            </h2>
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">
              Browse upcoming shows and enter from your phone in under a minute.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="min-h-[2.75rem]">
                <Link href="/shows">
                  Browse Shows
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="min-h-[2.75rem]">
                <Link href="/for-secretaries">For show secretaries</Link>
              </Button>
            </div>
          </AnimateIn>
        </div>
      </section>
    </main>
  );
}
