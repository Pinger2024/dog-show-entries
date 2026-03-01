'use client';

import { use, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { format, parseISO, differenceInYears, differenceInMonths } from 'date-fns';
import {
  ArrowLeft,
  Trophy,
  Award,
  Calendar,
  Dog,
  Loader2,
  Star,
  Medal,
  Camera,
  X,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getPlacementLabel } from '@/lib/placements';

const placementColors: Record<number, string> = {
  1: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  2: 'bg-gray-100 text-gray-700 border-gray-200',
  3: 'bg-amber-100 text-amber-800 border-amber-200',
  4: 'bg-blue-50 text-blue-700 border-blue-200',
  5: 'bg-purple-50 text-purple-700 border-purple-200',
  6: 'bg-teal-50 text-teal-700 border-teal-200',
  7: 'bg-slate-50 text-slate-600 border-slate-200',
};

const showTypeLabels: Record<string, string> = {
  companion: 'Companion',
  primary: 'Primary',
  limited: 'Limited',
  open: 'Open',
  premier_open: 'Premier Open',
  championship: 'Championship',
};

const showTypeColors: Record<string, string> = {
  companion: 'bg-emerald-50 text-emerald-700',
  primary: 'bg-sky-50 text-sky-700',
  limited: 'bg-amber-50 text-amber-700',
  open: 'bg-violet-50 text-violet-700',
  premier_open: 'bg-rose-50 text-rose-700',
  championship: 'bg-indigo-50 text-indigo-700',
};

const titleLabels: Record<string, string> = {
  ch: 'Ch.',
  sh_ch: 'Sh. Ch.',
  ir_ch: 'Ir. Ch.',
  ir_sh_ch: 'Ir. Sh. Ch.',
  int_ch: 'Int. Ch.',
  ob_ch: 'Ob. Ch.',
  ft_ch: 'FT Ch.',
  wt_ch: 'WT Ch.',
};

const achievementLabels: Record<string, string> = {
  cc: 'Challenge Certificate',
  reserve_cc: 'Reserve CC',
  best_of_breed: 'Best of Breed',
  best_in_show: 'Best in Show',
  reserve_best_in_show: 'Reserve Best in Show',
  best_puppy_in_breed: 'Best Puppy in Breed',
  best_puppy_in_show: 'Best Puppy in Show',
  best_veteran_in_breed: 'Best Veteran in Breed',
  group_placement: 'Group Placement',
  class_placement: 'Class Placement',
  junior_warrant: 'Junior Warrant',
  stud_book: 'Stud Book',
};

function formatAge(dateOfBirth: string): string {
  const dob = parseISO(dateOfBirth);
  const now = new Date();
  const years = differenceInYears(now, dob);
  if (years >= 1) {
    const remainingMonths = differenceInMonths(now, dob) % 12;
    if (remainingMonths > 0) {
      return `${years} year${years !== 1 ? 's' : ''}, ${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`;
    }
    return `${years} year${years !== 1 ? 's' : ''}`;
  }
  const months = differenceInMonths(now, dob);
  if (months < 1) return 'Under 1 month';
  return `${months} month${months !== 1 ? 's' : ''}`;
}

function getTitlePrefix(titles: { title: string }[]): string {
  // Build title prefix from the dog's titles
  // Priority: ch > sh_ch > others
  const titleOrder = ['ch', 'sh_ch', 'ir_ch', 'ir_sh_ch', 'int_ch', 'ob_ch', 'ft_ch', 'wt_ch'];
  const sorted = [...titles].sort(
    (a, b) => titleOrder.indexOf(a.title) - titleOrder.indexOf(b.title)
  );
  return sorted.map((t) => titleLabels[t.title] ?? t.title).join(' ');
}

export default function DogProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const { data, isLoading } = trpc.dogs.getPublicProfile.useQuery({ id });
  const { data: photos } = trpc.dogs.getPublicPhotos.useQuery({ dogId: id });

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary/40" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <Dog className="size-12 text-muted-foreground/40" />
        <p className="text-muted-foreground">Dog not found.</p>
        <Link
          href="/shows"
          className="text-sm text-primary underline hover:no-underline"
        >
          Back to shows
        </Link>
      </div>
    );
  }

  const { dog, titles, achievements, showHistory, stats } = data;
  const titlePrefix = getTitlePrefix(titles);

  return (
    <div className="min-h-screen">
      {/* Hero header */}
      <div className="relative overflow-hidden border-b bg-gradient-to-b from-primary/[0.04] to-transparent">
        <div className="relative mx-auto max-w-4xl px-4 pb-6 pt-6 sm:px-6">
          <Link
            href="/shows"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Shows
          </Link>

          <div className="mt-4">
            <div className="flex items-start gap-4">
              {photos?.find((p) => p.isPrimary) ? (
                <div className="relative size-14 shrink-0 overflow-hidden rounded-full border-2 border-primary/20 sm:size-16">
                  <Image
                    src={photos.find((p) => p.isPrimary)!.url}
                    alt={dog.registeredName}
                    fill
                    className="object-cover"
                    sizes="(min-width: 640px) 64px, 56px"
                  />
                </div>
              ) : (
                <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 sm:size-16">
                  <Dog className="size-7 text-primary sm:size-8" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h1 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">
                  {titlePrefix && (
                    <span className="text-primary">{titlePrefix} </span>
                  )}
                  {dog.registeredName}
                </h1>
                <p className="mt-1 text-muted-foreground">
                  {dog.breed?.name ?? 'Unknown breed'}
                  {dog.breed?.group && (
                    <span className="text-muted-foreground/60">
                      {' '}
                      &middot; {dog.breed.group.name}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Dog details grid */}
            <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:grid-cols-3 sm:gap-x-6">
              <div>
                <span className="text-muted-foreground">Sex</span>
                <p className="font-medium capitalize">{dog.sex}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Date of Birth</span>
                <p className="font-medium">
                  {format(parseISO(dog.dateOfBirth), 'd MMM yyyy')}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Age</span>
                <p className="font-medium">{formatAge(dog.dateOfBirth)}</p>
              </div>
              {dog.sireName && (
                <div>
                  <span className="text-muted-foreground">Sire</span>
                  <p className="font-medium">{dog.sireName}</p>
                </div>
              )}
              {dog.damName && (
                <div>
                  <span className="text-muted-foreground">Dam</span>
                  <p className="font-medium">{dog.damName}</p>
                </div>
              )}
              {dog.breederName && (
                <div>
                  <span className="text-muted-foreground">Breeder</span>
                  <p className="font-medium">{dog.breederName}</p>
                </div>
              )}
              {dog.colour && (
                <div>
                  <span className="text-muted-foreground">Colour</span>
                  <p className="font-medium">{dog.colour}</p>
                </div>
              )}
              {dog.kcRegNumber && (
                <div>
                  <span className="text-muted-foreground">KC Reg</span>
                  <p className="font-medium font-mono text-xs">
                    {dog.kcRegNumber}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="space-y-8">
          {/* Titles */}
          {titles.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 font-serif text-lg font-semibold">
                <Medal className="size-5 text-primary" />
                Titles
              </h2>
              <div className="flex flex-wrap gap-2">
                {titles.map((title) => (
                  <Badge
                    key={title.id}
                    variant="secondary"
                    className="bg-primary/10 text-primary"
                  >
                    {titleLabels[title.title] ?? title.title}
                    {title.dateAwarded && (
                      <span className="ml-1.5 text-primary/60">
                        ({format(parseISO(title.dateAwarded), 'MMM yyyy')})
                      </span>
                    )}
                  </Badge>
                ))}
              </div>
            </section>
          )}

          {/* Stats */}
          {stats.totalShows > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 font-serif text-lg font-semibold">
                <Trophy className="size-5 text-primary" />
                Career Stats
              </h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6 sm:gap-3">
                <Card>
                  <CardContent className="px-3 py-3 text-center">
                    <p className="text-2xl font-bold">{stats.totalShows}</p>
                    <p className="text-xs text-muted-foreground">Shows</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="px-3 py-3 text-center">
                    <p className="text-2xl font-bold">{stats.totalClasses}</p>
                    <p className="text-xs text-muted-foreground">Classes</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="px-3 py-3 text-center">
                    <p className="text-2xl font-bold text-yellow-600">
                      {stats.firsts}
                    </p>
                    <p className="text-xs text-muted-foreground">1sts</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="px-3 py-3 text-center">
                    <p className="text-2xl font-bold text-gray-500">
                      {stats.seconds}
                    </p>
                    <p className="text-xs text-muted-foreground">2nds</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="px-3 py-3 text-center">
                    <p className="text-2xl font-bold text-amber-600">
                      {stats.thirds}
                    </p>
                    <p className="text-xs text-muted-foreground">3rds</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="px-3 py-3 text-center">
                    <p className="text-2xl font-bold text-purple-600">
                      {stats.specialAwards}
                    </p>
                    <p className="text-xs text-muted-foreground">Awards</p>
                  </CardContent>
                </Card>
              </div>
            </section>
          )}

          {/* Photo Gallery */}
          {photos && photos.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 font-serif text-lg font-semibold">
                <Camera className="size-5 text-primary" />
                Photos
              </h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {photos.map((photo) => (
                  <div
                    key={photo.id}
                    className="group relative aspect-square cursor-pointer overflow-hidden rounded-lg border bg-muted"
                    onClick={() => setLightboxUrl(photo.url)}
                  >
                    <Image
                      src={photo.url}
                      alt={photo.caption || 'Dog photo'}
                      fill
                      className="object-cover transition-transform group-hover:scale-105"
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    />
                    {photo.caption && (
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 pb-2 pt-4">
                        <p className="text-xs text-white">{photo.caption}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Show History */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 font-serif text-lg font-semibold">
              <Calendar className="size-5 text-primary" />
              Show History
            </h2>
            {showHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-lg border bg-white py-12 text-center">
                <Trophy className="size-10 text-muted-foreground/30" />
                <p className="text-muted-foreground">
                  No show results recorded yet.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {showHistory.map((show, showIdx) => (
                  <Card key={`${show.showId}-${showIdx}`}>
                    <CardHeader className="pb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/shows/${show.showId}/results`}
                          className="hover:underline"
                        >
                          <CardTitle className="text-base">
                            {show.showName}
                          </CardTitle>
                        </Link>
                        <Badge
                          variant="secondary"
                          className={`text-[10px] ${showTypeColors[show.showType] ?? ''}`}
                        >
                          {showTypeLabels[show.showType] ?? show.showType}
                        </Badge>
                      </div>
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar className="size-3" />
                        {format(parseISO(show.showDate), 'EEEE d MMMM yyyy')}
                      </p>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-1.5">
                        {show.classes.map((cls, clsIdx) => (
                          <div
                            key={clsIdx}
                            className="flex flex-wrap items-center gap-2 text-sm"
                          >
                            {cls.classNumber != null && (
                              <span className="text-xs font-bold text-muted-foreground">
                                #{cls.classNumber}
                              </span>
                            )}
                            <span className="font-medium">{cls.className}</span>
                            {cls.placement && (
                              <Badge
                                variant="outline"
                                className={`text-xs font-semibold ${placementColors[cls.placement] ?? ''}`}
                              >
                                {getPlacementLabel(cls.placement)}
                              </Badge>
                            )}
                            {cls.specialAward && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] bg-amber-50 text-amber-700"
                              >
                                <Award className="mr-0.5 size-3" />
                                {cls.specialAward}
                              </Badge>
                            )}
                            {cls.critiqueText && (
                              <p className="w-full pl-0 pt-1 text-xs italic text-muted-foreground sm:pl-6">
                                &ldquo;{cls.critiqueText}&rdquo;
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* Achievements */}
          {achievements.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 font-serif text-lg font-semibold">
                <Star className="size-5 text-primary" />
                Achievements
              </h2>
              <div className="space-y-3">
                {achievements
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((achievement) => (
                    <div
                      key={achievement.id}
                      className="flex items-start gap-3 rounded-lg border bg-white p-3"
                    >
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-50">
                        <Award className="size-4 text-amber-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm">
                          {achievementLabels[achievement.type] ??
                            achievement.type}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(parseISO(achievement.date), 'd MMMM yyyy')}
                        </p>
                        {achievement.details != null && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {String(
                              typeof achievement.details === 'object'
                                ? JSON.stringify(achievement.details)
                                : achievement.details
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="absolute right-3 top-3 min-h-[44px] min-w-[44px] rounded-full bg-white/20 p-2.5 text-white active:bg-white/40 sm:right-4 sm:top-4 sm:p-2"
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
    </div>
  );
}
