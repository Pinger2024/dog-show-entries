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
import {
  FacebookShareButton,
  WhatsappShareButton,
  TwitterShareButton,
  EmailShareButton,
  TelegramShareButton,
  FacebookIcon,
  WhatsappIcon,
  XIcon,
  EmailIcon,
  TelegramIcon,
} from 'react-share';
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
import { SE_H } from '@/components/show-experience/tokens';
import { cn } from '@/lib/utils';

/* ─── Constants ────────────────────────────────────────────────── */

const showTypeColors: Record<string, string> = {
  companion: 'bg-se-fresh-soft text-se-fresh-deep border-se-fresh-line',
  primary: 'bg-sky-50 text-sky-700 border-sky-200',
  limited: 'bg-se-honey-soft text-se-honey-deep border-se-honey-line',
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
  best_dog: 'Best Dog',
  best_bitch: 'Best Bitch',
  reserve_best_dog: 'Reserve Best Dog',
  reserve_best_bitch: 'Reserve Best Bitch',
  best_veteran_in_show: 'Best Veteran in Show',
  reserve_best_veteran_in_show: 'Reserve Best Veteran in Show',
  best_veteran_in_group: 'Best Veteran in Group',
  most_promising_young_dog: 'Most Promising Young Dog',
  most_promising_young_bitch: 'Most Promising Young Bitch',
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
  best_dog: 6,
  best_bitch: 6,
  reserve_best_dog: 5,
  reserve_best_bitch: 5,
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
      <div className="h-px w-10 bg-border sm:w-14" />
      <div className="size-1.5 rotate-45 border border-border" />
      <div className="h-px w-10 bg-border sm:w-14" />
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 pb-5 pt-2">
      <div className="h-px flex-1 bg-border" />
      <h2 className="font-serif text-[0.6875rem] font-normal uppercase tracking-[0.25em] text-muted-foreground">
        {children}
      </h2>
      <div className="h-px flex-1 bg-border" />
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
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-2 last:border-0">
      <span className="text-[0.8125rem] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-right font-serif text-[0.9375rem] font-normal text-foreground">
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
      <p className={`font-serif text-2xl font-bold sm:text-3xl ${accent ?? 'text-foreground'}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[0.6875rem] uppercase tracking-[0.15em] text-muted-foreground">
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
      <div className="flex min-h-[60vh] items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground/50" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-background text-center">
        <Dog className="size-10 text-muted-foreground/50" />
        <div>
          <p className="font-serif text-lg text-muted-foreground">Dog not found</p>
          <Link
            href="/dogs"
            className="mt-2 inline-block text-sm text-muted-foreground underline decoration-muted-foreground/50 hover:text-foreground"
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
      label: 'RKC Reg',
      value: <span className="font-mono text-xs tracking-wider">{dog.kcRegNumber}</span>,
    });

  return (
    <div className="min-h-screen bg-background">
      {/* ─── Navigation bar ─── */}
      <div className="mx-auto flex max-w-2xl items-center justify-between px-5 pb-2 pt-5 sm:px-8 sm:pt-8">
        <button
          onClick={() =>
            window.history.length > 1
              ? window.history.back()
              : (window.location.href = '/dogs')
          }
          className="inline-flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back
        </button>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Link
              href={`/dogs/${id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[0.8125rem] text-muted-foreground transition-all hover:border-muted-foreground/30 hover:text-foreground"
            >
              <Settings className="size-3.5" />
              Edit
            </Link>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[0.8125rem] text-muted-foreground transition-all hover:border-muted-foreground/30 hover:text-foreground">
                {copied ? (
                  <>
                    <Check className="size-3.5 text-se-fresh-deep" />
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
              {(() => {
                const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
                const displayName = titlePrefix
                  ? `${titlePrefix} ${dog.registeredName}`
                  : dog.registeredName;
                const breedName = dog.breed?.name ?? 'Dog';

                // Build hashtags from breed name (e.g. "German Shepherd Dog" → "GermanShepherdDog")
                const breedHashtag = breedName.replace(/\s+/g, '');
                const hashtags = ['DogShow', breedHashtag, 'Remi'];

                // Rich tweet text
                const tweetText = `${displayName} — ${breedName}${stats.totalShows > 0 ? ` · ${stats.totalShows} show${stats.totalShows !== 1 ? 's' : ''} entered` : ''}`;

                // Messaging text (WhatsApp, Telegram)
                const messageText = `Have a look at ${displayName} (${breedName}) on Remi — ${stats.totalShows > 0 ? `${stats.totalShows} show${stats.totalShows !== 1 ? 's' : ''} on record!` : 'check out their profile!'}`;

                // Email
                const emailSubject = `${displayName} — ${breedName} profile on Remi`;

                return (
                  <>
                    <DropdownMenuItem asChild>
                      <FacebookShareButton url={shareUrl} className="!flex w-full cursor-pointer items-center gap-2 !rounded-sm !px-2 !py-1.5 !text-sm">
                        <FacebookIcon size={18} round />
                        Facebook
                      </FacebookShareButton>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <WhatsappShareButton url={shareUrl} title={messageText} className="!flex w-full cursor-pointer items-center gap-2 !rounded-sm !px-2 !py-1.5 !text-sm">
                        <WhatsappIcon size={18} round />
                        WhatsApp
                      </WhatsappShareButton>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <TwitterShareButton url={shareUrl} title={tweetText} hashtags={hashtags} className="!flex w-full cursor-pointer items-center gap-2 !rounded-sm !px-2 !py-1.5 !text-sm">
                        <XIcon size={18} round />
                        X (Twitter)
                      </TwitterShareButton>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <TelegramShareButton url={shareUrl} title={messageText} className="!flex w-full cursor-pointer items-center gap-2 !rounded-sm !px-2 !py-1.5 !text-sm">
                        <TelegramIcon size={18} round />
                        Telegram
                      </TelegramShareButton>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <EmailShareButton url={shareUrl} subject={emailSubject} body={`${messageText}\n\n`} className="!flex w-full cursor-pointer items-center gap-2 !rounded-sm !px-2 !py-1.5 !text-sm">
                        <EmailIcon size={18} round />
                        Email
                      </EmailShareButton>
                    </DropdownMenuItem>
                  </>
                );
              })()}
              <DropdownMenuItem onClick={handleCopyLink}>
                {copied ? (
                  <Check className="mr-2 size-4 text-se-fresh-deep" />
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
              className="relative aspect-[4/5] w-full max-w-xs cursor-pointer overflow-hidden rounded-sm shadow-lg shadow-border/80 sm:max-w-sm"
              style={primaryPhoto.fitMode === 'contain' ? { backgroundColor: '#f6f4ec' } : undefined}
              onClick={() => setLightboxUrl(primaryPhoto.url)}
            >
              <Image
                src={primaryPhoto.url}
                alt={dog.registeredName}
                fill
                style={{
                  objectFit: (primaryPhoto.fitMode as 'cover' | 'contain') || 'cover',
                  objectPosition: primaryPhoto.fitMode !== 'contain'
                    ? `${primaryPhoto.focalX ?? 50}% ${primaryPhoto.focalY ?? 50}%`
                    : undefined,
                }}
                sizes="(min-width: 640px) 384px, 320px"
                priority
              />
            </div>
          ) : canEdit ? (
            <Link
              href={`/dogs/${id}#photos`}
              className="group flex aspect-[4/5] w-full max-w-xs flex-col items-center justify-center gap-3 rounded-sm border-2 border-dashed border-border bg-muted/50 transition-colors hover:border-muted-foreground/30 hover:bg-muted sm:max-w-sm"
            >
              <Camera className="size-10 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                Add a profile photo
              </span>
            </Link>
          ) : (
            <div className="flex aspect-[4/5] w-full max-w-xs items-center justify-center rounded-sm bg-muted sm:max-w-sm">
              <Dog className="size-16 text-muted-foreground/40" />
            </div>
          )}
        </div>

        <Ornament />

        {/* Name and breed */}
        <div className="text-center">
          {titlePrefix && (
            <p className="mb-1 font-serif text-sm italic tracking-wide text-se-honey-deep/80 sm:text-base">
              {titlePrefix}
            </p>
          )}
          <h1 className={cn(SE_H, 'font-serif text-2xl leading-tight text-foreground sm:text-3xl md:text-4xl')}>
            {dog.registeredName}
          </h1>
          <p className="mt-2 text-[0.9375rem] text-muted-foreground">
            {dog.breed?.name ?? 'Unknown breed'}
            {dog.breed?.group && (
              <span className="text-muted-foreground/50"> &middot; </span>
            )}
            {dog.breed?.group && (
              <span className="text-muted-foreground">{dog.breed.group.name}</span>
            )}
          </p>
          {dog.bio && (
            <p className="mx-auto mt-4 max-w-md font-serif text-[0.9375rem] italic leading-relaxed text-muted-foreground">
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
                className="inline-flex items-center gap-1.5 rounded-sm border border-se-honey-line/60 bg-se-honey-soft/50 px-3 py-1 font-serif text-sm text-se-honey-deep"
              >
                {titleLabels[title.title] ?? title.title}
                {title.dateAwarded && (
                  <span className="text-xs text-se-honey-deep/70">
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
                  ? 'border-muted-foreground/30 bg-muted text-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground'
              }`}
            >
              <Heart
                className={`size-3.5 ${
                  followData?.following ? 'fill-muted-foreground text-muted-foreground' : ''
                }`}
              />
              {followData?.following ? 'Following' : 'Follow'}
            </button>
          )}
          {(followerCount?.count ?? 0) > 0 && (
            <span className="text-xs text-muted-foreground">
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
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <BookOpen className="size-3.5" />
            Profile
          </button>
          <button
            onClick={() => setActiveTab('timeline')}
            className={`inline-flex items-center gap-1.5 rounded-sm px-4 py-2 text-[0.8125rem] font-medium transition-colors ${
              activeTab === 'timeline'
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground'
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
              <div className="mt-2 h-8 w-px bg-border" />
              <StatBlock value={stats.totalClasses} label="Classes" />
              <div className="mt-2 h-8 w-px bg-border" />
              <StatBlock value={stats.firsts} label="1sts" accent="text-se-honey-deep" />
              <div className="mt-2 h-8 w-px bg-border" />
              <StatBlock value={stats.seconds} label="2nds" accent="text-muted-foreground" />
              <div className="mt-2 h-8 w-px bg-border" />
              <StatBlock value={stats.thirds} label="3rds" accent="text-se-honey-deep/70" />
              {stats.specialAwards > 0 && (
                <>
                  <div className="mt-2 h-8 w-px bg-border" />
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
                  className="group relative aspect-[4/3] cursor-pointer overflow-hidden rounded-sm bg-muted"
                  onClick={() => setLightboxUrl(photo.url)}
                >
                  <Image
                    src={photo.url}
                    alt={photo.caption || 'Photo'}
                    fill
                    className="transition-transform duration-300 group-hover:scale-105"
                    style={{
                      objectFit: (photo.fitMode as 'cover' | 'contain') || 'cover',
                      objectPosition: photo.fitMode !== 'contain'
                        ? `${photo.focalX ?? 50}% ${photo.focalY ?? 50}%`
                        : undefined,
                    }}
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
              <Trophy className="mx-auto size-8 text-muted-foreground/40" />
              <p className="mt-3 font-serif text-sm italic text-muted-foreground">
                No show results recorded yet
              </p>
            </div>
          ) : (
            <div className="relative ml-3 border-l border-border sm:ml-4">
              {showHistory.map((show, showIdx) => (
                <div key={`${show.showId}-${showIdx}`} className="relative pb-8 pl-6 last:pb-0 sm:pl-8">
                  {/* Timeline dot */}
                  <div className="absolute -left-[4.5px] top-[3px] size-[9px] rounded-full border-2 border-muted-foreground/30 bg-background" />

                  {/* Show header */}
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <Link
                      href={`/shows/${show.showSlug ?? show.showId}/results`}
                      className="group inline-flex items-baseline gap-1 font-serif text-base font-bold text-foreground hover:text-muted-foreground"
                    >
                      {show.showName}
                      <ExternalLink className="mb-px size-3 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" />
                    </Link>
                    <Badge
                      variant="outline"
                      className={`text-xs font-normal ${showTypeColors[show.showType] ?? ''}`}
                    >
                      {showTypeLabels[show.showType] ?? show.showType}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {format(parseISO(show.showDate), 'EEEE d MMMM yyyy')}
                  </p>

                  {/* Classes */}
                  <div className="mt-3 space-y-2">
                    {show.classes.map((cls, clsIdx) => (
                      <div key={clsIdx}>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.9375rem]">
                          {cls.classNumber != null && (
                            <span className="font-mono text-xs text-muted-foreground">
                              {cls.classNumber}.
                            </span>
                          )}
                          <span className="font-medium text-foreground">
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
                            <span className="inline-flex items-center gap-0.5 rounded-sm bg-se-honey-soft px-1.5 py-0.5 text-xs font-medium text-se-honey-deep ring-1 ring-inset ring-se-honey-line/50">
                              <Award className="size-2.5" />
                              {cls.specialAward}
                            </span>
                          )}
                        </div>
                        {cls.critiqueText && (
                          <blockquote className="mt-1.5 border-l-2 border-border pl-3 font-serif text-[0.8125rem] italic leading-relaxed text-muted-foreground">
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
                  // Sort by weight (prestige) desc, then date desc — using the
                  // effective type so a championship Best Bitch (= Bitch CC)
                  // ranks and reads as a CC.
                  const wa = achievementWeight[a.effectiveType ?? a.type] ?? 0;
                  const wb = achievementWeight[b.effectiveType ?? b.type] ?? 0;
                  if (wb !== wa) return wb - wa;
                  return b.date.localeCompare(a.date);
                })
                .map((achievement) => {
                  const effType = achievement.effectiveType ?? achievement.type;
                  const label = achievementLabels[effType] ?? effType;
                  const isPrestigious = (achievementWeight[effType] ?? 0) >= 7;
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
                          ? 'border-se-honey-line/60 bg-se-honey-soft/30'
                          : 'border-border bg-card'
                      }`}
                    >
                      <div
                        className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${
                          isPrestigious ? 'bg-se-honey-soft' : 'bg-muted'
                        }`}
                      >
                        {isPrestigious ? (
                          <Star className="size-3.5 text-se-honey-deep" />
                        ) : (
                          <Award className="size-3.5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-serif text-[0.9375rem] font-bold text-foreground">
                          {label}
                        </p>
                        <p className="text-xs text-muted-foreground">
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
          <p className="text-[0.6875rem] uppercase tracking-[0.3em] text-muted-foreground/50">
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
