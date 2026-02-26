'use client';

import { use } from 'react';
import Link from 'next/link';
import { ChevronLeft, Dog, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { DogForm } from '@/components/dogs/dog-form';

export default function EditDogPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: dog, isLoading } = trpc.dogs.getById.useQuery({ id });

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
        <Button variant="ghost" size="sm" className="mb-2" asChild>
          <Link href={`/dogs/${id}`}>
            <ChevronLeft className="size-4" />
            Back to {dog.registeredName}
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Edit Dog
        </h1>
        <p className="mt-1 text-muted-foreground">
          Update the details for {dog.registeredName}.
        </p>
      </div>

      <div className="max-w-2xl">
        <DogForm
          mode="edit"
          dogId={id}
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
          }}
        />
      </div>
    </div>
  );
}
