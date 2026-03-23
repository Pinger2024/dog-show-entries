'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { differenceInYears, differenceInMonths, parseISO } from 'date-fns';
import {
  Dog,
  Plus,
  Eye,
  Pencil,
  Ticket,
  Loader2,
  Search,
  Globe,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader, PageTitle, PageDescription, PageActions } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';

function formatAge(dateOfBirth: string): string {
  const dob = parseISO(dateOfBirth);
  const now = new Date();
  const years = differenceInYears(now, dob);
  if (years >= 1) {
    return `${years} year${years !== 1 ? 's' : ''} old`;
  }
  const months = differenceInMonths(now, dob);
  if (months < 1) return 'Under 1 month';
  return `${months} month${months !== 1 ? 's' : ''} old`;
}

function DogAvatar({ dogId }: { dogId: string }) {
  const { data: photos } = trpc.dogs.listPhotos.useQuery({ dogId });
  const primaryPhoto = photos?.find((p) => p.isPrimary);
  if (primaryPhoto) {
    return (
      <div className="relative size-10 shrink-0 overflow-hidden rounded-full border border-primary/20">
        <Image
          src={primaryPhoto.url}
          alt=""
          fill
          className="object-cover"
          sizes="40px"
        />
      </div>
    );
  }
  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
      <Dog className="size-5 text-primary" />
    </div>
  );
}

export default function DogsPage() {
  const [search, setSearch] = useState('');
  const { data: dogs, isLoading } = trpc.dogs.list.useQuery();
  const { data: entriesData } = trpc.entries.list.useQuery({
    limit: 100,
    cursor: 0,
  });

  // Count entries per dog
  const entryCountByDog = new Map<string, number>();
  for (const entry of entriesData?.items ?? []) {
    if (!entry.dogId) continue;
    const count = entryCountByDog.get(entry.dogId) ?? 0;
    entryCountByDog.set(entry.dogId, count + 1);
  }

  const filteredDogs = dogs?.filter((dog) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      dog.registeredName.toLowerCase().includes(q) ||
      dog.breed?.name?.toLowerCase().includes(q) ||
      dog.kcRegNumber?.toLowerCase().includes(q)
    );
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      {/* Header */}
      <PageHeader>
        <div>
          <PageTitle>My Dogs</PageTitle>
          <PageDescription>
            {dogs?.length ?? 0} dog{(dogs?.length ?? 0) !== 1 ? 's' : ''} registered
          </PageDescription>
        </div>
        <PageActions>
          <Button className="h-12 px-6 text-[0.9375rem]" asChild>
            <Link href="/dogs/new">
              <Plus className="size-4" />
              Add Dog
            </Link>
          </Button>
        </PageActions>
      </PageHeader>

      {/* Content */}
      {!dogs || dogs.length === 0 ? (
        /* Empty state */
        <EmptyState
          icon={Dog}
          title="No dogs yet"
          description="Add your first dog to start entering shows. You'll need their Royal Kennel Club registration details."
          variant="card"
          action={
            <Button size="lg" asChild>
              <Link href="/dogs/new">
                <Plus className="size-4" />
                Add Your First Dog
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          {/* Search */}
          {dogs.length > 1 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                placeholder="Search by name, breed, or RKC number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-12 pl-10 text-[0.9375rem]"
              />
            </div>
          )}

          {/* Dog cards grid */}
          {filteredDogs && filteredDogs.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredDogs.map((dog) => {
                const entryCount = entryCountByDog.get(dog.id) ?? 0;
                return (
                  <Card
                    key={dog.id}
                    className="transition-all hover:border-primary/20 hover:shadow-md hover:shadow-primary/5"
                  >
                    <CardHeader className="p-3 pb-2 sm:p-4 sm:pb-3 lg:p-6 lg:pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <CardTitle className="truncate text-base sm:text-lg">
                            {dog.registeredName}
                          </CardTitle>
                          <CardDescription className="mt-0.5">
                            {dog.breed?.name ?? 'Unknown breed'}
                          </CardDescription>
                        </div>
                        <DogAvatar dogId={dog.id} />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 p-3 pt-0 sm:p-4 sm:pt-0 lg:p-6 lg:pt-0">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">
                          {dog.sex === 'dog' ? 'Dog' : 'Bitch'}
                        </Badge>
                        {dog.dateOfBirth && (
                          <Badge variant="outline">
                            {formatAge(dog.dateOfBirth)}
                          </Badge>
                        )}
                        {entryCount > 0 && (
                          <Badge variant="outline" className="text-primary">
                            <Ticket className="mr-1 size-3" />
                            {entryCount} entr{entryCount !== 1 ? 'ies' : 'y'}
                          </Badge>
                        )}
                      </div>
                      {dog.kcRegNumber && (
                        <p className="text-xs text-muted-foreground">
                          RKC Reg: {dog.kcRegNumber}
                        </p>
                      )}

                      {/* Actions */}
                      <div className="flex flex-wrap gap-1.5 sm:gap-2 pt-1">
                        <Button variant="outline" size="sm" className="min-h-[2.75rem] sm:min-h-0" asChild>
                          <Link href={`/dogs/${dog.id}`}>
                            <Eye className="size-3.5" />
                            View
                          </Link>
                        </Button>
                        <Button variant="outline" size="sm" className="min-h-[2.75rem] sm:min-h-0" asChild>
                          <Link href={`/dogs/${dog.id}/edit`}>
                            <Pencil className="size-3.5" />
                            Edit
                          </Link>
                        </Button>
                        <Button variant="outline" size="sm" className="min-h-[2.75rem] sm:min-h-0" asChild>
                          <Link href="/shows">
                            <Ticket className="size-3.5" />
                            Enter
                          </Link>
                        </Button>
                        <Button variant="outline" size="sm" className="min-h-[2.75rem] sm:min-h-0" asChild>
                          <Link href={`/dog/${dog.id}`}>
                            <Globe className="size-3.5" />
                            Profile
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={Dog}
              title={`No dogs match "${search}"`}
              description="Try a different search term"

            />
          )}
        </>
      )}
    </div>
  );
}
