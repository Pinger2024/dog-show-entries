'use client';

import { useState } from 'react';
import { CheckCircle2, AlertTriangle, HelpCircle, Pencil } from 'lucide-react';
import { getPlacementLabel } from '@/lib/placements';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UNASSIGNED_VALUE, type CritiqueAssignableOption, type CritiqueDisplayBlock } from './types';

function sexSuffix(sex: 'dog' | 'bitch' | null) {
  return sex === 'dog' ? ' Dog' : sex === 'bitch' ? ' Bitch' : '';
}

function optionLabel(o: CritiqueAssignableOption) {
  return `${o.className}${sexSuffix(o.sex)} — ${getPlacementLabel(o.placement)} — ${o.registeredName}`;
}

export type BlockPatch = Partial<{
  critiqueText: string;
  include: boolean;
  matchedEntryClassId: string | null;
  resolution: 'document' | 'existing' | null;
}>;

/**
 * One card per parsed critique/overview/unmatched block — the review UI
 * both the judge page and the secretary page use, so the two never drift.
 * `role` controls the two places they differ: only the secretary resolves a
 * steward-vs-document conflict (a judge shouldn't silently overrule what
 * the steward already recorded on the day).
 */
export function CritiqueBlockCard({
  block,
  assignableOptions,
  role,
  onChange,
}: {
  block: CritiqueDisplayBlock;
  assignableOptions: CritiqueAssignableOption[];
  role: 'judge' | 'secretary';
  onChange: (patch: BlockPatch) => void;
}) {
  const [editingText, setEditingText] = useState(false);

  if (block.kind === 'overview') {
    return (
      <div className={cn('min-w-0 rounded-lg border p-4', !block.include && 'opacity-60')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground">
            Your opening remarks — these will appear at the top of the results page
          </p>
          <label className="flex min-h-[2.75rem] items-center gap-2 text-xs text-muted-foreground sm:min-h-0">
            <Switch checked={block.include} onCheckedChange={(v) => onChange({ include: v })} />
            Show on results page
          </label>
        </div>
        <Textarea
          className="mt-2"
          value={block.critiqueText}
          onChange={(e) => onChange({ critiqueText: e.target.value })}
          rows={3}
        />
      </div>
    );
  }

  const needsHome = block.include && !block.matchedEntryClassId;
  const needsCheck = block.include && !needsHome && block.confidence === 'check';
  const unresolvedConflict = role === 'secretary' && block.include && !!block.conflict && !block.resolution;

  const statusBadge = !block.include ? (
    <Badge className="shrink-0 bg-muted text-muted-foreground">Left out</Badge>
  ) : unresolvedConflict ? (
    <Badge className="shrink-0 border-se-honey-line bg-se-honey-soft text-se-honey-deep">
      <AlertTriangle className="size-3" />
      Needs a decision
    </Badge>
  ) : needsHome ? (
    <Badge className="shrink-0 border-destructive/20 bg-destructive/10 text-destructive">
      <HelpCircle className="size-3" />
      Needs a home
    </Badge>
  ) : needsCheck ? (
    <Badge className="shrink-0 border-se-honey-line bg-se-honey-soft text-se-honey-deep">
      <AlertTriangle className="size-3" />
      Please check this one
    </Badge>
  ) : (
    <Badge className="shrink-0 border-se-fresh-line bg-se-fresh-soft text-se-fresh-deep">
      <CheckCircle2 className="size-3" />
      All good
    </Badge>
  );

  return (
    <div className={cn('min-w-0 space-y-3 rounded-lg border p-4', !block.include && 'opacity-60')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {block.matchedDisplay ? (
            <>
              <p className="truncate font-medium">{block.matchedDisplay.registeredName}</p>
              <p className="text-xs text-muted-foreground">
                {block.matchedDisplay.className}
                {sexSuffix(block.matchedDisplay.sex)} — {getPlacementLabel(block.matchedDisplay.placement)}
              </p>
            </>
          ) : (
            <>
              <p className="truncate font-medium">{block.dogRaw || block.dogNameCleaned || 'Unrecognised text'}</p>
              <p className="text-xs text-muted-foreground">
                {block.classNameRaw ?? "Doesn't match a class on this show"}
                {block.position ? ` — ${getPlacementLabel(block.position)}` : ''}
              </p>
            </>
          )}
        </div>
        {statusBadge}
      </div>

      {editingText ? (
        <Textarea
          value={block.critiqueText}
          onChange={(e) => onChange({ critiqueText: e.target.value })}
          rows={4}
          autoFocus
        />
      ) : (
        <p className="text-sm leading-relaxed">
          {block.critiqueText || <span className="italic text-muted-foreground">No critique text</span>}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-[2.75rem] sm:min-h-0"
          onClick={() => setEditingText((v) => !v)}
        >
          <Pencil className="size-3.5" />
          {editingText ? 'Done' : 'Fix this'}
        </Button>
        <label className="flex min-h-[2.75rem] items-center gap-2 text-xs text-muted-foreground sm:min-h-0">
          <Switch checked={block.include} onCheckedChange={(v) => onChange({ include: v })} />
          {block.include ? 'Included' : 'Leave this one out'}
        </label>
      </div>

      {block.include && (needsHome || needsCheck || role === 'secretary') && (
        <div className="min-w-0">
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            {needsHome ? 'Which dog is this critique for?' : 'Not the right dog? Change it'}
          </p>
          <Select
            value={block.matchedEntryClassId ?? UNASSIGNED_VALUE}
            onValueChange={(v) => onChange({ matchedEntryClassId: v === UNASSIGNED_VALUE ? null : v })}
          >
            <SelectTrigger className="min-h-[2.75rem] w-full max-w-[calc(100vw-4rem)]">
              <SelectValue placeholder="Choose a dog" />
            </SelectTrigger>
            <SelectContent position="popper" className="max-w-[calc(100vw-2rem)]">
              <SelectItem value={UNASSIGNED_VALUE}>Leave unmatched</SelectItem>
              {assignableOptions.map((o) => (
                <SelectItem key={o.entryClassId} value={o.entryClassId}>
                  {optionLabel(o)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {role === 'secretary' && block.include && block.conflict && (
        <div className="rounded-lg border border-se-honey-line bg-se-honey-soft p-3">
          <p className="text-xs font-medium text-se-honey-deep">
            The steward already wrote a critique for this dog on the day — pick which one to keep.
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label
              className={cn(
                'min-w-0 cursor-pointer rounded-md border bg-background p-2 text-xs',
                block.resolution === 'document' && 'border-primary ring-1 ring-primary',
              )}
            >
              <input
                type="radio"
                className="mr-1.5"
                checked={block.resolution === 'document'}
                onChange={() => onChange({ resolution: 'document' })}
              />
              From the judge
              <p className="mt-1 truncate text-muted-foreground">{block.critiqueText || '(empty)'}</p>
            </label>
            <label
              className={cn(
                'min-w-0 cursor-pointer rounded-md border bg-background p-2 text-xs',
                block.resolution === 'existing' && 'border-primary ring-1 ring-primary',
              )}
            >
              <input
                type="radio"
                className="mr-1.5"
                checked={block.resolution === 'existing'}
                onChange={() => onChange({ resolution: 'existing' })}
              />
              Already on file (from the steward)
              <p className="mt-1 truncate text-muted-foreground">{block.conflict.existingText}</p>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
