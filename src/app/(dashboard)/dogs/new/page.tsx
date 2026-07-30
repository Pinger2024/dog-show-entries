'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { DogForm } from '@/components/dogs/dog-form';

export default function NewDogPage() {
  // If the exhibitor came here from a show entry to register a dog, send them
  // straight back to that show afterwards and (for regionals) flip the
  // SV/breeder labels to "Required" (Mandy 2026-07-02). Read the query param
  // client-side — the codebase's pattern, avoiding a Suspense boundary.
  const [returnTo, setReturnTo] = useState<string | null>(null);
  useEffect(() => {
    const rt = new URLSearchParams(window.location.search).get('returnTo');
    setReturnTo(rt && rt.startsWith('/shows/') ? rt : null);
  }, []);
  const returnShowId = returnTo?.match(/\/shows\/([^/]+)\/enter/)?.[1] ?? null;
  const { data: returnShow } = trpc.shows.getById.useQuery(
    { id: returnShowId! },
    { enabled: !!returnShowId },
  );
  const regionalRequired = returnShow?.showRuleset === 'wusv';

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" className="mb-2" asChild>
          <Link href={returnTo ?? '/dogs'}>
            <ChevronLeft className="size-4" />
            {returnTo ? `Back to ${returnShow?.name ?? 'your entry'}` : 'Back to My Dogs'}
          </Link>
        </Button>
        <h1 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">
          Add a Dog
        </h1>
        <p className="mt-1 text-muted-foreground">
          {returnTo
            ? `Register your dog below and save — we'll take you straight back to your entry${returnShow?.name ? ` for ${returnShow.name}` : ''}.`
            : 'Register a new dog to your profile. You can enter shows once your dog is added.'}
        </p>
      </div>

      <div className="max-w-2xl">
        <DogForm
          mode="create"
          returnTo={returnTo ?? undefined}
          regionalRequired={regionalRequired}
        />
      </div>
    </div>
  );
}
