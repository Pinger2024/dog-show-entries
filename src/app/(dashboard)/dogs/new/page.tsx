'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DogForm } from '@/components/dogs/dog-form';

export default function NewDogPage() {
  return (
    <div className="space-y-6 pb-16 md:pb-0">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" className="mb-2" asChild>
          <Link href="/dogs">
            <ChevronLeft className="size-4" />
            Back to My Dogs
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Add a Dog
        </h1>
        <p className="mt-1 text-muted-foreground">
          Register a new dog to your profile. You can enter shows once your dog
          is added.
        </p>
      </div>

      <div className="max-w-2xl">
        <DogForm mode="create" />
      </div>
    </div>
  );
}
