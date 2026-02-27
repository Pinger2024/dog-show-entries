'use client';

import { use } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Users,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

export default function StewardShowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: showId } = use(params);
  const { data: classes, isLoading } =
    trpc.steward.getShowClasses.useQuery({ showId });
  const { data: summary } =
    trpc.steward.getResultsSummary.useQuery({ showId });

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (!classes) {
    return (
      <div className="text-center text-muted-foreground">
        Show not found or not accessible.
      </div>
    );
  }

  const judged = summary?.judgedClasses ?? 0;
  const total = summary?.totalClasses ?? classes.length;
  const progress = total > 0 ? Math.round((judged / total) * 100) : 0;

  // Group by breed
  const breedMap = new Map<
    string,
    typeof classes
  >();
  for (const sc of classes) {
    const breedName = sc.breed?.name ?? 'Any Breed';
    if (!breedMap.has(breedName)) breedMap.set(breedName, []);
    breedMap.get(breedName)!.push(sc);
  }
  const breeds = Array.from(breedMap.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  return (
    <div>
      <Link
        href="/steward"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        My Shows
      </Link>

      {/* Progress section */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {judged} of {total} classes judged
          </span>
          <span className="text-muted-foreground">{progress}%</span>
        </div>
        <Progress value={progress} className="mt-2 h-2" />
      </div>

      {/* Classes grouped by breed */}
      <div className="mt-6 space-y-6">
        {breeds.map(([breedName, breedClasses]) => (
          <div key={breedName}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {breedName}
            </h2>
            <div className="space-y-1">
              {breedClasses.map((sc) => (
                <Link
                  key={sc.id}
                  href={`/steward/shows/${showId}/classes/${sc.id}`}
                  className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/30 active:bg-muted/50"
                >
                  {sc.hasResults ? (
                    <CheckCircle2 className="size-5 shrink-0 text-green-500" />
                  ) : (
                    <div className="size-5 shrink-0 rounded-full border-2 border-muted-foreground/20" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {sc.classNumber != null && (
                        <span className="text-xs font-bold text-muted-foreground">
                          #{sc.classNumber}
                        </span>
                      )}
                      <span className="font-medium text-sm">
                        {sc.classDefinition.name}
                      </span>
                      {sc.sex && (
                        <Badge
                          variant="outline"
                          className="text-[10px] capitalize"
                        >
                          {sc.sex}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="size-3" />
                      {sc.entryCount} {sc.entryCount === 1 ? 'entry' : 'entries'}
                      {sc.resultsCount > 0 && (
                        <span className="ml-1 text-green-600">
                          ({sc.resultsCount} placed)
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/40" />
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
