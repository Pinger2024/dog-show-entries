'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { DogForm } from '@/components/dogs/dog-form';

export default function NewDogPage() {
  // If the exhibitor came here from an entry ("+ Add a new dog"), send them
  // straight back to that show afterwards, and — for SV/WUSV regional shows —
  // pre-select the SV registration body so the form asks for the right details
  // (Mandy 2026-07-07). Read the query param client-side (the codebase pattern).
  const [returnTo, setReturnTo] = useState<string | null>(null);
  useEffect(() => {
    const rt = new URLSearchParams(window.location.search).get('returnTo');
    setReturnTo(rt && rt.startsWith('/shows/') ? rt : null);
  }, []);
  const returnShowId = returnTo?.match(/\/shows\/([^/]+)\/enter/)?.[1] ?? null;
  const { data: returnShow, isLoading: returnShowLoading } = trpc.shows.getById.useQuery(
    { id: returnShowId! },
    { enabled: !!returnShowId },
  );
  const isRegional = returnShow?.showRuleset === 'wusv';

  // When we came from an entry we need the show to resolve before rendering the
  // form, so the SV default is present at form initialisation.
  if (returnShowId && returnShowLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      {/* Header */}
      <div>
        {returnTo ? (
          <Button variant="outline" size="sm" className="mb-2" asChild>
            <Link href={returnTo}>
              <ChevronLeft className="size-4" />
              Back to {returnShow?.name ?? 'your entry'}
            </Link>
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="mb-2" asChild>
            <Link href="/dogs">
              <ChevronLeft className="size-4" />
              Back to My Dogs
            </Link>
          </Button>
        )}
        <h1 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">
          Add a Dog
        </h1>
        <p className="mt-1 text-muted-foreground">
          {returnTo
            ? `Add your dog's details below and save — we'll take you straight back to your entry${returnShow?.name ? ` for ${returnShow.name}` : ''}.`
            : 'Register a new dog to your profile. You can enter shows once your dog is added.'}
        </p>
      </div>

      <div className="max-w-2xl">
        <DogForm
          mode="create"
          returnTo={returnTo ?? undefined}
          defaultValues={isRegional ? { registrationBody: 'sv' } : undefined}
        />
      </div>
    </div>
  );
}
