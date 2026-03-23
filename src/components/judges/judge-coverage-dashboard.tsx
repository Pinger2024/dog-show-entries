'use client';

import { CheckCircle2, AlertCircle, Plus, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { sexLabel } from './utils';

interface JudgeCoverageDashboardProps {
  showId: string;
  onAddJudge?: (breedId: string | null, sex: string | null) => void;
}

export function JudgeCoverageDashboard({ showId, onAddJudge }: JudgeCoverageDashboardProps) {
  const { data, isLoading } = trpc.secretary.getJudgeCoverage.useQuery({ showId });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.totalCount === 0) return null;

  const allCovered = data.coveredCount === data.totalCount;

  return (
    <Card className={cn(allCovered ? 'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20' : 'border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20')}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              {allCovered ? (
                <CheckCircle2 className="size-5 text-green-600" />
              ) : (
                <AlertCircle className="size-5 text-amber-600" />
              )}
              Judge Coverage
            </CardTitle>
            <CardDescription>
              {allCovered
                ? 'All breed/sex combinations have judges assigned'
                : `${data.coveredCount} of ${data.totalCount} covered — ${data.totalCount - data.coveredCount} still need${data.totalCount - data.coveredCount === 1 ? 's' : ''} a judge`}
            </CardDescription>
          </div>
          <Badge variant={allCovered ? 'default' : 'secondary'} className={cn(allCovered && 'bg-green-600')}>
            {data.coveredCount}/{data.totalCount}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.coverage.map((item, i) => (
          <div
            key={i}
            className={cn(
              'flex items-center justify-between rounded-md border px-3 py-2',
              item.covered
                ? 'border-green-200 bg-white dark:border-green-900 dark:bg-green-950/10'
                : 'border-amber-200 bg-white dark:border-amber-900 dark:bg-amber-950/10',
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              {item.covered ? (
                <CheckCircle2 className="size-4 shrink-0 text-green-600" />
              ) : (
                <AlertCircle className="size-4 shrink-0 text-amber-600" />
              )}
              <div className="min-w-0">
                <span className="text-sm font-medium">
                  {item.breedName ?? 'All Breeds'}
                </span>
                {item.sex && (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    — {sexLabel(item.sex)}
                  </span>
                )}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  ({item.classCount} class{item.classCount !== 1 ? 'es' : ''})
                </span>
              </div>
            </div>
            <div className="shrink-0 ml-2">
              {item.covered ? (
                <span className="text-sm text-green-700 dark:text-green-400">{item.judgeName}</span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 min-h-[2.75rem] text-xs"
                  onClick={() => onAddJudge?.(item.breedId, item.sex)}
                >
                  <Plus className="size-3" />
                  Add
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
