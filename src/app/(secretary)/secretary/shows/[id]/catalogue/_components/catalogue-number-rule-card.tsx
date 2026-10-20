'use client';

import { useState } from 'react';
import { Hash, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  catalogueNumberRuleFormValues,
  describeCatalogueNumberRule,
  parseCatalogueNumberRule,
  type CatalogueNumberRule,
} from '@/lib/catalogue-number-rule';

/**
 * Where this show's catalogue numbers start and which are left out — for a
 * club whose ring numbers (bibs) don't start at 1, or have gone missing
 * (Mandy 2026-10-20: bibs from 141, with 197, 212 and 216 missing). The rule
 * is lib/catalogue-number-rule.ts; saving re-sorts the show straight away.
 * Collapsed to one line until the secretary asks to change it.
 */
export function CatalogueNumberRuleCard({
  showId,
  rule,
  locked,
}: {
  showId: string;
  rule: CatalogueNumberRule;
  locked: boolean;
}) {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState('');
  const [skip, setSkip] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = trpc.secretary.setCatalogueNumberRule.useMutation({
    onSuccess: ({ rule: saved }) => {
      utils.secretary.getCatalogueData.invalidate({ showId });
      setEditing(false);
      toast.success(describeCatalogueNumberRule(saved));
    },
    onError: (err) => setError(err.message),
  });

  function openForm() {
    const values = catalogueNumberRuleFormValues(rule);
    setStart(values.start);
    setSkip(values.skip);
    setError(null);
    setEditing(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // Same reading the server does, so a typo is caught before the round trip.
    const parsed = parseCatalogueNumberRule({ start, skip });
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    save.mutate({ showId, start, skip });
  }

  return (
    <div className="rounded-lg border bg-card p-4 text-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Hash className="size-5 shrink-0 text-muted-foreground" />
          <div className="space-y-0.5">
            <p className="font-medium">Catalogue numbers</p>
            <p className="text-muted-foreground">{describeCatalogueNumberRule(rule)}</p>
            {locked && (
              <p className="text-muted-foreground">
                The numbers are locked for printing. Unlock them to change where they start.
              </p>
            )}
          </div>
        </div>
        {!locked && !editing && (
          <Button variant="outline" className="min-h-[2.75rem] shrink-0" onClick={openForm}>
            Change
          </Button>
        )}
      </div>

      {editing && !locked && (
        <form onSubmit={submit} className="mt-4 space-y-4 border-t pt-4">
          <div className="space-y-1.5">
            <Label htmlFor="catalogue-number-start">Start at</Label>
            <Input
              id="catalogue-number-start"
              inputMode="numeric"
              autoComplete="off"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="min-h-[2.75rem] max-w-[8rem] text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="catalogue-number-skip">Leave out (optional)</Label>
            <Input
              id="catalogue-number-skip"
              inputMode="numeric"
              autoComplete="off"
              placeholder="For example 197, 212, 216"
              value={skip}
              onChange={(e) => setSkip(e.target.value)}
              className="min-h-[2.75rem] text-base"
            />
            <p className="text-muted-foreground">
              Any numbers you haven&apos;t got, such as missing ring numbers. Put a comma between them.
            </p>
          </div>
          <p className="text-muted-foreground">
            When you save, every dog&apos;s number is put back in order straight away.
          </p>
          {error && (
            <p role="alert" className="font-medium text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" className="min-h-[2.75rem]" disabled={save.isPending}>
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-[2.75rem]"
              onClick={() => setEditing(false)}
              disabled={save.isPending}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
