'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { format, differenceInDays } from 'date-fns';

/** Safely convert string or Date to Date — handles superjson Date serialization */
function toDate(value: string | Date | null | undefined): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  return new Date(value);
}
import {
  CalendarDays,
  MapPin,
  Dog,
  Ticket,
  Plus,
  Loader2,
  Crown,
  Trophy,
  Award,
  AlertTriangle,
  Sparkles,
  Gavel,
  Rss,
  Clock,
  Eye,
  Star,
  ChevronRight,
  Flame,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc/client';
import { getPlacementLabel, placementColors } from '@/lib/placements';
import { OnboardingChecklist } from '@/components/dashboard/onboarding-checklist';
import { SecretaryCTA } from '@/components/dashboard/secretary-cta';

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const firstName = session?.user?.name?.split(' ')[0] ?? 'there';

  const { data, isLoading } = trpc.dashboard.getSummary.useQuery(undefined, {
    staleTime: 60_000,
  });

  const hasUpcomingEntry = !!data?.nextShow;
  const hasRecommendedShows = (data?.recommendedShows.length ?? 0) > 0;
  const promoteRecommended = !hasUpcomingEntry && hasRecommendedShows;

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Onboarding + Secretary CTA — only for new users */}
      <OnboardingChecklist />
      <SecretaryCTA />

      {isLoading ? (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 animate-ping rounded-full bg-amber-400/20" />
            <Loader2 className="relative size-8 animate-spin text-amber-600" />
          </div>
          <p className="text-sm text-muted-foreground">Loading your dashboard...</p>
        </div>
      ) : !data ? (
        <EmptyDashboard />
      ) : (
        <>
          {/* ─── Hero: Next Show or Find Shows CTA ─── */}
          {data.nextShow ? (
            <NextShowHero show={data.nextShow} firstName={firstName} />
          ) : (
            <FindShowsHero firstName={firstName} hasRecommended={hasRecommendedShows} />
          )}

          {/* ─── Deadline Alerts ─── */}
          {data.deadlineAlerts.length > 0 && (
            <div className="space-y-2">
              {data.deadlineAlerts.map((alert, i) => (
                <AlertCard key={i} alert={alert} />
              ))}
            </div>
          )}

          {/* ─── Dog Cards Strip ─── */}
          {data.ccProgress.length > 0 && (
            <DogCardsStrip dogs={data.ccProgress} />
          )}

          {/* ─── Promoted Recommended Shows ─── */}
          {promoteRecommended && (
            <section>
              <SectionHeader
                icon={Sparkles}
                iconBg="bg-emerald-100"
                iconColor="text-emerald-700"
                title="Shows for your breeds"
                subtitle="Accepting entries now"
                href="/browse"
                linkText="Browse all"
              />
              <div className="space-y-2.5">
                {data.recommendedShows.map((show) => (
                  <RecommendedShowCard key={show.showId} show={show} />
                ))}
              </div>
            </section>
          )}

          {/* ─── Recent Results with CC Celebration ─── */}
          {data.recentResults.length > 0 && (
            <section>
              <SectionHeader
                icon={Trophy}
                iconBg="bg-amber-100"
                iconColor="text-amber-700"
                title="Recent Results"
                subtitle="Last 60 days"
              />
              <div className="space-y-3">
                {data.recentResults.map((result, i) => (
                  <ResultCard key={i} result={result} />
                ))}
              </div>
            </section>
          )}

          {/* ─── CC Progress — Road to Champion ─── */}
          {data.ccProgress.length > 0 && (
            <section>
              <SectionHeader
                icon={Crown}
                iconBg="bg-amber-100"
                iconColor="text-amber-700"
                title="Championship Journey"
                subtitle="Road to Champion"
              />
              <div className="space-y-3">
                {data.ccProgress.map((dog) => (
                  <CCProgressCard key={dog.dogId} dog={dog} />
                ))}
              </div>
            </section>
          )}

          {/* ─── Judge Intelligence ─── */}
          {data.judgeIntel.length > 0 && (
            <section>
              <SectionHeader
                icon={Eye}
                iconBg="bg-violet-100"
                iconColor="text-violet-700"
                title="Judge Insights"
                subtitle="Who's judging your breeds"
              />
              <div className="space-y-2.5">
                {data.judgeIntel.map((item, i) => (
                  <JudgeIntelCard key={i} item={item} />
                ))}
              </div>
            </section>
          )}

          {/* ─── Feed Digest ─── */}
          {data.feedDigest.count > 0 && (
            <Link href="/feed" className="block">
              <div className="group flex items-center gap-3 rounded-2xl border border-border/40 bg-gradient-to-r from-primary/[0.04] to-transparent px-4 py-3.5 shadow-sm transition-all active:scale-[0.99]">
                <div className="flex size-11 items-center justify-center rounded-full bg-primary/10">
                  <Rss className="size-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-serif text-sm font-semibold">Activity Feed</p>
                  <p className="text-xs text-muted-foreground">
                    {data.feedDigest.count} new update{data.feedDigest.count !== 1 ? 's' : ''} from dogs you follow
                  </p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground transition-transform group-active:translate-x-0.5" />
              </div>
            </Link>
          )}

          {/* ─── Recommended Shows (normal position) ─── */}
          {!promoteRecommended && data.recommendedShows.length > 0 && (
            <section>
              <SectionHeader
                icon={Sparkles}
                iconBg="bg-emerald-100"
                iconColor="text-emerald-700"
                title="Recommended Shows"
                subtitle="Matching your breeds"
                href="/browse"
                linkText="Browse all"
              />
              <div className="space-y-2.5">
                {data.recommendedShows.map((show) => (
                  <RecommendedShowCard key={show.showId} show={show} />
                ))}
              </div>
            </section>
          )}

          {/* ─── Quick Actions ─── */}
          <div className="flex flex-col gap-2.5 pt-2 sm:flex-row">
            <Button size="lg" className="min-h-[2.75rem] gap-2 rounded-xl shadow-sm sm:flex-none" asChild>
              <Link href="/browse">
                <Search className="size-4" />
                Find a Show
              </Link>
            </Button>
            <Button variant="outline" size="lg" className="min-h-[2.75rem] gap-2 rounded-xl sm:flex-none" asChild>
              <Link href="/dogs/new">
                <Plus className="size-4" />
                Add a Dog
              </Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Section Header ─── */

function SectionHeader({
  icon: Icon,
  iconBg,
  iconColor,
  title,
  subtitle,
  href,
  linkText,
}: {
  icon: typeof Trophy;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle?: string;
  href?: string;
  linkText?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className={`flex size-8 items-center justify-center rounded-lg ${iconBg}`}>
          <Icon className={`size-4 ${iconColor}`} />
        </div>
        <div>
          <h2 className="font-serif text-sm font-semibold tracking-tight">{title}</h2>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>
      {href && (
        <Link href={href} className="text-xs font-medium text-primary hover:underline">
          {linkText ?? 'View all'}
        </Link>
      )}
    </div>
  );
}

/* ─── Empty Dashboard ─── */

function EmptyDashboard() {
  return (
    <div className="space-y-8">
      {/* Hero welcome */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-50 via-orange-50/80 to-amber-100/50 px-5 py-10 text-center">
        {/* Decorative circles */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-12 -top-12 size-40 rounded-full bg-amber-200/30 blur-2xl" />
          <div className="absolute -bottom-8 -left-8 size-32 rounded-full bg-orange-200/30 blur-2xl" />
          <div className="absolute right-1/4 top-1/3 size-24 rounded-full bg-amber-300/20 blur-xl" />
        </div>
        <div className="relative">
          <div className="mx-auto mb-5 flex size-20 items-center justify-center rounded-2xl bg-white/80 shadow-sm backdrop-blur-sm">
            <Dog className="size-10 text-amber-700" />
          </div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-amber-950">
            Welcome to Remi
          </h1>
          <p className="mx-auto mt-2.5 max-w-sm text-sm leading-relaxed text-amber-800/70">
            Your dog show companion. Add your first dog to get started with entries, results tracking, and championship progress.
          </p>
          <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
            <Button size="lg" className="min-h-[2.75rem] gap-2 rounded-xl bg-amber-700 shadow-md hover:bg-amber-800" asChild>
              <Link href="/dogs/new">
                <Plus className="size-4" />
                Add Your First Dog
              </Link>
            </Button>
            <Button variant="outline" size="lg" className="min-h-[2.75rem] gap-2 rounded-xl border-amber-300 bg-white/60 text-amber-900 hover:bg-white/80" asChild>
              <Link href="/browse">
                <CalendarDays className="size-4" />
                Browse Shows
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Feature hints */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex gap-3.5 rounded-2xl border border-border/40 bg-white/80 p-4 shadow-sm">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100">
            <Ticket className="size-5 text-emerald-700" />
          </div>
          <div>
            <p className="font-serif text-sm font-semibold">Enter shows online</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Find championship, open, and companion shows across the country.
            </p>
          </div>
        </div>
        <div className="flex gap-3.5 rounded-2xl border border-border/40 bg-white/80 p-4 shadow-sm">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100">
            <Trophy className="size-5 text-amber-700" />
          </div>
          <div>
            <p className="font-serif text-sm font-semibold">Track your results</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              See placements, CCs, and championship progress all in one place.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Next Show Hero ─── */

function NextShowHero({
  show,
  firstName,
}: {
  show: NonNullable<ReturnType<typeof trpc.dashboard.getSummary.useQuery>['data']>['nextShow'];
  firstName: string;
}) {
  if (!show) return null;
  const days = differenceInDays(toDate(show.showDate), new Date());
  const isToday = days <= 0;
  const isTomorrow = days === 1;
  const countdownText = isToday ? 'Show day!' : isTomorrow ? 'Tomorrow' : `${days} days`;
  const subText = isToday ? 'Good luck in the ring!' : isTomorrow ? 'Almost time!' : 'until show day';

  return (
    <Link href={`/entries/${show.entryId}`} className="block">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-600 via-amber-700 to-orange-800 px-5 py-5 text-white shadow-lg shadow-amber-900/20 transition-all active:scale-[0.99] sm:py-6">
        {/* Background decoration */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-8 -top-8 size-32 rounded-full bg-white/[0.07] blur-xl" />
          <div className="absolute -bottom-6 -left-6 size-24 rounded-full bg-amber-400/20 blur-lg" />
          {isToday && (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.1),transparent_60%)]" />
          )}
        </div>

        <div className="relative">
          {/* Greeting + label */}
          <p className="text-xs font-medium uppercase tracking-widest text-amber-200/80">
            {getTimeGreeting()}, {firstName}
          </p>

          {/* Show name */}
          <h1 className="mt-2 font-serif text-xl font-bold leading-tight tracking-tight sm:text-2xl">
            {show.showName}
          </h1>

          {/* Show details */}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-amber-100/80">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-3.5" />
              {format(toDate(show.showDate), 'EEE d MMM yyyy')}
            </span>
            {show.venueName && (
              <span className="flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                {show.venueName}
              </span>
            )}
          </div>

          {/* Dog + classes */}
          <div className="mt-2 flex items-center gap-1.5 text-sm text-amber-100/70">
            <Dog className="size-3.5 shrink-0" />
            <span className="font-medium text-amber-100/90">{show.dogName}</span>
            <span className="text-amber-200/40">&middot;</span>
            <span className="truncate">
              {show.classes.map((c: { className: string; classNumber: number | null }) =>
                c.classNumber ? `${c.classNumber}. ${c.className}` : c.className
              ).join(', ')}
            </span>
          </div>

          {/* Countdown pill */}
          <div className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-white/15 px-4 py-2 backdrop-blur-sm">
            <span className="font-serif text-2xl font-bold tabular-nums sm:text-3xl">
              {isToday ? (
                <Flame className="inline-block size-6 text-amber-300" />
              ) : (
                days
              )}
            </span>
            <div className="text-left">
              <p className="text-xs font-semibold leading-tight text-white/90">{countdownText}</p>
              <p className="text-[10px] text-amber-200/70">{subText}</p>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

/* ─── Find Shows Hero (no upcoming entry) ─── */

function FindShowsHero({ firstName, hasRecommended }: { firstName: string; hasRecommended: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 px-5 py-6 text-white shadow-lg">
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-10 -top-10 size-36 rounded-full bg-amber-500/10 blur-2xl" />
        <div className="absolute -bottom-6 -left-6 size-24 rounded-full bg-violet-500/10 blur-xl" />
      </div>

      <div className="relative">
        <p className="text-xs font-medium uppercase tracking-widest text-slate-400">
          {getTimeGreeting()}, {firstName}
        </p>
        <h1 className="mt-2 font-serif text-xl font-bold tracking-tight sm:text-2xl">
          {hasRecommended ? 'Ready for the ring?' : 'Find your next show'}
        </h1>
        <p className="mt-1.5 text-sm text-slate-300/80">
          {hasRecommended
            ? 'We found shows matching your breeds. Take a look below.'
            : 'Browse upcoming championship and open shows near you.'}
        </p>
        <Button
          size="lg"
          className="mt-4 min-h-[2.75rem] gap-2 rounded-xl bg-amber-600 text-white shadow-md hover:bg-amber-500"
          asChild
        >
          <Link href="/browse">
            <Search className="size-4" />
            Browse Shows
          </Link>
        </Button>
      </div>
    </div>
  );
}

/* ─── Dog Cards Strip (horizontal scroll) ─── */

function DogCardsStrip({ dogs }: {
  dogs: {
    dogId: string;
    dogName: string;
    breedName: string | null;
    photoUrl: string | null;
    ccCount: number;
    isChampion: boolean;
  }[];
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-serif text-sm font-semibold tracking-tight">Your Dogs</h2>
        <Link href="/dogs" className="text-xs font-medium text-primary hover:underline">
          View all
        </Link>
      </div>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:-mx-0 sm:px-0 scrollbar-none">
        {dogs.map((dog) => (
          <Link
            key={dog.dogId}
            href={`/dogs/${dog.dogId}`}
            className="flex min-w-[8rem] shrink-0 flex-col items-center rounded-2xl border border-border/40 bg-white/80 px-4 py-4 shadow-sm transition-all active:scale-[0.97] active:bg-accent/30"
          >
            {/* Avatar */}
            {dog.photoUrl ? (
              <img
                src={dog.photoUrl}
                alt=""
                className={`size-16 rounded-full object-cover shadow-sm ${
                  dog.isChampion
                    ? 'ring-2 ring-amber-400 ring-offset-2'
                    : 'ring-1 ring-border/40'
                }`}
              />
            ) : (
              <div className={`flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-slate-100 to-slate-200 shadow-sm ${
                dog.isChampion ? 'ring-2 ring-amber-400 ring-offset-2' : 'ring-1 ring-border/40'
              }`}>
                <Dog className="size-7 text-slate-400" />
              </div>
            )}
            {/* Name */}
            <p className="mt-2.5 max-w-[7rem] truncate text-center font-serif text-xs font-semibold">
              {dog.isChampion && <span className="text-amber-600">Ch </span>}
              {dog.dogName}
            </p>
            {/* Breed */}
            {dog.breedName && (
              <p className="mt-0.5 max-w-[7rem] truncate text-center text-[10px] text-muted-foreground">
                {dog.breedName}
              </p>
            )}
            {/* Quick stat */}
            {dog.ccCount > 0 && (
              <div className="mt-2 flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5">
                <Crown className="size-2.5 text-amber-700" />
                <span className="text-[10px] font-semibold text-amber-800">
                  {dog.ccCount} CC{dog.ccCount !== 1 ? 's' : ''}
                </span>
              </div>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ─── Deadline Alert ─── */

function AlertCard({ alert }: { alert: { type: string; message: string; showId?: string; showSlug?: string; entryId?: string } }) {
  const href = alert.entryId
    ? `/entries/${alert.entryId}`
    : alert.showSlug
      ? `/shows/${alert.showSlug}`
      : alert.showId
        ? `/shows/${alert.showId}`
        : '/browse';

  return (
    <Link href={href}>
      <div className="flex items-center gap-3 rounded-xl border border-amber-200/60 bg-gradient-to-r from-amber-50/80 to-transparent px-4 py-3 shadow-sm transition-all active:scale-[0.99]">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-100">
          <AlertTriangle className="size-4 text-amber-600" />
        </div>
        <p className="flex-1 text-sm text-amber-900">{alert.message}</p>
        <ChevronRight className="size-4 shrink-0 text-amber-400" />
      </div>
    </Link>
  );
}

/* ─── Recent Result Card (with CC celebration) ─── */

function ResultCard({ result }: { result: { dogId: string | null; dogName: string | null; dogPhotoUrl: string | null; showName: string; showDate: string; placements: { className: string; placement: number | null; specialAward: string | null }[]; ccAwarded: boolean } }) {
  if (result.ccAwarded) {
    return <CCResultCard result={result} />;
  }

  return (
    <div className="rounded-2xl border border-border/40 bg-white/80 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        {/* Dog photo */}
        {result.dogPhotoUrl ? (
          <img src={result.dogPhotoUrl} alt="" className="size-11 shrink-0 rounded-full object-cover ring-1 ring-border/40" />
        ) : (
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-100 to-slate-200">
            <Dog className="size-5 text-slate-400" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-serif text-sm font-semibold">{result.dogName ?? 'Unknown'}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {result.showName} &middot; {format(toDate(result.showDate), 'd MMM')}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {result.placements.map((p, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-xs">
                {p.placement && (
                  <Badge variant="outline" className={`rounded-md text-[10px] font-semibold ${placementColors[p.placement] ?? ''}`}>
                    {getPlacementLabel(p.placement)}
                  </Badge>
                )}
                <span className="text-muted-foreground">{p.className}</span>
                {p.specialAward && (
                  <Badge variant="secondary" className="rounded-md text-[10px] bg-amber-50 text-amber-700">
                    <Award className="mr-0.5 size-2.5" />
                    {p.specialAward}
                  </Badge>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── CC Result Card — Celebration Style ─── */

function CCResultCard({ result }: { result: { dogId: string | null; dogName: string | null; dogPhotoUrl: string | null; showName: string; showDate: string; placements: { className: string; placement: number | null; specialAward: string | null }[] } }) {
  return (
    <div className="cc-shimmer relative overflow-hidden rounded-2xl border-2 border-amber-300/60 bg-gradient-to-br from-amber-50 via-yellow-50/50 to-amber-50/30 p-4 shadow-md shadow-amber-200/30">
      {/* Gold shimmer overlay — animated via globals.css */}
      <div className="cc-shimmer-bar pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-amber-200/20 to-transparent" />

      <div className="relative flex items-start gap-3">
        {/* Dog photo with gold ring */}
        {result.dogPhotoUrl ? (
          <img src={result.dogPhotoUrl} alt="" className="size-12 shrink-0 rounded-full object-cover ring-2 ring-amber-400 ring-offset-2" />
        ) : (
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-amber-200 ring-2 ring-amber-400 ring-offset-2">
            <Dog className="size-6 text-amber-700" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-serif text-sm font-bold text-amber-900">{result.dogName ?? 'Unknown'}</p>
            <div className="flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-0.5 text-white shadow-sm">
              <Crown className="size-3" />
              <span className="text-[10px] font-bold tracking-wide">CC</span>
            </div>
          </div>
          <p className="mt-0.5 text-xs text-amber-700/70">
            {result.showName} &middot; {format(toDate(result.showDate), 'd MMM')}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {result.placements.map((p, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-xs">
                {p.placement && (
                  <Badge variant="outline" className={`rounded-md text-[10px] font-semibold ${placementColors[p.placement] ?? ''}`}>
                    {getPlacementLabel(p.placement)}
                  </Badge>
                )}
                <span className="text-amber-800/60">{p.className}</span>
                {p.specialAward && (
                  <Badge className="rounded-md border-amber-300 bg-amber-100 text-[10px] text-amber-800">
                    <Award className="mr-0.5 size-2.5" />
                    {p.specialAward}
                  </Badge>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── CC Progress — Road to Champion ─── */

function CCProgressCard({ dog }: { dog: { dogId: string; dogName: string; breedName: string | null; photoUrl: string | null; ccCount: number; rccCount: number; distinctJudgeCount: number; isChampion: boolean } }) {
  const traditionalProgress = Math.min(dog.ccCount, 3);
  const alternativeProgress = dog.ccCount >= 2 ? Math.min(dog.rccCount, 5) : 0;
  const isTraditionalCloser = (3 - traditionalProgress) <= (5 - alternativeProgress + (dog.ccCount < 2 ? 2 - dog.ccCount : 0));

  // Circles for the 3-CC journey
  const ccSlots = [0, 1, 2];
  const earnedCCs = Math.min(dog.ccCount, 3);

  return (
    <Link href={`/dogs/${dog.dogId}`} className="block">
      <div className="rounded-2xl border border-border/40 bg-white/80 p-4 shadow-sm transition-all active:scale-[0.99]">
        <div className="flex items-center gap-3">
          {/* Dog photo */}
          {dog.photoUrl ? (
            <img
              src={dog.photoUrl}
              alt=""
              className={`size-12 shrink-0 rounded-full object-cover ${
                dog.isChampion
                  ? 'ring-2 ring-amber-400 ring-offset-2'
                  : 'ring-1 ring-border/40'
              }`}
            />
          ) : (
            <div className={`flex size-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-100 to-slate-200 ${
              dog.isChampion ? 'ring-2 ring-amber-400 ring-offset-2' : 'ring-1 ring-border/40'
            }`}>
              <Dog className="size-6 text-slate-400" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-serif text-sm font-semibold">
              {dog.isChampion && <span className="text-amber-600">Ch </span>}
              {dog.dogName}
            </p>
            {dog.breedName && (
              <p className="text-[11px] text-muted-foreground">{dog.breedName}</p>
            )}
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground/40" />
        </div>

        {/* Champion celebration */}
        {dog.isChampion ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-100/80 to-amber-50/50 px-3 py-2.5">
            <Sparkles className="size-4 text-amber-600" />
            <div>
              <p className="text-xs font-semibold text-amber-800">Champion</p>
              <p className="text-[10px] text-amber-700/70">
                {dog.ccCount} CC{dog.ccCount !== 1 ? 's' : ''} &middot; {dog.rccCount} RCC{dog.rccCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* CC Journey circles */}
            <div className="mt-3.5 flex items-center justify-center gap-4">
              {ccSlots.map((slot) => {
                const isFilled = slot < earnedCCs;
                return (
                  <div key={slot} className="flex flex-col items-center gap-1.5">
                    <div
                      className={`flex size-10 items-center justify-center rounded-full border-2 transition-all ${
                        isFilled
                          ? 'border-amber-400 bg-gradient-to-br from-amber-400 to-amber-500 shadow-md shadow-amber-300/30'
                          : 'border-dashed border-slate-300 bg-slate-50'
                      }`}
                    >
                      {isFilled ? (
                        <Crown className="size-4 text-white" />
                      ) : (
                        <span className="text-xs font-medium text-slate-400">{slot + 1}</span>
                      )}
                    </div>
                    <span className={`text-[9px] font-medium ${isFilled ? 'text-amber-700' : 'text-slate-400'}`}>
                      CC {slot + 1}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Status text */}
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              {dog.ccCount === 0 && 'Needs 3 CCs under 3 different judges'}
              {dog.ccCount === 1 && '1 CC earned \u2014 2 more needed under new judges'}
              {dog.ccCount === 2 && '2 CCs earned \u2014 1 more to go!'}
              {dog.ccCount >= 3 && !dog.isChampion && 'All CCs earned \u2014 confirming championship'}
            </p>

            {/* RCC note if applicable */}
            {dog.rccCount > 0 && (
              <p className="mt-1 text-center text-[10px] text-muted-foreground/70">
                Also: {dog.rccCount} RCC{dog.rccCount !== 1 ? 's' : ''}
                {!isTraditionalCloser && dog.ccCount >= 2 && ` (${dog.rccCount}/5 for alternative route)`}
              </p>
            )}
          </>
        )}
      </div>
    </Link>
  );
}

/* ─── Judge Intelligence Card ─── */

function JudgeIntelCard({ item }: { item: { showId: string; showName: string; showSlug: string | null; showDate: string; judgeName: string; breedName: string; alreadyEntered: boolean } }) {
  return (
    <Link href={`/shows/${item.showSlug ?? item.showId}`}>
      <div className="flex items-center gap-3 rounded-2xl border border-violet-200/40 bg-gradient-to-r from-violet-50/60 to-transparent px-4 py-3 shadow-sm transition-all active:scale-[0.99]">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-100">
          <Gavel className="size-4 text-violet-700" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-serif text-sm font-semibold text-violet-950">{item.judgeName}</p>
          <p className="mt-0.5 truncate text-xs text-violet-700/60">
            {item.breedName} &middot; {item.showName}
          </p>
          <p className="text-[10px] text-violet-600/50">
            {format(toDate(item.showDate), 'EEE d MMM yyyy')}
          </p>
        </div>
        {item.alreadyEntered ? (
          <Badge variant="secondary" className="shrink-0 rounded-lg text-[10px]">Entered</Badge>
        ) : (
          <Badge className="shrink-0 rounded-lg bg-violet-600 text-[10px] hover:bg-violet-700">
            <Ticket className="mr-0.5 size-3" />
            Enter
          </Badge>
        )}
      </div>
    </Link>
  );
}

/* ─── Recommended Show Card ─── */

function RecommendedShowCard({ show }: { show: { showId: string; showName: string; showSlug: string | null; startDate: string; entryCloseDate: Date | null; venueName: string | null; breedNames: string[] } }) {
  const daysToClose = show.entryCloseDate ? differenceInDays(new Date(show.entryCloseDate), new Date()) : null;
  const isUrgent = daysToClose !== null && daysToClose >= 0 && daysToClose <= 3;

  return (
    <Link href={`/shows/${show.showSlug ?? show.showId}`}>
      <div className="rounded-2xl border border-border/40 bg-white/80 p-4 shadow-sm transition-all active:scale-[0.99]">
        <div className="flex items-start gap-3">
          <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
            isUrgent ? 'bg-red-100' : 'bg-emerald-100'
          }`}>
            {isUrgent ? (
              <Clock className="size-4 text-red-600" />
            ) : (
              <CalendarDays className="size-4 text-emerald-700" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-serif text-sm font-semibold">{show.showName}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {format(toDate(show.startDate), 'EEE d MMM yyyy')}
              {show.venueName && ` \u2014 ${show.venueName}`}
            </p>
            {/* Breed match tags */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {show.breedNames.map((b) => (
                <span
                  key={b}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700"
                >
                  <Star className="size-2.5" />
                  {b}
                </span>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {daysToClose !== null && daysToClose >= 0 && daysToClose <= 14 && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                isUrgent
                  ? 'bg-red-100 text-red-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {daysToClose === 0 ? 'Closes today' : `${daysToClose}d left`}
              </span>
            )}
            <Badge className="rounded-lg bg-primary text-[10px]">
              <Ticket className="mr-0.5 size-3" />
              Enter
            </Badge>
          </div>
        </div>
      </div>
    </Link>
  );
}
