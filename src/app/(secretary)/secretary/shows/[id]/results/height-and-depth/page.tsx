'use client';

import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { SE_H } from '@/components/show-experience/tokens';
import { SvMeasurementsCard } from '@/components/sv/sv-measurements-card';
import { svMeasurementProgress } from '@/lib/sv-measurement';
import { useShowId } from '../../_lib/show-context';

/**
 * Height and depth for every dog from Junior upwards, on one page — for the
 * secretary typing them in after the show from the judge's sheets (Mandy,
 * 30 Sept 2026: "both but doesn't need to be on the day, can be afterwards").
 * The steward class page offers the same boxes on the day, one class at a
 * time, but only to people added as a steward; the secretary needn't be one.
 */
export default function HeightAndDepthPage() {
  const showId = useShowId();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.secretary.getSvMeasurements.useQuery({ showId });
  const save = trpc.steward.recordSvMeasurement.useMutation({
    onSuccess: () => utils.secretary.getSvMeasurements.invalidate({ showId }),
    onError: (error) => toast.error(error.message),
  });

  const dogs = data?.classes.flatMap((c) => c.entries) ?? [];
  const { measured } = svMeasurementProgress(dogs);

  return (
    <div className="space-y-4">
      <Link
        href={`/secretary/shows/${showId}/results`}
        className="inline-flex min-h-[2.75rem] items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to Results
      </Link>

      <div>
        <h2 className={cn(SE_H, 'font-serif text-lg sm:text-xl')}>Height and depth</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every dog from Junior upwards is measured. Type each dog&apos;s height and chest depth in centimetres, for
          example 61.5 and 25.5. Each one saves as soon as you move to the next box. They go on the Results for SV
          spreadsheet under Documents.
        </p>
        {dogs.length > 0 && (
          <p className="mt-2 text-sm font-semibold">
            {measured} of {dogs.length} dogs measured
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : dogs.length === 0 ? (
        <div className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          No dogs to measure yet. Dogs in the Junior, Yearling, Adult and Working classes appear here once their entries
          are confirmed.
        </div>
      ) : (
        data!.classes.map((c) => (
          <SvMeasurementsCard
            key={c.showClassId}
            title={c.label}
            entries={c.entries}
            onSave={(entryClassId, heightCm, depthCm) => save.mutateAsync({ entryClassId, heightCm, depthCm })}
          />
        ))
      )}
    </div>
  );
}
