'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format, parseISO, differenceInYears, differenceInMonths } from 'date-fns';
import {
  ChevronLeft,
  Pencil,
  Trash2,
  Ticket,
  Dog,
  Trophy,
  Loader2,
  CalendarDays,
  MapPin,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

function formatAge(dateOfBirth: string): string {
  const dob = parseISO(dateOfBirth);
  const now = new Date();
  const years = differenceInYears(now, dob);
  if (years >= 1) {
    const months = differenceInMonths(now, dob) % 12;
    if (months > 0) {
      return `${years} year${years !== 1 ? 's' : ''}, ${months} month${months !== 1 ? 's' : ''}`;
    }
    return `${years} year${years !== 1 ? 's' : ''}`;
  }
  const months = differenceInMonths(now, dob);
  return `${months} month${months !== 1 ? 's' : ''}`;
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <span className="text-sm font-medium text-muted-foreground sm:w-40 sm:shrink-0">
        {label}
      </span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

const entryStatusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-emerald-100 text-emerald-800',
  withdrawn: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-700',
};

function EntryHistoryCard({ dogId }: { dogId: string }) {
  const { data, isLoading } = trpc.entries.list.useQuery({
    dogId,
    limit: 20,
    cursor: 0,
  });

  const entries = data?.items ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Entry History</CardTitle>
        <CardDescription>Shows this dog has been entered in.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8 text-center">
            <Ticket className="mb-3 size-8 text-muted-foreground/50" />
            <p className="font-medium">No entries yet</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Enter a show to start building your dog&apos;s show record.
            </p>
            <Button className="mt-4" size="sm" variant="outline" asChild>
              <Link href="/shows">Browse Shows</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <Link
                key={entry.id}
                href={`/entries/${entry.id}`}
                className="block rounded-lg border p-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{entry.show.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="size-3" />
                        {format(parseISO(entry.show.startDate), 'd MMM yyyy')}
                      </span>
                      {entry.show.venue && (
                        <span className="flex items-center gap-1">
                          <MapPin className="size-3" />
                          {entry.show.venue.name}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {entry.entryClasses.length} class
                      {entry.entryClasses.length !== 1 ? 'es' : ''} · £
                      {(entry.totalFee / 100).toFixed(2)}
                    </p>
                  </div>
                  <Badge
                    className={
                      entryStatusColors[entry.status] ??
                      'bg-gray-100 text-gray-600'
                    }
                  >
                    {entry.status}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DogDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: dog, isLoading } = trpc.dogs.getById.useQuery({ id });
  const utils = trpc.useUtils();

  const deleteDog = trpc.dogs.delete.useMutation({
    onSuccess: () => {
      utils.dogs.list.invalidate();
      toast.success('Dog removed', {
        description: 'The dog has been removed from your profile.',
      });
      router.push('/dogs');
    },
    onError: (error) => {
      toast.error('Something went wrong', {
        description: error.message,
      });
    },
  });

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
          <Link href="/dogs">
            <ChevronLeft className="size-4" />
            Back to My Dogs
          </Link>
        </Button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Dog className="size-7 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {dog.registeredName}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">
                  {dog.breed?.name}
                </span>
                <Badge variant="secondary">
                  {dog.sex === 'dog' ? 'Dog' : 'Bitch'}
                </Badge>
                {dog.dateOfBirth && (
                  <Badge variant="outline">{formatAge(dog.dateOfBirth)}</Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button asChild>
              <Link href="/shows">
                <Ticket className="size-4" />
                Enter a Show
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/dogs/${id}/edit`}>
                <Pencil className="size-4" />
                Edit
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Details cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Registration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Registration Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Registered Name" value={dog.registeredName} />
            <DetailRow
              label="KC Reg Number"
              value={dog.kcRegNumber ?? 'Not registered'}
            />
          </CardContent>
        </Card>

        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Breed" value={dog.breed?.name} />
            <DetailRow
              label="Group"
              value={dog.breed?.group?.name}
            />
            <DetailRow
              label="Sex"
              value={dog.sex === 'dog' ? 'Dog' : 'Bitch'}
            />
            <DetailRow
              label="Date of Birth"
              value={
                dog.dateOfBirth
                  ? format(parseISO(dog.dateOfBirth), 'dd MMMM yyyy')
                  : undefined
              }
            />
            <DetailRow label="Colour" value={dog.colour} />
          </CardContent>
        </Card>

        {/* Pedigree */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pedigree</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Sire (Father)" value={dog.sireName ?? 'Not recorded'} />
            <DetailRow label="Dam (Mother)" value={dog.damName ?? 'Not recorded'} />
            <DetailRow label="Breeder" value={dog.breederName ?? 'Not recorded'} />
          </CardContent>
        </Card>

        {/* Entry History */}
        <EntryHistoryCard dogId={id} />
      </div>

      {/* Achievements */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Achievements</CardTitle>
          <CardDescription>
            Track your dog&apos;s career as you enter shows.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8 text-center">
            <Trophy className="mb-3 size-8 text-muted-foreground/50" />
            <p className="font-medium">No achievements yet</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Achievements will appear here as your dog competes and earns
              placements at shows.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Separator />
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Remove Dog</p>
          <p className="text-sm text-muted-foreground">
            Remove this dog from your profile. This cannot be undone.
          </p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="destructive" size="sm">
              <Trash2 className="size-4" />
              Remove
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove {dog.registeredName}?</DialogTitle>
              <DialogDescription>
                This will remove the dog from your profile. Any existing show
                entries will not be affected, but you won&apos;t be able to
                create new entries for this dog.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-3 pt-4">
              <Button
                variant="destructive"
                disabled={deleteDog.isPending}
                onClick={() => deleteDog.mutate({ id })}
              >
                {deleteDog.isPending && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                Yes, Remove Dog
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
