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
  CreditCard,
  Timer,
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
import { cn } from '@/lib/utils';
import { getPlacementLabel, placementColors } from '@/lib/placements';
import { OnboardingChecklist } from '@/components/dashboard/onboarding-checklist';
import { SecretaryCTA } from '@/components/dashboard/secretary-cta';
import { RolePickerBanner } from '@/components/dashboard/role-picker-banner';
import { SE_H } from '@/components/show-experience/tokens';

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
      {/* Multi-role quick switch + onboarding + secretary CTA */}
      <RolePickerBanner />
      <OnboardingChecklist />
      <SecretaryCTA />

      {isLoading ? (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
            <Loader2 className="relative size-8 animate-spin text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">Loading your dashboard...</p>
        </div>
      ) : !data ? (
        <EmptyDashboard />
      ) : (
        <>
          {/* ─── Hero: Next Show or Find Shows CTA ─── */}
          {data.nextShow ? (
            <>
              <NextShowHero show={data.nextShow} firstName={firstName} />
              {/* Even with an entry already in, exhibitors need an obvious way to
                  browse other shows and read their (public) schedules — there was
                  no browse affordance in this state at all (Mandy 2026-06-13). */}
              <Button asChild variant="outline" className="w-full min-h-[2.75rem] gap-2">
                <Link href="/browse">
                  <Search className="size-4" />
                  View all shows
                </Link>
              </Button>
            </>
          ) : (
            <FindShowsHero firstName={firstName} hasRecommended={hasRecommendedShows} />
          )}

          {/* ─── Action Items (grouped by show) ─── */}
          {data.deadlineAlerts.length > 0 && (
            <ActionItems alerts={data.deadlineAlerts} />
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
                iconBg="bg-se-fresh-soft"
                iconColor="text-se-fresh-deep"
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

          {/* ─── Judge Intelligence (actionable — who's judging upcoming shows) ─── */}
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

          {/* ─── Recent Results with CC Celebration ─── */}
          {data.recentResults.length > 0 && (
            <section>
              <SectionHeader
                icon={Trophy}
                iconBg="bg-se-honey-soft"
                iconColor="text-se-honey-deep"
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
                iconBg="bg-se-honey-soft"
                iconColor="text-se-honey-deep"
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

          {/* Judge Intelligence moved above results (it's actionable) */}

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

          {/* ─── Dog Profile Nudge ─── */}
          {data.ccProgress.length > 0 && data.ccProgress.some((d) => !d.photoUrl) && (
            <Link href="/dogs" className="block">
              <div className="flex items-center gap-3 rounded-2xl border border-se-honey/60 bg-gradient-to-r from-se-honey-soft/80 to-transparent px-4 py-3 transition-all active:scale-[0.99]">
                <div className="flex size-9 items-center justify-center rounded-full bg-se-honey-soft">
                  <Star className="size-4 text-se-honey-deep" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-se-honey-ink">Complete your dog profiles</p>
                  <p className="text-xs text-se-honey-deep/70">Add photos to make your dogs stand out in entries and catalogues</p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-se-honey" />
              </div>
            </Link>
          )}

          {/* ─── Recommended Shows (normal position — before results since they're actionable) ─── */}
          {!promoteRecommended && data.recommendedShows.length > 0 && (
            <section>
              <SectionHeader
                icon={Sparkles}
                iconBg="bg-se-fresh-soft"
                iconColor="text-se-fresh-deep"
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
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-se-honey-soft via-se-cream/80 to-se-honey-soft/50 px-5 py-10 text-center">
        {/* Decorative circles */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-12 -top-12 size-40 rounded-full bg-se-honey-line/40 blur-2xl" />
          <div className="absolute -bottom-8 -left-8 size-32 rounded-full bg-se-cream/60 blur-2xl" />
          <div className="absolute right-1/4 top-1/3 size-24 rounded-full bg-se-honey/20 blur-xl" />
        </div>
        <div className="relative">
          <div className="mx-auto mb-5 flex size-20 items-center justify-center rounded-2xl bg-se-surface/80 shadow-sm backdrop-blur-sm">
            <Dog className="size-10 text-se-honey-deep" />
          </div>
          <h1 className={cn(SE_H, 'text-2xl text-se-ink')}>
            Welcome to Remi
          </h1>
          <p className="mx-auto mt-2.5 max-w-sm text-sm leading-relaxed text-se-ink2/70">
            Your dog show companion. Add your first dog to get started with entries, results tracking, and championship progress.
          </p>
          <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
            <Button size="lg" className="min-h-[2.75rem] gap-2 rounded-xl shadow-md" asChild>
              <Link href="/dogs/new">
                <Plus className="size-4" />
                Add Your First Dog
              </Link>
            </Button>
            <Button variant="outline" size="lg" className="min-h-[2.75rem] gap-2 rounded-xl border-se-honey-line bg-se-surface/60 text-se-honey-ink hover:bg-se-surface/80" asChild>
              <Link href="/browse">
                <CalendarDays className="size-4" />
                View all shows
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Feature hints */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex gap-3.5 rounded-2xl border border-border/40 bg-se-surface/80 p-4 shadow-sm">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-se-fresh-soft">
            <Ticket className="size-5 text-se-fresh-deep" />
          </div>
          <div>
            <p className="font-serif text-sm font-semibold">Enter shows online</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Find championship, open, and companion shows across the country.
            </p>
          </div>
        </div>
        <div className="flex gap-3.5 rounded-2xl border border-border/40 bg-se-surface/80 p-4 shadow-sm">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-se-honey-soft">
            <Trophy className="size-5 text-se-honey-deep" />
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
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-se-deep to-se-deepest px-5 py-5 text-se-cream shadow-lg shadow-se-deepest/30 transition-all active:scale-[0.99] sm:py-6">
        {/* Background decoration */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-8 -top-8 size-32 rounded-full bg-white/[0.07] blur-xl" />
          <div className="absolute -bottom-6 -left-6 size-24 rounded-full bg-se-honey/20 blur-lg" />
          {isToday && (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.1),transparent_60%)]" />
          )}
        </div>

        <div className="relative">
          {/* Greeting + label */}
          <p className="text-xs font-medium uppercase tracking-widest text-se-cream/70">
            {getTimeGreeting()}, {firstName}
          </p>

          {/* Show name */}
          <h1 className={cn(SE_H, 'mt-2 text-xl leading-tight sm:text-2xl')}>
            {show.showName}
          </h1>

          {/* Show details */}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-se-cream/80">
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
          <div className="mt-2 flex items-center gap-1.5 text-sm text-se-cream/70">
            <Dog className="size-3.5 shrink-0" />
            <span className="font-medium text-se-cream/90">{show.dogName}</span>
            <span className="text-se-cream/40">&middot;</span>
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
                <Flame className="inline-block size-6 text-se-honey" />
              ) : (
                days
              )}
            </span>
            <div className="text-left">
              <p className="text-xs font-semibold leading-tight text-white/90">{countdownText}</p>
              <p className="text-xs text-se-cream/70">{subText}</p>
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
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-se-deep to-se-deepest px-5 py-6 text-se-cream shadow-lg">
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-10 -top-10 size-36 rounded-full bg-se-honey/10 blur-2xl" />
        <div className="absolute -bottom-6 -left-6 size-24 rounded-full bg-se-fresh/10 blur-xl" />
      </div>

      <div className="relative">
        <p className="text-xs font-medium uppercase tracking-widest text-se-cream/70">
          {getTimeGreeting()}, {firstName}
        </p>
        <h1 className={cn(SE_H, 'mt-2 text-xl sm:text-2xl')}>
          {hasRecommended ? 'Ready for the ring?' : 'Find your next show'}
        </h1>
        <p className="mt-1.5 text-sm text-se-cream/80">
          {hasRecommended
            ? 'We found shows matching your breeds. Take a look below.'
            : 'Browse upcoming championship and open shows near you.'}
        </p>
        <Button
          size="lg"
          className="mt-4 min-h-[2.75rem] gap-2 rounded-xl bg-se-fresh text-[#0e2c19] shadow-md hover:bg-se-fresh/90"
          asChild
        >
          <Link href="/browse">
            <Search className="size-4" />
            View all shows
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
            className="flex min-w-[8rem] shrink-0 flex-col items-center rounded-2xl border border-border/40 bg-se-surface/80 px-4 py-4 shadow-sm transition-all active:scale-[0.97] active:bg-accent/30"
          >
            {/* Avatar */}
            {dog.photoUrl ? (
              <img
                src={dog.photoUrl}
                alt=""
                className={`size-16 rounded-full object-cover shadow-sm ${
                  dog.isChampion
                    ? 'ring-2 ring-se-honey ring-offset-2'
                    : 'ring-1 ring-border/40'
                }`}
              />
            ) : (
              <div className={`flex size-16 items-center justify-center rounded-full bg-muted shadow-sm ${
                dog.isChampion ? 'ring-2 ring-se-honey ring-offset-2' : 'ring-1 ring-border/40'
              }`}>
                <Dog className="size-7 text-muted-foreground" />
              </div>
            )}
            {/* Name */}
            <p className="mt-2.5 max-w-[7rem] truncate text-center font-serif text-xs font-semibold">
              {dog.isChampion && <span className="text-se-honey-deep">Ch </span>}
              {dog.dogName}
            </p>
            {/* Breed */}
            {dog.breedName && (
              <p className="mt-0.5 max-w-[7rem] truncate text-center text-xs text-muted-foreground">
                {dog.breedName}
              </p>
            )}
            {/* Quick stat */}
            {dog.ccCount > 0 && (
              <div className="mt-2 flex items-center gap-1 rounded-full bg-se-honey-soft px-2 py-0.5">
                <Crown className="size-2.5 text-se-honey-deep" />
                <span className="text-xs font-semibold text-se-honey-ink">
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

/* ─── Action Items — grouped by show, with inline actions ─── */

type Alert = { type: 'closing_soon' | 'pending_payment'; message: string; showId: string; showName: string; showSlug: string | null; entryId?: string; entryCloseDate?: Date | null };

function ActionItems({ alerts }: { alerts: Alert[] }) {
  // Group alerts by show + type
  const groups = new Map<string, { type: string; showName: string; showSlug: string | null; showId: string; entryIds: string[]; entryCloseDate?: Date | null; count: number }>();

  for (const alert of alerts) {
    const key = `${alert.showId ?? 'unknown'}:${alert.type}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count++;
      if (alert.entryId) existing.entryIds.push(alert.entryId);
    } else {
      groups.set(key, {
        type: alert.type,
        showName: alert.showName ?? 'Unknown Show',
        showSlug: alert.showSlug ?? null,
        showId: alert.showId ?? '',
        entryIds: alert.entryId ? [alert.entryId] : [],
        entryCloseDate: alert.entryCloseDate ? toDate(alert.entryCloseDate) : null,
        count: 1,
      });
    }
  }

  const groupList = Array.from(groups.values());
  const paymentGroups = groupList.filter((g) => g.type === 'pending_payment');
  const closingGroups = groupList.filter((g) => g.type === 'closing_soon');

  return (
    <div className="space-y-3">
      {/* Payment needed */}
      {paymentGroups.length > 0 && (
        <div className="rounded-2xl border border-rose-200/60 bg-gradient-to-br from-rose-50/80 to-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-rose-100">
              <CreditCard className="size-3.5 text-rose-600" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-rose-700">
              Payment needed
            </p>
          </div>
          <div className="space-y-2">
            {paymentGroups.map((group) => {
              const href = group.entryIds.length === 1
                ? `/entries/${group.entryIds[0]}`
                : group.showSlug ? `/shows/${group.showSlug}` : `/shows/${group.showId}`;
              return (
                <Link key={`pay-${group.showId}`} href={href}>
                  <div className="flex items-center justify-between rounded-xl bg-white/80 px-3 py-2.5 ring-1 ring-rose-100 transition-all active:scale-[0.99]">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-serif text-sm font-medium text-rose-900">{group.showName}</p>
                      <p className="text-[11px] text-rose-600/70">
                        {group.count} {group.count === 1 ? 'entry' : 'entries'} unpaid
                      </p>
                    </div>
                    <div className="ml-2 flex shrink-0 items-center gap-1.5">
                      <span className="rounded-full bg-rose-600 px-3 py-1 text-[11px] font-semibold text-white">
                        Pay
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Closing soon */}
      {closingGroups.length > 0 && (
        <div className="rounded-2xl border border-blue-200/60 bg-gradient-to-br from-blue-50/80 to-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-blue-100">
              <Timer className="size-3.5 text-blue-600" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">
              Closing soon
            </p>
          </div>
          <div className="space-y-2">
            {closingGroups.map((group) => {
              const href = group.showSlug ? `/shows/${group.showSlug}` : `/shows/${group.showId}`;
              const daysLeft = group.entryCloseDate
                ? differenceInDays(group.entryCloseDate, new Date())
                : null;
              return (
                <Link key={`close-${group.showId}`} href={href}>
                  <div className="flex items-center justify-between rounded-xl bg-white/80 px-3 py-2.5 ring-1 ring-blue-100 transition-all active:scale-[0.99]">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-serif text-sm font-medium text-blue-900">{group.showName}</p>
                      {daysLeft != null && (
                        <p className="text-[11px] text-blue-600/70">
                          {daysLeft <= 0 ? 'Closes today!' : daysLeft === 1 ? 'Closes tomorrow' : `${daysLeft} days left`}
                        </p>
                      )}
                    </div>
                    <div className="ml-2 flex shrink-0 items-center gap-1.5">
                      <span className="rounded-full bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white">
                        Enter
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Recent Result Card (with CC celebration) ─── */

function ResultCard({ result }: { result: { dogId: string | null; dogName: string | null; dogPhotoUrl: string | null; showName: string; showDate: string; placements: { className: string; placement: number | null; specialAward: string | null }[]; ccAwarded: boolean } }) {
  if (result.ccAwarded) {
    return <CCResultCard result={result} />;
  }

  return (
    <div className="rounded-2xl border border-border/40 bg-se-surface/80 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        {/* Dog photo */}
        {result.dogPhotoUrl ? (
          <img src={result.dogPhotoUrl} alt="" className="size-11 shrink-0 rounded-full object-cover ring-1 ring-border/40" />
        ) : (
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted">
            <Dog className="size-5 text-muted-foreground" />
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
                  <Badge variant="outline" className={`rounded-md text-xs font-semibold ${placementColors[p.placement] ?? ''}`}>
                    {getPlacementLabel(p.placement)}
                  </Badge>
                )}
                <span className="text-muted-foreground">{p.className}</span>
                {p.specialAward && (
                  <Badge variant="secondary" className="rounded-md text-xs bg-se-honey-soft text-se-honey-deep">
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
    <div className="cc-shimmer relative overflow-hidden rounded-2xl border-2 border-se-honey/60 bg-gradient-to-br from-se-honey-soft via-se-cream/50 to-se-honey-soft/30 p-4 shadow-md shadow-se-honey/20">
      {/* Gold shimmer overlay — animated via globals.css */}
      <div className="cc-shimmer-bar pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-se-honey-line/30 to-transparent" />

      <div className="relative flex items-start gap-3">
        {/* Dog photo with gold ring */}
        {result.dogPhotoUrl ? (
          <img src={result.dogPhotoUrl} alt="" className="size-12 shrink-0 rounded-full object-cover ring-2 ring-se-honey ring-offset-2" />
        ) : (
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-se-honey-soft to-se-honey-line ring-2 ring-se-honey ring-offset-2">
            <Dog className="size-6 text-se-honey-deep" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-serif text-sm font-bold text-se-honey-ink">{result.dogName ?? 'Unknown'}</p>
            <div className="flex items-center gap-1 rounded-full bg-se-honey px-2.5 py-0.5 text-white shadow-sm">
              <Crown className="size-3" />
              <span className="text-xs font-bold tracking-wide">CC</span>
            </div>
          </div>
          <p className="mt-0.5 text-xs text-se-honey-deep/70">
            {result.showName} &middot; {format(toDate(result.showDate), 'd MMM')}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {result.placements.map((p, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-xs">
                {p.placement && (
                  <Badge variant="outline" className={`rounded-md text-xs font-semibold ${placementColors[p.placement] ?? ''}`}>
                    {getPlacementLabel(p.placement)}
                  </Badge>
                )}
                <span className="text-se-honey-ink/60">{p.className}</span>
                {p.specialAward && (
                  <Badge className="rounded-md border-se-honey-line bg-se-honey-soft text-xs text-se-honey-ink">
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
      <div className="rounded-2xl border border-border/40 bg-se-surface/80 p-4 shadow-sm transition-all active:scale-[0.99]">
        <div className="flex items-center gap-3">
          {/* Dog photo */}
          {dog.photoUrl ? (
            <img
              src={dog.photoUrl}
              alt=""
              className={`size-12 shrink-0 rounded-full object-cover ${
                dog.isChampion
                  ? 'ring-2 ring-se-honey ring-offset-2'
                  : 'ring-1 ring-border/40'
              }`}
            />
          ) : (
            <div className={`flex size-12 shrink-0 items-center justify-center rounded-full bg-muted ${
              dog.isChampion ? 'ring-2 ring-se-honey ring-offset-2' : 'ring-1 ring-border/40'
            }`}>
              <Dog className="size-6 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-serif text-sm font-semibold">
              {dog.isChampion && <span className="text-se-honey-deep">Ch </span>}
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
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-gradient-to-r from-se-honey-soft/80 to-se-honey-soft/50 px-3 py-2.5">
            <Sparkles className="size-4 text-se-honey-deep" />
            <div>
              <p className="text-xs font-semibold text-se-honey-ink">Champion</p>
              <p className="text-xs text-se-honey-deep/70">
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
                          ? 'border-se-honey bg-gradient-to-br from-se-honey to-se-honey-deep shadow-md shadow-se-honey/30'
                          : 'border-dashed border-border bg-muted'
                      }`}
                    >
                      {isFilled ? (
                        <Crown className="size-4 text-white" />
                      ) : (
                        <span className="text-xs font-medium text-muted-foreground">{slot + 1}</span>
                      )}
                    </div>
                    <span className={`text-[9px] font-medium ${isFilled ? 'text-se-honey-deep' : 'text-muted-foreground'}`}>
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
              <p className="mt-1 text-center text-xs text-muted-foreground/70">
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
          <p className="text-xs text-violet-600/50">
            {format(toDate(item.showDate), 'EEE d MMM yyyy')}
          </p>
        </div>
        {item.alreadyEntered ? (
          <Badge variant="secondary" className="shrink-0 rounded-lg text-xs">Entered</Badge>
        ) : (
          <Badge className="shrink-0 rounded-lg bg-violet-600 text-xs hover:bg-violet-700">
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
      <div className="rounded-2xl border border-border/40 bg-se-surface/80 p-4 shadow-sm transition-all active:scale-[0.99]">
        <div className="flex items-start gap-3">
          <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
            isUrgent ? 'bg-red-100' : 'bg-se-fresh-soft'
          }`}>
            {isUrgent ? (
              <Clock className="size-4 text-red-600" />
            ) : (
              <CalendarDays className="size-4 text-se-fresh-deep" />
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
                  className="inline-flex items-center gap-1 rounded-md bg-se-fresh-soft px-2 py-0.5 text-xs font-medium text-se-fresh-deep"
                >
                  <Star className="size-2.5" />
                  {b}
                </span>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {daysToClose !== null && daysToClose >= 0 && daysToClose <= 14 && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                isUrgent
                  ? 'bg-red-100 text-red-700'
                  : 'bg-se-honey-soft text-se-honey-deep'
              }`}>
                {daysToClose === 0 ? 'Closes today' : `${daysToClose}d left`}
              </span>
            )}
            <Badge className="rounded-lg bg-primary text-xs">
              <Ticket className="mr-0.5 size-3" />
              Enter
            </Badge>
          </div>
        </div>
      </div>
    </Link>
  );
}
