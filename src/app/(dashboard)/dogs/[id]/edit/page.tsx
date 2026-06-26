'use client';

import { use, useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, Dog, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { DogForm } from '@/components/dogs/dog-form';
import { DogSvHealthCard } from '@/components/dogs/dog-sv-health-card';

export default function EditDogPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: dog, isLoading } = trpc.dogs.getById.useQuery({ id });

  // If the exhibitor came here from an entry to fill in mandatory info, send
  // them straight back to that show afterwards (Mandy 2026-06-26). Read the
  // query param client-side — the codebase's pattern, avoiding a Suspense
  // boundary for useSearchParams.
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!dog) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Dog className="mb-4 size-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Dog not found</h2>
        <p className="mt-1 text-muted-foreground">
          This dog doesn&apos;t exist or you don&apos;t have access.
        </p>
        <Button className="mt-4" asChild>
          <Link href="/dogs">Back to My Dogs</Link>
        </Button>
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
            <Link href={`/dogs/${id}`}>
              <ChevronLeft className="size-4" />
              Back to {dog.registeredName}
            </Link>
          </Button>
        )}
        <h1 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">
          Edit Dog
        </h1>
        <p className="mt-1 text-muted-foreground">
          {returnTo
            ? `Fill in the details below and save — we'll take you straight back to your entry${returnShow?.name ? ` for ${returnShow.name}` : ''}.`
            : `Update the details for ${dog.registeredName}.`}
        </p>
      </div>

      <div className="max-w-2xl space-y-6">
        <DogForm
          mode="edit"
          dogId={id}
          returnTo={returnTo ?? undefined}
          svSection={
            /german\s+shepherd/i.test(dog.breed?.name ?? '') ? (
              <DogSvHealthCard dogId={id} isOwner={true} sex={dog.sex} />
            ) : null
          }
          defaultValues={{
            registeredName: dog.registeredName,
            kcRegNumber: dog.kcRegNumber ?? '',
            breedId: dog.breedId,
            sex: dog.sex,
            dateOfBirth: dog.dateOfBirth,
            colour: dog.colour ?? '',
            sireName: dog.sireName ?? '',
            damName: dog.damName ?? '',
            breederName: dog.breederName ?? '',
            breederCountry: (dog as { breederCountry?: string | null }).breederCountry ?? '',
            breederCity: (dog as { breederCity?: string | null }).breederCity ?? '',
            breederPostcode: (dog as { breederPostcode?: string | null }).breederPostcode ?? '',
            registrationBody: dog.registrationBody ?? undefined,
            registrationBodyOther: dog.registrationBodyOther ?? '',
            coatType: dog.coatType ?? undefined,
            microchipNumber: dog.microchipNumber ?? '',
            sireRegistrationBody: dog.sireRegistrationBody ?? undefined,
            sireRegistrationNumber: dog.sireRegistrationNumber ?? '',
            damRegistrationBody: dog.damRegistrationBody ?? undefined,
            damRegistrationNumber: dog.damRegistrationNumber ?? '',
          }}
        />
      </div>
    </div>
  );
}
