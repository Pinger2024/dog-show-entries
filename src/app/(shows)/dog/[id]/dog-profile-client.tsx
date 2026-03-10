'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { format, parseISO, differenceInYears, differenceInMonths } from 'date-fns';
import {
  ArrowLeft,
  Trophy,
  Award,
  Calendar,
  Dog,
  Loader2,
  Star,
  X,
  Share2,
  Check,
  ExternalLink,
  Heart,
  BookOpen,
  Clock,
  Camera,
  Settings,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getPlacementLabel, placementColors } from '@/lib/placements';
import { DogTimeline } from '@/components/dog-timeline';
import { ChampionshipProgress } from '@/components/championship-progress';
import { showTypeLabels } from '@/lib/show-types';

/* ─── Constants ────────────────────────────────────────────────── */

const showTypeColors: Record<string, string> = {
  companion: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  primary: 'bg-sky-50 text-sky-700 border-sky-200',
  limited: 'bg-amber-50 text-amber-700 border-amber-200',
  open: 'bg-violet-50 text-violet-700 border-violet-200',
  premier_open: 'bg-rose-50 text-rose-700 border-rose-200',
  championship: 'bg-indigo-50 text-indigo-700 border-indigo-200',
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
  dog_cc: 'Dog CC',
  reserve_dog_cc: 'Reserve Dog CC',
  bitch_cc: 'Bitch CC',
  reserve_bitch_cc: 'Reserve Bitch CC',
  best_puppy_dog: 'Best Puppy Dog',
  best_puppy_bitch: 'Best Puppy Bitch',
  best_long_coat_dog: 'Best Long Coat Dog',
  best_long_coat_bitch: 'Best Long Coat Bitch',
  best_long_coat_in_show: 'Best Long Coat in Show',
};

const achievementWeight: Record<string, number> = {
  best_in_show: 10,
  reserve_best_in_show: 9,
  best_of_breed: 8,
  cc: 7,
  dog_cc: 7,
  bitch_cc: 7,
  reserve_cc: 6,
  reserve_dog_cc: 6,
  reserve_bitch_cc: 6,
  best_puppy_in_show: 5,
  best_puppy_in_breed: 4,
  best_puppy_dog: 4,
  best_puppy_bitch: 4,
  best_veteran_in_breed: 4,
  best_long_coat_in_show: 4,
  best_long_coat_dog: 3,
  best_long_coat_bitch: 3,
  group_placement: 3,
  junior_warrant: 2,
  stud_book: 2,
  class_placement: 1,
};

/* ─── Helpers ──────────────────────────────────────────────────── */

function formatAge(dateOfBirth: string): string {
  const dob = parseISO(dateOfBirth);
  const now = new Date();
  const years = differenceInYears(now, dob);
  if (years >= 1) {
    const remainingMonths = differenceInMonths(now, dob) % 12;
    if (remainingMonths > 0) {
      return `${years}y ${remainingMonths}m`;
    }
    return `${years} year${years !== 1 ? 's' : ''}`;
  }
  const months = differenceInMonths(now, dob);
  if (months < 1) return 'Under 1 month';
  return `${months} month${months !== 1 ? 's' : ''}`;
}

function getTitlePrefix(titles: { title: string }[]): string {
  const titleOrder = ['ch', 'sh_ch', 'ir_ch', 'ir_sh_ch', 'int_ch', 'ob_ch', 'ft_ch', 'wt_ch'];
  const sorted = [...titles].sort(
    (a, b) => titleOrder.indexOf(a.title) - titleOrder.indexOf(b.title)
  );
  return sorted.map((t) => titleLabels[t.title] ?? t.title).join(' ');
}

/* ─── Small presentational components ──────────────────────────── */

function Ornament() {
  return (
    <div className="flex items-center justify-center gap-3 py-5">
      <div className="h-px w-10 bg-stone-300 sm:w-14" />
      <div className="size-1.5 rotate-45 border border-stone-400" />
      <div className="h-px w-10 bg-stone-300 sm:w-14" />
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 pb-5 pt-2">
      <div className="h-px flex-1 bg-stone-200" />
      <h2 className="font-serif text-[0.6875rem] font-normal uppercase tracking-[0.25em] text-stone-400">
        {children}
      </h2>
      <div className="h-px flex-1 bg-stone-200" />
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-stone-100 py-2 last:border-0">
      <span className="text-[0.8125rem] uppercase tracking-wide text-stone-400">
        {label}
      </span>
      <span className="text-right font-serif text-[0.9375rem] font-normal text-stone-800">
        {value}
      </span>
    </div>
  );
}

