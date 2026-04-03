'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  Trophy,
  Award,
  Crown,
  Lock,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  BarChart3,
} from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { showTypeLabels } from '@/lib/show-types';

interface ChampionshipProgressProps {
  dogId: string;
  isPro: boolean;
}

export function ChampionshipProgress({ dogId, isPro }: ChampionshipProgressProps) {
  const [showDetails, setShowDetails] = useState(false);

  const { data, isLoading } = trpc.pro.getChampionshipProgress.useQuery(
    { dogId },
    { enabled: true }
  );

  if (isLoading || !data) return null;

  const { championship, awards, analytics } = data;
  const hasAnyData =
    championship.classic.ccs > 0 ||
    championship.alternative.rccs > 0 ||
    analytics.yearlyBreakdown.length > 0;

  if (!hasAnyData) return null;

  return (
    <div className="space-y-5">
      {/* Championship Routes */}
      {(championship.classic.ccs > 0 || championship.alternative.rccs > 0) && (
        <div className="rounded-lg border border-amber-200/50 bg-gradient-to-b from-amber-50/30 to-transparent">
          <div className="flex items-center gap-2.5 border-b border-amber-200/30 px-4 py-3">
            <div className="flex size-7 items-center justify-center rounded-full bg-amber-100">
              <Crown className="size-3.5 text-amber-600" />
            </div>
            <h3 className="font-serif text-sm font-semibold text-stone-800">
              Championship Progress
            </h3>
            {(championship.classic.complete || championship.alternative.complete) && (
              <Badge className="ml-auto bg-amber-500 text-xs text-white">
                Qualified
              </Badge>
            )}
          </div>

          <div className="grid gap-4 p-4 sm:grid-cols-2">
            {/* Classic Route */}
            <RouteCard
              title="Classic Route"
              subtitle="3 CCs under 3 different judges"
              progress={championship.classic.progress}
              required={3}
              complete={championship.classic.complete}
              stats={[
                { label: 'CCs', value: championship.classic.ccs },
                { label: 'Unique judges', value: championship.classic.uniqueJudges },
              ]}
              isRecommended={championship.bestRoute === 'classic'}
            />

            {/* Alternative Route */}
            <RouteCard
              title="Alternative Route"
              subtitle="1 CC + 7 RCCs under 7 judges"
              progress={
                (championship.alternative.hasCC ? 1 : 0) +
                Math.min(championship.alternative.rccProgress, 7)
              }
              required={8}
              complete={championship.alternative.complete}
              stats={[
                { label: 'CC', value: championship.alternative.hasCC ? 1 : 0, of: 1 },
                { label: 'RCCs', value: championship.alternative.rccs },
                { label: 'Unique judges', value: championship.alternative.uniqueRCCJudges },
              ]}
              isRecommended={championship.bestRoute === 'alternative'}
            />
          </div>

          {/* Award details toggle */}
          {(awards.ccs.length > 0 || awards.rccs.length > 0) && (
            <div className="border-t border-amber-200/30">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="flex w-full items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-50/50"
              >
                {showDetails ? (
                  <>
                    Hide details <ChevronUp className="size-3" />
                  </>
                ) : (
                  <>
                    View award history <ChevronDown className="size-3" />
                  </>
                )}
              </button>

              {showDetails && (
                <div className="space-y-3 px-4 pb-4">
                  {awards.ccs.length > 0 && (
                    <AwardList
                      title="Challenge Certificates"
                      icon={<Trophy className="size-3 text-amber-600" />}
                      items={awards.ccs}
                    />
                  )}
                  {awards.rccs.length > 0 && (
                    <AwardList
                      title="Reserve Challenge Certificates"
                      icon={<Award className="size-3 text-amber-500" />}
                      items={awards.rccs}
                    />
                  )}
                  {awards.bobs.length > 0 && (
                    <AwardList
                      title="Best of Breed"
                      icon={<Trophy className="size-3 text-emerald-600" />}
                      items={awards.bobs}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Analytics section — Pro gated */}
      {analytics.yearlyBreakdown.length > 0 && (
        <div className="relative rounded-lg border bg-card">
          <div className="flex items-center gap-2.5 border-b px-4 py-3">
            <BarChart3 className="size-4 text-primary" />
            <h3 className="font-serif text-sm font-semibold">Performance Analytics</h3>
          </div>

          {isPro ? (
            <div className="space-y-4 p-4">
              {/* Year-by-year breakdown */}
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Year by Year
                </h4>
                <div className="space-y-1.5">
                  {analytics.yearlyBreakdown.map((year) => (
                    <div
                      key={year.year}
                      className="flex items-center gap-3 rounded-md bg-muted/30 px-3 py-2 text-sm"
                    >
                      <span className="font-serif font-semibold text-stone-700">
                        {year.year}
                      </span>
                      <div className="flex flex-1 flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>
                          <strong className="text-foreground">{year.shows}</strong> show
                          {year.shows !== 1 ? 's' : ''}
                        </span>
                        <span>
                          <strong className="text-foreground">{year.firsts}</strong> × 1st
                        </span>
                        <span>
                          <strong className="text-foreground">{year.placements}</strong> top 3
                        </span>
                        {year.awards > 0 && (
                          <span className="text-amber-600">
                            <strong>{year.awards}</strong> award
                            {year.awards !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Show type breakdown */}
              {analytics.showTypeBreakdown.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    By Show Type
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {analytics.showTypeBreakdown.map((st) => (
                      <div
                        key={st.showType}
                        className="rounded-md border px-3 py-2 text-center"
                      >
                        <p className="text-xs text-muted-foreground">
                          {showTypeLabels[st.showType] ?? st.showType}
                        </p>
                        <p className="mt-0.5 font-serif text-lg font-semibold">
                          {st.count}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {st.firsts} × 1st
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="relative">
              {/* Blurred preview */}
              <div className="pointer-events-none select-none p-4 opacity-40 blur-[2px]">
                <div className="space-y-1.5">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-md bg-muted/30 px-3 py-2"
                    >
                      <span className="font-serif text-sm font-semibold">202{i}</span>
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span>5 shows</span>
                        <span>3 × 1st</span>
                        <span>2 awards</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Upgrade overlay */}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-card/80 backdrop-blur-[1px]">
                <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
                  <Lock className="size-4 text-primary" />
                </div>
                <div className="text-center">
                  <p className="font-serif text-sm font-semibold">
                    Unlock Performance Analytics
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Year-by-year stats, show type breakdowns, and more with Remi Pro.
                  </p>
                </div>
                <Button size="sm" asChild className="mt-1 h-8 gap-1.5 text-xs">
                  <Link href="/settings">
                    <TrendingUp className="size-3" />
                    Upgrade to Pro
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Route progress card ─── */

function RouteCard({
  title,
  subtitle,
  progress,
  required,
  complete,
  stats,
  isRecommended,
}: {
  title: string;
  subtitle: string;
  progress: number;
  required: number;
  complete: boolean;
  stats: { label: string; value: number; of?: number }[];
  isRecommended: boolean;
}) {
  const percentage = Math.min((progress / required) * 100, 100);

  return (
    <div
      className={`rounded-md border p-3 ${
        complete
          ? 'border-amber-300 bg-amber-50/50'
          : isRecommended
            ? 'border-stone-200 bg-white'
            : 'border-stone-100 bg-stone-50/50'
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-serif text-[0.8125rem] font-semibold text-stone-800">
            {title}
          </p>
          <p className="text-xs text-stone-400">{subtitle}</p>
        </div>
        {isRecommended && !complete && (
          <Badge variant="outline" className="text-[9px] border-amber-300 text-amber-700">
            Closer
          </Badge>
        )}
        {complete && (
          <Badge className="bg-amber-500 text-[9px] text-white">Complete</Badge>
        )}
      </div>

      {/* Progress bar */}
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-stone-100">
        <div
          className={`h-full rounded-full transition-all ${
            complete ? 'bg-amber-500' : 'bg-amber-400'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Stats */}
      <div className="mt-2 flex gap-3 text-[11px]">
        {stats.map((stat) => (
          <span key={stat.label} className="text-stone-500">
            <strong className="text-stone-700">
              {stat.value}
              {stat.of !== undefined ? `/${stat.of}` : ''}
            </strong>{' '}
            {stat.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── Award list ─── */

function AwardList({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: { showName: string; date: string; className?: string }[];
}) {
  return (
    <div>
      <h4 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
        {icon}
        {title}
      </h4>
      <div className="space-y-1">
        {items.map((item, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-sm bg-white px-2.5 py-1.5 text-xs"
          >
            <span className="text-stone-600">
              {item.showName || 'Show'}
              {item.className ? ` — ${item.className}` : ''}
            </span>
            <span className="text-stone-400">
              {format(new Date(item.date), 'd MMM yyyy')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
