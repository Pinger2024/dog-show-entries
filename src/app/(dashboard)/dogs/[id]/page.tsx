'use client';

import { use, useRef, useState, useCallback } from 'react';
import Image from 'next/image';
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
  Camera,
  ImagePlus,
  Star,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { formatDogName, getTitleDisplay } from '@/lib/utils';
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

function TitleProgressCard({ dogId }: { dogId: string }) {
  const { data, isLoading } = trpc.dogs.getTitleProgress.useQuery({ dogId });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">KC Title Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="size-4" />
          KC Title Progress
        </CardTitle>
        <CardDescription>
          Track progress toward Kennel Club titles.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats summary */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: 'CCs', value: data.stats.ccs },
            { label: 'Res. CCs', value: data.stats.reserveCCs },
            { label: 'BOBs', value: data.stats.bobs },
            { label: 'JW Points', value: data.stats.jwPoints },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border p-2 text-center">
              <p className="text-lg font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Title progress bars */}
        {data.titleProgress.length > 0 ? (
          <div className="space-y-3">
            {data.titleProgress.map((tp) => (
              <div key={tp.code}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-medium">{tp.title}</span>
                  {tp.milestoneReached && (
                    <Badge className="bg-emerald-100 text-emerald-800 text-xs">
                      Milestone reached
                    </Badge>
                  )}
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.round(tp.progress * 100)}%` }}
                  />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {tp.detail}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {data.existingTitles.length > 0
              ? 'All tracked titles have been achieved!'
              : 'Enter championship shows to start tracking progress toward KC titles.'}
          </p>
        )}

        {/* Disclaimer */}
        <p className="text-xs text-muted-foreground/70 italic">
          {data.disclaimer}
        </p>
      </CardContent>
    </Card>
  );
}

function PhotoGalleryCard({ dogId }: { dogId: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const { data: photos, isLoading } = trpc.dogs.listPhotos.useQuery({ dogId });
  const setPrimary = trpc.dogs.setPrimaryPhoto.useMutation({
    onSuccess: () => {
      utils.dogs.listPhotos.invalidate({ dogId });
      toast.success('Profile photo updated');
    },
  });
  const deletePhoto = trpc.dogs.deletePhoto.useMutation({
    onSuccess: () => {
      utils.dogs.listPhotos.invalidate({ dogId });
      toast.success('Photo deleted');
    },
    onError: (err) => toast.error(err.message),
  });

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        form.append('dogId', dogId);
        const res = await fetch('/api/upload/dog-photo', {
          method: 'POST',
          body: form,
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Upload failed');
        }
      }
      utils.dogs.listPhotos.invalidate({ dogId });
      toast.success(files.length > 1 ? `${files.length} photos uploaded` : 'Photo uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [dogId, utils]);

  const primaryPhoto = photos?.find((p) => p.isPrimary);
  const galleryPhotos = photos?.filter((p) => !p.isPrimary) ?? [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Camera className="size-4" />
            Photos
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ImagePlus className="size-3.5" />
            )}
            {uploading ? 'Uploading...' : 'Add Photo'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
        </div>
        <CardDescription>
          {photos?.length
            ? `${photos.length} photo${photos.length !== 1 ? 's' : ''} · tap the star to set as profile photo`
            : 'Add photos of your dog for their public profile.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : !photos?.length ? (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed py-12 text-center transition-colors hover:border-primary/40 hover:bg-muted/30"
          >
            <div className="flex size-14 items-center justify-center rounded-full bg-primary/10">
              <Camera className="size-7 text-primary" />
            </div>
            <div>
              <p className="font-medium">Upload your first photo</p>
              <p className="mt-1 text-sm text-muted-foreground">
                JPEG, PNG or WebP · up to 5MB each
              </p>
            </div>
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
              >
                <Image
                  src={photo.url}
                  alt={photo.caption || 'Dog photo'}
                  fill
                  className="cursor-pointer object-cover transition-transform group-hover:scale-105"
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  onClick={() => setLightboxUrl(photo.url)}
                />
                {photo.isPrimary && (
                  <div className="absolute left-1.5 top-1.5 rounded-full bg-yellow-400 p-1 shadow-sm">
                    <Star className="size-3 fill-white text-white" />
                  </div>
                )}
                {/* Overlay actions */}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/60 to-transparent px-2 pb-2 pt-6 opacity-0 transition-opacity group-hover:opacity-100">
                  {!photo.isPrimary && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPrimary.mutate({ photoId: photo.id, dogId });
                      }}
                      className="rounded-full bg-white/90 p-1.5 text-xs shadow hover:bg-white"
                      title="Set as profile photo"
                    >
                      <Star className="size-3.5 text-yellow-600" />
                    </button>
                  )}
                  {photo.isPrimary && <span />}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Delete this photo?')) {
                        deletePhoto.mutate({ photoId: photo.id, dogId });
                      }
                    }}
                    className="rounded-full bg-white/90 p-1.5 shadow hover:bg-white"
                    title="Delete photo"
                  >
                    <Trash2 className="size-3.5 text-red-600" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Lightbox */}
        {lightboxUrl && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            onClick={() => setLightboxUrl(null)}
          >
            <button
              className="absolute right-4 top-4 rounded-full bg-white/20 p-2 text-white hover:bg-white/40"
              onClick={() => setLightboxUrl(null)}
            >
              <X className="size-6" />
            </button>
            <Image
              src={lightboxUrl}
              alt="Dog photo"
              width={1200}
              height={900}
              className="max-h-[85vh] max-w-full rounded-lg object-contain"
              onClick={(e) => e.stopPropagation()}
            />
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
  const { data: photos } = trpc.dogs.listPhotos.useQuery({ dogId: id });
  const profilePhoto = photos?.find((p) => p.isPrimary);
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
            {profilePhoto ? (
              <div className="relative size-14 shrink-0 overflow-hidden rounded-full border-2 border-primary/20">
                <Image
                  src={profilePhoto.url}
                  alt={dog.registeredName}
                  fill
                  className="object-cover"
                  sizes="56px"
                />
              </div>
            ) : (
              <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Dog className="size-7 text-primary" />
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {formatDogName(dog)}
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

      {/* Photos */}
      <PhotoGalleryCard dogId={id} />

      {/* Owners */}
      {dog.owners && dog.owners.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Owners</CardTitle>
            <CardDescription>
              Registered owners of this dog.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {dog.owners.map((owner) => (
                <div key={owner.id} className="flex items-start justify-between gap-4 rounded-lg border p-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{owner.ownerName}</span>
                      {owner.isPrimary && (
                        <Badge variant="secondary" className="text-xs">Primary</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{owner.ownerEmail}</p>
                    {owner.ownerAddress && (
                      <p className="text-sm text-muted-foreground">{owner.ownerAddress}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Titles */}
      {dog.titles && dog.titles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Titles</CardTitle>
            <CardDescription>
              Championship and other titles awarded.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {dog.titles.map((t) => (
                <Badge key={t.id} variant="default" className="text-sm">
                  {getTitleDisplay(t.title)}
                  {t.dateAwarded && (
                    <span className="ml-1 opacity-70">
                      ({format(parseISO(t.dateAwarded), 'yyyy')})
                    </span>
                  )}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* KC Title Progress */}
      <TitleProgressCard dogId={id} />

      {/* Achievements */}
      {dog.achievements && dog.achievements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Achievements</CardTitle>
            <CardDescription>
              Major awards and placements earned.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {dog.achievements.map((a) => (
                <Badge key={a.id} variant="secondary">
                  {a.type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                  {a.date && (
                    <span className="ml-1 opacity-70">
                      ({format(parseISO(a.date), 'd MMM yyyy')})
                    </span>
                  )}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
