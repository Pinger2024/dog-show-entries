'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { parseSvMeasurement, svMeasurementProblem, formatSvMeasurement } from '@/lib/sv-measurement';

/** One dog's row — the server's SvMeasurementRow (services/sv-measurement.ts)
 *  or the steward class page's own row, which carries the same fields. */
export type SvMeasurementCardEntry = {
  entryClassId: string;
  catalogueNumber: string | null;
  dogName: string;
  svHeightCm: string;
  svDepthCm: string;
};

export type SvMeasurementSave = (
  entryClassId: string,
  heightCm: number | null,
  depthCm: number | null,
) => Promise<unknown>;

/**
 * Height and chest depth boxes for dogs from Junior upwards, in centimetres —
 * each dog saves as soon as you move on from a box (Mandy, 30 Sept 2026). They
 * go onto the League's Results for SV sheet.
 *
 * THE card: the steward class page (on the day) and the secretary's Height and
 * depth page (afterwards) both render this, with the dogs the server says are
 * measured (`svMeasurementBlock`). Neither page draws its own boxes.
 */
export function SvMeasurementsCard({
  title = 'Height and depth (cm)',
  intro,
  entries,
  onSave,
}: {
  title?: string;
  /** Shown under the title; the steward page explains the boxes here. */
  intro?: string;
  entries: SvMeasurementCardEntry[];
  onSave: SvMeasurementSave;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="mt-6 overflow-hidden rounded-xl border bg-card">
      <div className="bg-green-800 px-4 py-2 text-sm font-semibold text-white">
        {title}
      </div>
      {intro && <p className="px-4 pt-3 text-xs text-muted-foreground">{intro}</p>}
      <div className="divide-y">
        {entries.map((e) => (
          <MeasurementRow key={e.entryClassId} entry={e} onSave={onSave} />
        ))}
      </div>
    </div>
  );
}

function MeasurementRow({ entry, onSave }: { entry: SvMeasurementCardEntry; onSave: SvMeasurementSave }) {
  const [height, setHeight] = useState(entry.svHeightCm);
  const [depth, setDepth] = useState(entry.svDepthCm);
  const [problem, setProblem] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  function save() {
    const h = parseSvMeasurement(height);
    const d = parseSvMeasurement(depth);
    const issue = svMeasurementProblem('height', h) ?? svMeasurementProblem('depth', d);
    setProblem(issue);
    if (issue) return;
    // Nothing changed since the last save — don't write.
    if (formatSvMeasurement(h) === entry.svHeightCm && formatSvMeasurement(d) === entry.svDepthCm) return;
    setStatus('saving');
    onSave(entry.entryClassId, h, d).then(
      () => setStatus('saved'),
      // The page shows the reason; the boxes keep what was typed.
      () => setStatus('idle'),
    );
  }

  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 basis-40">
          <p className="text-xs font-semibold text-muted-foreground">#{entry.catalogueNumber ?? '—'}</p>
          <p className="truncate text-sm font-semibold">{entry.dogName}</p>
        </div>
        <label className="flex items-center gap-1.5 text-sm">
          Height
          <Input
            inputMode="decimal"
            className="h-11 w-20 text-base"
            value={height}
            onChange={(ev) => {
              setHeight(ev.target.value);
              setStatus('idle');
            }}
            onBlur={save}
            aria-label={`Height in cm for #${entry.catalogueNumber ?? ''}`}
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          Depth
          <Input
            inputMode="decimal"
            className="h-11 w-20 text-base"
            value={depth}
            onChange={(ev) => {
              setDepth(ev.target.value);
              setStatus('idle');
            }}
            onBlur={save}
            aria-label={`Depth in cm for #${entry.catalogueNumber ?? ''}`}
          />
        </label>
        <span className="flex w-16 items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
          {status === 'saving' && (
            <>
              <Loader2 className="size-3.5 animate-spin" /> Saving
            </>
          )}
          {status === 'saved' && (
            <>
              <Check className="size-3.5 text-green-700" /> Saved
            </>
          )}
        </span>
      </div>
      {problem && <p className="mt-1 text-sm text-destructive">{problem}</p>}
    </div>
  );
}
