'use client';

import { useCallback, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { awardNameToType } from '@/lib/top-awards';
import { buildBestAwards, OPTIONAL_AWARDS } from '@/lib/best-awards';

const canon = (a: string) => a.trim().toLowerCase();

/** Soft heads-up when an award name isn't one the results side can record —
 *  the award still prints in the catalogue/sponsor table, so a bespoke
 *  memorial trophy is fine, but a misspelt "Best Longcoat…"-style name would
 *  otherwise silently never reach the awards recording page (Mandy
 *  2026-08-11, found live on two shows). */
export function NotRecordableHint({ award }: { award: string }) {
  if (!award.trim() || awardNameToType(award)) return null;
  return (
    <p className="mt-0.5 text-xs font-normal normal-case text-se-honey-deep">
      Won&apos;t be recordable in results — check the spelling (fine if it&apos;s a bespoke trophy)
    </p>
  );
}

/**
 * Tick-to-add awards editor — replaces free-typing award names. Clubs were
 * misspelling award names (e.g. "Best Longcoat in Show"); the name still
 * printed fine in the catalogue and sponsor table but silently never reached
 * the results recording page, because nothing recognised it (Mandy
 * 2026-08-11, found live on two shows).
 *
 * "Usually awarded" and "Also available" are built from the vocabulary in
 * src/lib/best-awards.ts, which src/lib/__tests__/best-awards-vocabulary.
 * test.ts proves is entirely recordable — so ticking a box can never
 * reproduce the misspelling trap. The free-text "Add your own trophy" input
 * still exists for bespoke, non-recordable trophies (memorial cups, etc.);
 * those get the amber hint automatically.
 */
export function AwardsPicker({
  value,
  onChange,
  showType,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  showType: string | null | undefined;
}) {
  const [customName, setCustomName] = useState('');
  const [showMore, setShowMore] = useState(false);

  const valueSet = useMemo(() => new Set(value.map(canon)), [value]);
  const usualAwards = useMemo(() => buildBestAwards(showType, []), [showType]);
  const usualSet = useMemo(() => new Set(usualAwards.map(canon)), [usualAwards]);
  const moreAwards = useMemo(
    () => OPTIONAL_AWARDS.filter((a) => !usualSet.has(canon(a))),
    [usualSet],
  );

  const handleMoveUp = useCallback(
    (index: number) => {
      if (index === 0) return;
      const next = [...value];
      [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
      onChange(next);
    },
    [value, onChange],
  );

  const handleMoveDown = useCallback(
    (index: number) => {
      if (index >= value.length - 1) return;
      const next = [...value];
      [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
      onChange(next);
    },
    [value, onChange],
  );

  const handleRemove = useCallback(
    (index: number) => {
      onChange(value.filter((_, i) => i !== index));
    },
    [value, onChange],
  );

  const handleToggle = useCallback(
    (name: string, checked: boolean) => {
      if (checked) {
        if (valueSet.has(canon(name))) return;
        onChange([...value, name]);
      } else {
        onChange(value.filter((a) => canon(a) !== canon(name)));
      }
    },
    [value, onChange, valueSet],
  );

  const handleAddCustom = useCallback(() => {
    const trimmed = customName.trim();
    if (!trimmed) return;
    if (valueSet.has(canon(trimmed))) {
      setCustomName('');
      return;
    }
    onChange([...value, trimmed]);
    setCustomName('');
  }, [customName, value, onChange, valueSet]);

  return (
    <div className="space-y-4">
      {/* Your awards */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Your awards{value.length > 0 ? ` (${value.length})` : ''}
        </p>
        {value.length === 0 ? (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            Tick awards below to add them here.
          </p>
        ) : (
          /* Mobile keeps 44px touch targets stacked vertically; from sm up the
             rows compact hard (32px controls, side-by-side arrows, two
             columns) — the first laptop review filled the whole screen with
             eight awards (Mandy 2026-08-11). */
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {value.map((award, idx) => (
              <div key={`${award}-${idx}`} className="flex items-center gap-1 rounded-lg border bg-card px-2 py-1 sm:py-0.5">
                <div className="flex shrink-0 flex-col sm:flex-row">
                  <button
                    type="button"
                    className="flex size-11 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 sm:size-8"
                    disabled={idx === 0}
                    onClick={() => handleMoveUp(idx)}
                    aria-label={`Move ${award} up`}
                  >
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    className="flex size-11 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 sm:size-8"
                    disabled={idx === value.length - 1}
                    onClick={() => handleMoveDown(idx)}
                    aria-label={`Move ${award} down`}
                  >
                    <ArrowDown className="size-3.5" />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{award}</p>
                  <NotRecordableHint award={award} />
                </div>
                <button
                  type="button"
                  className="flex size-11 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:size-8"
                  onClick={() => handleRemove(idx)}
                  aria-label={`Remove ${award}`}
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Usually awarded */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Usually awarded</p>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {usualAwards.map((award) => (
            <label
              key={award}
              className="flex min-h-[2.75rem] cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted/50 sm:min-h-9"
            >
              <Checkbox
                checked={valueSet.has(canon(award))}
                onCheckedChange={(checked) => handleToggle(award, checked === true)}
              />
              <span className="truncate">{award}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Also available — progressive disclosure */}
      {moreAwards.length > 0 && (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setShowMore((s) => !s)}
            className="flex min-h-[2.75rem] w-full items-center justify-between rounded-lg border border-dashed px-3 text-sm text-muted-foreground hover:bg-muted/50"
          >
            <span>{showMore ? 'Hide other awards' : `Also available (${moreAwards.length})`}</span>
            <ChevronDown className={cn('size-4 shrink-0 transition-transform', showMore && 'rotate-180')} />
          </button>
          {showMore && (
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {moreAwards.map((award) => (
                <label
                  key={award}
                  className="flex min-h-[2.75rem] cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted/50 sm:min-h-9"
                >
                  <Checkbox
                    checked={valueSet.has(canon(award))}
                    onCheckedChange={(checked) => handleToggle(award, checked === true)}
                  />
                  <span className="truncate">{award}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add your own trophy */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Add your own trophy</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddCustom();
              }
            }}
            placeholder="e.g. The Smith Family Memorial Trophy"
            className="min-h-[2.75rem]"
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleAddCustom}
            disabled={!customName.trim()}
            className="min-h-[2.75rem] shrink-0"
          >
            <Plus className="size-4" />
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}