function StatBlock({
  value,
  label,
  accent,
}: {
  value: number;
  label: string;
  accent?: string;
}) {
  return (
    <div className="text-center">
      <p className={`font-serif text-2xl font-bold sm:text-3xl ${accent ?? 'text-stone-800'}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[0.6875rem] uppercase tracking-[0.15em] text-stone-400">
        {label}
      </p>
    </div>
  );
}

/* ─── Main page ────────────────────────────────────────────────── */

export function DogProfileClient({ id }: { id: string }) {
  const { data: session } = useSession();
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'timeline'>('profile');

  const { data, isLoading } = trpc.dogs.getPublicProfile.useQuery({ id });
  const { data: photos } = trpc.dogs.getPublicPhotos.useQuery({ dogId: id });
  const { data: proStatus } = trpc.pro.getSubscription.useQuery(undefined, {
    enabled: !!session?.user,
  });

  // Follow system
  const { data: followData } = trpc.follows.isFollowing.useQuery(
    { dogId: id },
    { enabled: !!session?.user }
  );
  const { data: followerCount } = trpc.follows.count.useQuery({ dogId: id });
  const utils = trpc.useUtils();
  const toggleFollow = trpc.follows.toggle.useMutation({
    onSuccess: () => {
      utils.follows.isFollowing.invalidate({ dogId: id });
      utils.follows.count.invalidate({ dogId: id });
    },
  });

  async function handleCopyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#FAFAF8]">
        <Loader2 className="size-6 animate-spin text-stone-300" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-[#FAFAF8] text-center">
        <Dog className="size-10 text-stone-300" />
        <div>
          <p className="font-serif text-lg text-stone-600">Dog not found</p>
          <Link
            href="/dogs"
            className="mt-2 inline-block text-sm text-stone-400 underline decoration-stone-300 hover:text-stone-600"
          >
            Back to my dogs
          </Link>
        </div>
      </div>
    );
  }

  const { dog, titles, achievements, showHistory, stats } = data;
  const userId = session?.user?.id;
  const isOwner = !!userId && (dog.ownerUserIds ?? [dog.ownerId]).includes(userId);
  const canEdit = isOwner;
  const titlePrefix = getTitlePrefix(titles);
  const primaryPhoto = photos?.find((p) => p.isPrimary) ?? photos?.[0];
  const galleryPhotos = photos?.filter((p) => p.id !== primaryPhoto?.id) ?? [];

  // Details for the "Particulars" section
  const details: { label: string; value: React.ReactNode }[] = [
    { label: 'Sex', value: <span className="capitalize">{dog.sex}</span> },
    {
      label: 'Whelped',
      value: format(parseISO(dog.dateOfBirth), 'd MMMM yyyy'),
    },
    { label: 'Age', value: formatAge(dog.dateOfBirth) },
  ];
  if (dog.sireName) details.push({ label: 'Sire', value: dog.sireName });
  if (dog.damName) details.push({ label: 'Dam', value: dog.damName });
  if (dog.breederName) details.push({ label: 'Breeder', value: dog.breederName });
  if (dog.colour) details.push({ label: 'Colour', value: dog.colour });
  if (dog.kcRegNumber)
    details.push({
      label: 'KC Reg',
      value: <span className="font-mono text-xs tracking-wider">{dog.kcRegNumber}</span>,
    });

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* ─── Navigation bar ─── */}
      <div className="mx-auto flex max-w-2xl items-center justify-between px-5 pb-2 pt-5 sm:px-8 sm:pt-8">
        <button
          onClick={() =>
            window.history.length > 1
              ? window.history.back()
              : (window.location.href = '/dogs')
          }
          className="inline-flex items-center gap-1.5 text-[0.8125rem] text-stone-400 transition-colors hover:text-stone-700"
        >
          <ArrowLeft className="size-3.5" />
          Back
        </button>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Link
              href={`/dogs/${id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[0.8125rem] text-stone-500 transition-all hover:border-stone-300 hover:text-stone-700"
            >
              <Settings className="size-3.5" />
              Edit
            </Link>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[0.8125rem] text-stone-500 transition-all hover:border-stone-300 hover:text-stone-700">
                {copied ? (
                  <>
                    <Check className="size-3.5 text-emerald-500" />
                    Copied
                  </>
                ) : (
                  <>
                    <Share2 className="size-3.5" />
                    Share
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={() => {
                  const url = encodeURIComponent(window.location.href);
                  window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank', 'width=600,height=400');
                }}
              >
                <svg className="mr-2 size-4" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                Facebook
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const url = encodeURIComponent(window.location.href);
                  const text = encodeURIComponent(data ? `Check out ${dog.registeredName} on Remi` : 'Check out this dog on Remi');
                  window.open(`https://wa.me/?text=${text}%20${url}`, '_blank');
                }}
              >
                <svg className="mr-2 size-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                WhatsApp
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const url = encodeURIComponent(window.location.href);
                  const text = encodeURIComponent(data ? `Check out ${dog.registeredName} on Remi` : 'Check out this dog on Remi');
                  window.open(`https://x.com/intent/tweet?text=${text}&url=${url}`, '_blank', 'width=600,height=400');
                }}
              >
                <svg className="mr-2 size-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                X (Twitter)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCopyLink}>
                {copied ? (
                  <Check className="mr-2 size-4 text-emerald-500" />
                ) : (
                  <ExternalLink className="mr-2 size-4" />
                )}
                {copied ? 'Link copied!' : 'Copy link'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ─── Hero section ─── */}
      <div className="mx-auto max-w-2xl px-5 sm:px-8">
        {/* Portrait photo */}
        <div className="flex justify-center pt-4">
          {primaryPhoto ? (
            <div
              className="relative aspect-[4/5] w-full max-w-xs cursor-pointer overflow-hidden rounded-sm shadow-lg shadow-stone-200/80 sm:max-w-sm"
              onClick={() => setLightboxUrl(primaryPhoto.url)}
            >
              <Image
                src={primaryPhoto.url}
                alt={dog.registeredName}
                fill
                className="object-cover"
                sizes="(min-width: 640px) 384px, 320px"
                priority
              />
            </div>
          ) : canEdit ? (
            <Link
              href={`/dogs/${id}`}
              className="group flex aspect-[4/5] w-full max-w-xs flex-col items-center justify-center gap-3 rounded-sm border-2 border-dashed border-stone-200 bg-stone-50 transition-colors hover:border-stone-300 hover:bg-stone-100 sm:max-w-sm"
            >
              <Camera className="size-10 text-stone-300 transition-colors group-hover:text-stone-400" />
              <span className="text-sm font-medium text-stone-400 transition-colors group-hover:text-stone-500">
                Add a profile photo
              </span>
            </Link>
          ) : (
            <div className="flex aspect-[4/5] w-full max-w-xs items-center justify-center rounded-sm bg-stone-100 sm:max-w-sm">
              <Dog className="size-16 text-stone-200" />
            </div>
          )}
        </div>

        <Ornament />

        {/* Name and breed */}
        <div className="text-center">
          {titlePrefix && (
            <p className="mb-1 font-serif text-sm italic tracking-wide text-amber-700/80 sm:text-base">
              {titlePrefix}
            </p>
          )}
          <h1 className="font-serif text-2xl font-bold leading-tight tracking-tight text-stone-900 sm:text-3xl md:text-4xl">
            {dog.registeredName}
          </h1>
          <p className="mt-2 text-[0.9375rem] text-stone-400">
            {dog.breed?.name ?? 'Unknown breed'}
            {dog.breed?.group && (
              <span className="text-stone-300"> &middot; </span>
            )}
            {dog.breed?.group && (
              <span className="text-stone-400">{dog.breed.group.name}</span>
            )}
          </p>
          {dog.bio && (
            <p className="mx-auto mt-4 max-w-md font-serif text-[0.9375rem] italic leading-relaxed text-stone-500">
              &ldquo;{dog.bio}&rdquo;
            </p>
          )}
        </div>

        {/* ─── Titles ─── */}
        {titles.length > 0 && (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {titles.map((title) => (
              <span
                key={title.id}
                className="inline-flex items-center gap-1.5 rounded-sm border border-amber-200/60 bg-amber-50/50 px-3 py-1 font-serif text-sm text-amber-800"
              >
                {titleLabels[title.title] ?? title.title}
                {title.dateAwarded && (
                  <span className="text-xs text-amber-500">
                    {format(parseISO(title.dateAwarded), 'yyyy')}
                  </span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ─── Follow & tab bar ─── */}
      <div className="mx-auto max-w-2xl px-5 sm:px-8">
        {/* Follow button + count */}
        <div className="mt-6 flex items-center justify-center gap-4">
          {session?.user && !isOwner && (
            <button
              onClick={() => toggleFollow.mutate({ dogId: id })}
              disabled={toggleFollow.isPending}
              className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-[0.8125rem] font-medium transition-all ${
                followData?.following
                  ? 'border-stone-300 bg-stone-100 text-stone-600'
                  : 'border-stone-200 bg-white text-stone-500 hover:border-stone-300 hover:text-stone-700'
              }`}
            >
              <Heart
                className={`size-3.5 ${
                  followData?.following ? 'fill-stone-500 text-stone-500' : ''
                }`}
              />
              {followData?.following ? 'Following' : 'Follow'}
            </button>
          )}
          {(followerCount?.count ?? 0) > 0 && (
            <span className="text-xs text-stone-400">
              {followerCount!.count} follower{followerCount!.count !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="mt-6 flex justify-center gap-1">
          <button
            onClick={() => setActiveTab('profile')}
            className={`inline-flex items-center gap-1.5 rounded-sm px-4 py-2 text-[0.8125rem] font-medium transition-colors ${
              activeTab === 'profile'
                ? 'bg-stone-100 text-stone-800'
                : 'text-stone-400 hover:text-stone-600'
            }`}
          >
            <BookOpen className="size-3.5" />
            Profile
          </button>
          <button
            onClick={() => setActiveTab('timeline')}
            className={`inline-flex items-center gap-1.5 rounded-sm px-4 py-2 text-[0.8125rem] font-medium transition-colors ${
              activeTab === 'timeline'
                ? 'bg-stone-100 text-stone-800'
                : 'text-stone-400 hover:text-stone-600'
            }`}
          >
            <Clock className="size-3.5" />
            Timeline
          </button>
        </div>
      </div>

      {/* ─── Content ─── */}
      <div className="mx-auto max-w-2xl px-5 pb-16 pt-10 sm:px-8 md:pb-8">
        {activeTab === 'timeline' ? (
          <DogTimeline
            dogId={id}
            isOwner={isOwner}
          />
        ) : (
        <>
        {/* ─── Particulars ─── */}
        <SectionHeading>Particulars</SectionHeading>
        <div className="mx-auto max-w-md">
          {details.map((d) => (
            <DetailRow key={d.label} label={d.label} value={d.value} />
          ))}
        </div>

        {/* ─── Career Stats ─── */}
        {stats.totalShows > 0 && (
          <div className="mt-12">
            <SectionHeading>Career</SectionHeading>
            <div className="flex items-start justify-center gap-4 sm:gap-8">
              <StatBlock value={stats.totalShows} label="Shows" />
              <div className="mt-2 h-8 w-px bg-stone-200" />
              <StatBlock value={stats.totalClasses} label="Classes" />
              <div className="mt-2 h-8 w-px bg-stone-200" />
              <StatBlock value={stats.firsts} label="1sts" accent="text-amber-600" />
              <div className="mt-2 h-8 w-px bg-stone-200" />
              <StatBlock value={stats.seconds} label="2nds" accent="text-stone-500" />
              <div className="mt-2 h-8 w-px bg-stone-200" />
              <StatBlock value={stats.thirds} label="3rds" accent="text-amber-700/70" />
              {stats.specialAwards > 0 && (
                <>
                  <div className="mt-2 h-8 w-px bg-stone-200" />
                  <StatBlock value={stats.specialAwards} label="Awards" accent="text-violet-600" />
                </>
              )}
            </div>
          </div>
        )}

        {/* ─── Championship & Analytics ─── */}
        {stats.totalShows > 0 && (
          <div className="mt-12">
            <SectionHeading>Championship & Analytics</SectionHeading>
            <ChampionshipProgress
              dogId={id}
              isPro={proStatus?.status === 'active'}
            />
          </div>
        )}

        {/* ─── Gallery ─── */}
        {photos && photos.length > 1 && (
          <div className="mt-12">
            <SectionHeading>Gallery</SectionHeading>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
              {galleryPhotos.map((photo) => (
                <div
                  key={photo.id}
                  className="group relative aspect-square cursor-pointer overflow-hidden rounded-sm bg-stone-100"
                  onClick={() => setLightboxUrl(photo.url)}
                >
                  <Image
                    src={photo.url}
                    alt={photo.caption || 'Photo'}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="(max-width: 640px) 50vw, 33vw"
                  />
                  {photo.caption && (
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-2.5 pb-2 pt-6 opacity-0 transition-opacity group-hover:opacity-100">
                      <p className="text-xs text-white/90">{photo.caption}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Show Record ─── */}
        <div className="mt-12">
          <SectionHeading>Show Record</SectionHeading>
          {showHistory.length === 0 ? (
            <div className="py-10 text-center">
              <Trophy className="mx-auto size-8 text-stone-200" />
              <p className="mt-3 font-serif text-sm italic text-stone-400">
                No show results recorded yet
              </p>
            </div>
          ) : (
            <div className="relative ml-3 border-l border-stone-200 sm:ml-4">
              {showHistory.map((show, showIdx) => (
                <div key={`${show.showId}-${showIdx}`} className="relative pb-8 pl-6 last:pb-0 sm:pl-8">
                  {/* Timeline dot */}
                  <div className="absolute -left-[4.5px] top-[3px] size-[9px] rounded-full border-2 border-stone-300 bg-[#FAFAF8]" />

                  {/* Show header */}
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <Link
                      href={`/shows/${show.showId}/results`}
                      className="group inline-flex items-baseline gap-1 font-serif text-base font-bold text-stone-800 hover:text-stone-600"
                    >
                      {show.showName}
                      <ExternalLink className="mb-px size-3 text-stone-300 transition-colors group-hover:text-stone-500" />
                    </Link>
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-normal ${showTypeColors[show.showType] ?? ''}`}
                    >
                      {showTypeLabels[show.showType] ?? show.showType}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-stone-400">
                    {format(parseISO(show.showDate), 'EEEE d MMMM yyyy')}
                  </p>

                  {/* Classes */}
                  <div className="mt-3 space-y-2">
                    {show.classes.map((cls, clsIdx) => (
                      <div key={clsIdx}>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.9375rem]">
                          {cls.classNumber != null && (
                            <span className="font-mono text-xs text-stone-400">
                              {cls.classNumber}.
                            </span>
                          )}
                          <span className="font-medium text-stone-700">
                            {cls.className}
                          </span>
                          {cls.placement && (
                            <Badge
                              variant="outline"
                              className={`text-xs font-semibold ${placementColors[cls.placement] ?? ''}`}
                            >
                              {getPlacementLabel(cls.placement)}
                            </Badge>
                          )}
                          {cls.specialAward && (
                            <span className="inline-flex items-center gap-0.5 rounded-sm bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200/50">
                              <Award className="size-2.5" />
                              {cls.specialAward}
                            </span>
                          )}
                        </div>
                        {cls.critiqueText && (
                          <blockquote className="mt-1.5 border-l-2 border-stone-200 pl-3 font-serif text-[0.8125rem] italic leading-relaxed text-stone-500">
                            &ldquo;{cls.critiqueText}&rdquo;
                          </blockquote>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ─── Honours ─── */}
        {achievements.length > 0 && (
          <div className="mt-12">
            <SectionHeading>Honours</SectionHeading>
            <div className="space-y-2">
              {[...achievements]
                .sort((a, b) => {
                  // Sort by weight (prestige) desc, then date desc
                  const wa = achievementWeight[a.type] ?? 0;
                  const wb = achievementWeight[b.type] ?? 0;
                  if (wb !== wa) return wb - wa;
                  return b.date.localeCompare(a.date);
                })
                .map((achievement) => {
                  const label = achievementLabels[achievement.type] ?? achievement.type;
                  const isPrestigious = (achievementWeight[achievement.type] ?? 0) >= 7;
                  const details =
                    achievement.details != null && typeof achievement.details === 'object'
                      ? (achievement.details as Record<string, unknown>)
                      : null;
                  const showName = details?.showName as string | undefined;
                  const judgeName = details?.judgeName as string | undefined;

                  return (
                    <div
                      key={achievement.id}
                      className={`flex items-start gap-3 rounded-sm border px-3 py-2.5 sm:px-4 ${
                        isPrestigious
                          ? 'border-amber-200/60 bg-amber-50/30'
                          : 'border-stone-100 bg-white'
                      }`}
                    >
                      <div
                        className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${
                          isPrestigious ? 'bg-amber-100' : 'bg-stone-100'
                        }`}
                      >
                        {isPrestigious ? (
                          <Star className="size-3.5 text-amber-600" />
                        ) : (
                          <Award className="size-3.5 text-stone-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-serif text-[0.9375rem] font-bold text-stone-800">
                          {label}
                        </p>
                        <p className="text-xs text-stone-400">
                          {format(parseISO(achievement.date), 'd MMMM yyyy')}
                          {showName && (
                            <span> &middot; {showName}</span>
                          )}
                          {judgeName && (
                            <span> &middot; Judge: {judgeName}</span>
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* ─── Footer branding ─── */}
        <div className="mt-16 flex justify-center">
          <p className="text-[0.6875rem] uppercase tracking-[0.3em] text-stone-300">
            Remi Show Manager
          </p>
        </div>
        </>
        )}
      </div>

      {/* ─── Lightbox ─── */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="absolute right-3 top-3 flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:right-5 sm:top-5"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="size-5" />
          </button>
          <Image
            src={lightboxUrl}
            alt="Photo"
            width={1200}
            height={900}
            className="max-h-[85vh] max-w-full rounded-sm object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
