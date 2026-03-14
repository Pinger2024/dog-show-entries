'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { format, parseISO, differenceInDays } from 'date-fns';
import {
  CalendarDays,
  MapPin,
  Dog,
  Ticket,
  Plus,
  ArrowRight,
  Loader2,
  Crown,
  Trophy,
  Award,
  AlertTriangle,
  Sparkles,
  Gavel,
  Rss,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc/client';
import { getPlacementLabel, placementColors } from '@/lib/placements';
import { OnboardingChecklist } from '@/components/dashboard/onboarding-checklist';
import { SecretaryCTA } from '@/components/dashboard/secretary-cta';

export default function DashboardPage() {
  const { data: session } = useSession();
  const firstName = session?.user?.name?.split(' ')[0] ?? 'there';

  const { data, isLoading } = trpc.dashboard.getSummary.useQuery(undefined, {
    staleTime: 60_000,
  });

  return (
    <div className="space-y-5 pb-16 md:pb-0">
      {/* Welcome */}
      <div>
        <h1 className="font-serif text-lg font-bold tracking-tight sm:text-xl">
          Welcome back, {firstName}
        </h1>
      </div>

      {/* Onboarding + Secretary CTA — only for new users */}
      <OnboardingChecklist />
      <SecretaryCTA />

      {isLoading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : !data ? (
        <EmptyDashboard />
      ) : (
        <>
          {/* Section 1: Next Show Countdown */}
          {data.nextShow && <NextShowCard show={data.nextShow} />}

          {/* Section 2: Deadline Alerts */}
          {data.deadlineAlerts.length > 0 && (
            <div className="space-y-2">
              {data.deadlineAlerts.map((alert, i) => (
                <AlertCard key={i} alert={alert} />
              ))}
            </div>
          )}

          {/* Section 3: Recent Results */}
          {data.recentResults.length > 0 && (
            <section>
              <SectionHeader icon={Trophy} title="Recent Results" />
              <div className="space-y-2">
                {data.recentResults.map((result, i) => (
                  <ResultCard key={i} result={result} />
                ))}
              </div>
            </section>
          )}

          {/* Section 4: CC Progress */}
          {data.ccProgress.length > 0 && (
            <section>
              <SectionHeader icon={Crown} title="Championship Progress" />
              <div className="space-y-2">
                {data.ccProgress.map((dog) => (
                  <CCProgressCard key={dog.dogId} dog={dog} />
                ))}
              </div>
            </section>
          )}

          {/* Section 5: Judge Intelligence */}
          {data.judgeIntel.length > 0 && (
            <section>
              <SectionHeader icon={Gavel} title="Judges at Upcoming Shows" />
              <div className="space-y-2">
                {data.judgeIntel.map((item, i) => (
                  <JudgeIntelCard key={i} item={item} />
                ))}
              </div>
            </section>
          )}

          {/* Section 6: Feed Digest */}
          {data.feedDigest.count > 0 && (
            <Link href="/feed" className="block">
              <Card className="transition-colors hover:bg-accent/30 active:bg-accent/40">
                <CardContent className="flex items-center gap-3 py-3">
                  <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
                    <Rss className="size-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Your Feed</p>
                    <p className="text-xs text-muted-foreground">
                      {data.feedDigest.count} new update{data.feedDigest.count !== 1 ? 's' : ''} from dogs you follow
                    </p>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          )}

          {/* Section 7: Recommended Shows */}
          {data.recommendedShows.length > 0 && (
            <section>
              <SectionHeader icon={Sparkles} title="Shows for Your Breeds" href="/browse" />
              <div className="space-y-2">
                {data.recommendedShows.map((show) => (
                  <RecommendedShowCard key={show.showId} show={show} />
                ))}
              </div>
            </section>
          )}

          {/* Quick actions — always at the bottom */}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button className="min-h-[2.75rem] flex-1 sm:flex-none" asChild>
              <Link href="/browse">
                <Plus className="size-4" />
                Enter a Show
              </Link>
            </Button>
            <Button variant="outline" className="min-h-[2.75rem] flex-1 sm:flex-none" asChild>
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

function SectionHeader({ icon: Icon, title, href }: { icon: typeof Trophy; title: string; href?: string }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3.5" />
        {title}
      </h2>
      {href && (
        <Link href={href} className="text-xs text-primary hover:underline">
          View all
        </Link>
      )}
    </div>
  );
}

/* ─── Empty Dashboard ─── */

function EmptyDashboard() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-3 flex size-14 items-center justify-center rounded-full bg-primary/10">
          <Dog className="size-7 text-primary" />
        </div>
        <h2 className="text-lg font-semibold">Get started with Remi</h2>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Add your first dog to start entering shows, tracking results, and building their career profile.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button className="min-h-[2.75rem]" asChild>
            <Link href="/dogs/new">
              <Plus className="size-4" />
              Add a Dog
            </Link>
          </Button>
          <Button variant="outline" className="min-h-[2.75rem]" asChild>
            <Link href="/browse">
              Browse Shows
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Next Show Countdown ─── */

function NextShowCard({ show }: { show: NonNullable<ReturnType<typeof trpc.dashboard.getSummary.useQuery>['data']>['nextShow'] }) {
  if (!show) return null;
  const days = differenceInDays(parseISO(show.showDate), new Date());
  const daysLabel = days === 0 ? 'Today!' : days === 1 ? 'Tomorrow' : `${days} days to go`;

  return (
    <Link href={`/entries/${show.entryId}`}>
      <Card className="overflow-hidden border-amber-200/60 bg-gradient-to-br from-amber-50/80 via-orange-50/40 to-amber-50/20 transition-colors active:bg-amber-50/60">
        <CardContent className="py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wider text-amber-700/70">Next Show</p>
              <p className="mt-1 font-serif text-lg font-bold tracking-tight text-amber-950">{show.showName}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-amber-800/70">
                <span className="flex items-center gap-1">
                  <CalendarDays className="size-3.5" />
                  {format(parseISO(show.showDate), 'EEE d MMM yyyy')}
                </span>
                {show.venueName && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3.5" />
                    {show.venueName}
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-sm text-amber-800/70">
                <Dog className="size-3.5" />
                <span className="font-medium">{show.dogName}</span>
                <span className="text-amber-700/50">&middot;</span>
                <span>{show.classes.join(', ')}</span>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-serif text-3xl font-bold text-amber-800">{days <= 0 ? '!' : days}</p>
              <p className="text-xs font-medium text-amber-700/70">{daysLabel}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
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
      <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2.5 transition-colors active:bg-amber-50">
        <AlertTriangle className="size-4 shrink-0 text-amber-600" />
        <p className="flex-1 text-sm text-amber-900">{alert.message}</p>
        <ArrowRight className="size-3.5 shrink-0 text-amber-600/50" />
      </div>
    </Link>
  );
}

/* ─── Recent Result Card ─── */

function ResultCard({ result }: { result: { dogId: string | null; dogName: string | null; dogPhotoUrl: string | null; showName: string; showDate: string; placements: { className: string; placement: number | null; specialAward: string | null }[]; ccAwarded: boolean } }) {
  return (
    <Card className={result.ccAwarded ? 'border-amber-300/60 bg-amber-50/30' : ''}>
      <CardContent className="py-3">
        <div className="flex items-start gap-3">
          {/* Dog photo */}
          {result.dogPhotoUrl ? (
            <img src={result.dogPhotoUrl} alt="" className="size-10 shrink-0 rounded-full object-cover ring-1 ring-border/40" />
          ) : (
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
              <Dog className="size-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold">{result.dogName ?? 'Unknown'}</p>
              {result.ccAwarded && (
                <Badge className="shrink-0 bg-amber-100 text-amber-800 border-amber-300 text-[10px]">
                  <Crown className="mr-0.5 size-3" />
                  CC
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {result.showName} &middot; {format(parseISO(result.showDate), 'd MMM')}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {result.placements.map((p, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-xs">
                  {p.placement && (
                    <Badge variant="outline" className={`text-[10px] font-semibold ${placementColors[p.placement] ?? ''}`}>
                      {getPlacementLabel(p.placement)}
                    </Badge>
                  )}
                  <span className="text-muted-foreground">{p.className}</span>
                  {p.specialAward && (
                    <Badge variant="secondary" className="text-[10px] bg-amber-50 text-amber-700">
                      <Award className="mr-0.5 size-2.5" />
                      {p.specialAward}
                    </Badge>
                  )}
                </span>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── CC Progress Card ─── */

function CCProgressCard({ dog }: { dog: { dogId: string; dogName: string; breedName: string | null; photoUrl: string | null; ccCount: number; rccCount: number; distinctJudgeCount: number; isChampion: boolean } }) {
  // 3 CCs under 3 different judges = Champion (traditional route)
  // 2 CCs + 5 RCCs = Champion (alternative route from 2023)
  const traditionalProgress = Math.min(dog.ccCount, 3);
  const alternativeProgress = dog.ccCount >= 2 ? Math.min(dog.rccCount, 5) : 0;
  const isTraditionalCloser = (3 - traditionalProgress) <= (5 - alternativeProgress + (dog.ccCount < 2 ? 2 - dog.ccCount : 0));
  const targetCCs = isTraditionalCloser ? 3 : 2;
  const targetRCCs = isTraditionalCloser ? 0 : 5;
  const progressPercent = dog.isChampion ? 100 : isTraditionalCloser
    ? Math.round((traditionalProgress / 3) * 100)
    : Math.round(((Math.min(dog.ccCount, 2) / 2) * 50) + ((Math.min(dog.rccCount, 5) / 5) * 50));

  // Judges needed info
  const judgesNeeded = dog.isChampion ? 0 : Math.max(0, 3 - dog.distinctJudgeCount);

  return (
    <Link href={`/dogs/${dog.dogId}`}>
      <Card className="transition-colors hover:bg-accent/30 active:bg-accent/40">
        <CardContent className="py-3">
          <div className="flex items-center gap-3">
            {dog.photoUrl ? (
              <img src={dog.photoUrl} alt="" className="size-10 shrink-0 rounded-full object-cover ring-1 ring-border/40" />
            ) : (
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                <Dog className="size-5 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold">
                  {dog.isChampion && <span className="text-amber-600">Ch </span>}
                  {dog.dogName}
                </p>
                {dog.breedName && (
                  <span className="hidden text-xs text-muted-foreground sm:inline">{dog.breedName}</span>
                )}
              </div>
              {dog.isChampion ? (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-600">
                  <Sparkles className="size-3" />
                  Champion — {dog.ccCount} CCs · {dog.rccCount} RCCs
                </p>
              ) : (
                <>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">
                      {dog.ccCount}/{targetCCs} CCs
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {dog.rccCount > 0 && `${dog.rccCount} RCC${dog.rccCount !== 1 ? 's' : ''} · `}
                    {judgesNeeded > 0 && `${judgesNeeded} new judge${judgesNeeded !== 1 ? 's' : ''} needed`}
                    {judgesNeeded === 0 && dog.ccCount < 3 && 'Judges requirement met'}
                  </p>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/* ─── Judge Intelligence Card ─── */

function JudgeIntelCard({ item }: { item: { showId: string; showName: string; showSlug: string | null; showDate: string; judgeName: string; breedName: string; alreadyEntered: boolean } }) {
  return (
    <Link href={`/shows/${item.showSlug ?? item.showId}`}>
      <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-accent/30 active:bg-accent/40">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-100">
          <Gavel className="size-4 text-violet-700" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.judgeName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {item.breedName} at {item.showName} &middot; {format(parseISO(item.showDate), 'd MMM')}
          </p>
        </div>
        {item.alreadyEntered ? (
          <Badge variant="secondary" className="shrink-0 text-[10px]">Entered</Badge>
        ) : (
          <Badge className="shrink-0 bg-primary text-[10px]">
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

  return (
    <Link href={`/shows/${show.showSlug ?? show.showId}`}>
      <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-accent/30 active:bg-accent/40">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
          <CalendarDays className="size-4 text-emerald-700" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{show.showName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {format(parseISO(show.startDate), 'd MMM yyyy')}
            {show.venueName && ` · ${show.venueName}`}
          </p>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {show.breedNames.map((b) => (
              <span key={b} className="text-[10px] text-primary">{b}</span>
            ))}
          </div>
        </div>
        <div className="shrink-0 text-right">
          {daysToClose !== null && daysToClose >= 0 && daysToClose <= 14 && (
            <p className={`text-[10px] font-medium ${daysToClose <= 3 ? 'text-destructive' : 'text-amber-600'}`}>
              {daysToClose === 0 ? 'Closes today' : `${daysToClose}d left`}
            </p>
          )}
          <Badge className="bg-primary text-[10px]">
            <Ticket className="mr-0.5 size-3" />
            Enter
          </Badge>
        </div>
      </div>
    </Link>
  );
}
