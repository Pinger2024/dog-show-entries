'use client';

import { useState, useEffect } from 'react';
import { Loader2, Save, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useShowId } from '../_lib/show-context';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface AgeClassDef {
  id: string;
  name: string;
  sortOrder: number | null;
}

const AGE_CLASS_DISPLAY: Record<string, string> = {
  'Baby Puppy': 'Baby Puppy',
  'SV Minor Puppy': 'Minor Puppy',
  'SV Puppy': 'Puppy',
  'SV Junior': 'Junior',
  'SV Yearling': 'Yearling',
  'Adult': 'Adult',
  'Working': 'Working',
};

function poundsToPence(pounds: number): number {
  return Math.round(pounds * 100);
}

function penceToPounds(pence: number): string {
  return (pence / 100).toFixed(2);
}

export default function WusvClassesPage() {
  const showId = useShowId();
  const utils = trpc.useUtils();

  const { data: classDefs, isLoading: defsLoading } = trpc.secretary.listWusvClassDefs.useQuery();
  const { data: show, isLoading: showLoading } = trpc.shows.getById.useQuery({ id: showId });

  const setupMutation = trpc.secretary.setupWusvClasses.useMutation({
    onSuccess: (result) => {
      utils.shows.getById.invalidate({ id: showId });
      toast.success(`${result.created} classes saved`);
    },
    onError: (err) => toast.error('Failed to save classes', { description: err.message }),
  });

  const [entryFeeStr, setEntryFeeStr] = useState('');
  const [membersFeeStr, setMembersFeeStr] = useState('');
  const [selectedAgeIds, setSelectedAgeIds] = useState<Set<string>>(new Set());
  const [includeJh6_11, setIncludeJh6_11] = useState(true);
  const [includeJh12_16, setIncludeJh12_16] = useState(true);
  const [initialised, setInitialised] = useState(false);

  const isWusv = show?.showRuleset === 'wusv';

  // Initialise state from existing show data once both queries resolve
  useEffect(() => {
    if (!show || !classDefs || initialised) return;

    // Entry fee — take from first sv_age showClass, or firstEntryFee on show
    const svClass = show.showClasses.find((sc) => sc.classDefinition?.type === 'sv_age');
    const fee = svClass?.entryFee ?? show.firstEntryFee ?? 0;
    setEntryFeeStr(penceToPounds(fee));

    const membersFee = show.membersEntryFeePence;
    setMembersFeeStr(membersFee != null ? penceToPounds(membersFee) : '');

    // Which age class defs are currently active
    const activeAgeIds = new Set(
      show.showClasses
        .filter((sc) => sc.classDefinition?.type === 'sv_age')
        .map((sc) => sc.classDefinitionId)
    );

    if (activeAgeIds.size > 0) {
      setSelectedAgeIds(activeAgeIds);
    } else {
      // Default: all age defs selected
      setSelectedAgeIds(new Set(classDefs.map((d) => d.id)));
    }

    // JH state
    const jhNames = show.showClasses
      .filter((sc) => sc.classDefinition?.type === 'junior_handler')
      .map((sc) => sc.classDefinition?.name ?? '');
    if (activeAgeIds.size > 0 || jhNames.length > 0) {
      setIncludeJh6_11(jhNames.some((n) => n.includes('6-11')));
      setIncludeJh12_16(jhNames.some((n) => n.includes('12-16')));
    }

    setInitialised(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show?.id, classDefs, initialised]);

  if (defsLoading || showLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isWusv) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <Shield className="mx-auto mb-3 size-10 text-muted-foreground" />
          <p className="text-sm font-medium">This show is not set up as a WUSV show.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            SV class management is only available for shows with the WUSV/SV ruleset.
          </p>
        </CardContent>
      </Card>
    );
  }

  function toggleAgeId(id: string) {
    setSelectedAgeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSave() {
    setupMutation.mutate({
      showId,
      entryFee: poundsToPence(parseFloat(entryFeeStr) || 0),
      membersEntryFeePence: membersFeeStr ? poundsToPence(parseFloat(membersFeeStr)) : null,
      selectedAgeDefIds: [...selectedAgeIds],
      includeJh6_11,
      includeJh12_16,
    });
  }

  const totalClasses = selectedAgeIds.size * 4 + (includeJh6_11 ? 1 : 0) + (includeJh12_16 ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* Entry Fees */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="size-5 text-primary" />
            Entry Fees
          </CardTitle>
          <CardDescription>
            All SV age classes share the same entry fee. Junior Handling is free.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Entry Fee (per class)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">£</span>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="0.00"
                  className="pl-7 text-lg font-semibold h-12"
                  value={entryFeeStr}
                  onChange={(e) => setEntryFeeStr(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Members Fee <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">£</span>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="Leave blank to disable"
                  className="pl-7 text-lg font-semibold h-12"
                  value={membersFeeStr}
                  onChange={(e) => setMembersFeeStr(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Exhibitors entering their SV, BRG, or League membership number will pay this fee instead.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SV Age Classes */}
      <Card>
        <CardHeader>
          <CardTitle>SV Age Classes</CardTitle>
          <CardDescription>
            Each selected class creates four entries: Bitch Stock → Bitch Long Stock → Dog Stock → Dog Long Stock.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(classDefs ?? []).map((def) => {
              const label = AGE_CLASS_DISPLAY[def.name] ?? def.name.replace(/^SV /, '');
              const checked = selectedAgeIds.has(def.id);
              return (
                <label
                  key={def.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors ${
                    checked
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-muted/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="size-5 accent-primary"
                    checked={checked}
                    onChange={() => toggleAgeId(def.id)}
                  />
                  <span className="text-sm font-medium">{label}</span>
                </label>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Junior Handling */}
      <Card>
        <CardHeader>
          <CardTitle>Junior Handling</CardTitle>
          <CardDescription>
            WUSV shows include Junior Handling classes. Both age groups are included by default.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              { label: 'Junior Handler (6–11)', value: includeJh6_11, set: setIncludeJh6_11 },
              { label: 'Junior Handler (12–16)', value: includeJh12_16, set: setIncludeJh12_16 },
            ].map(({ label, value, set }) => (
              <label
                key={label}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors ${
                  value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                }`}
              >
                <input
                  type="checkbox"
                  className="size-5 accent-primary"
                  checked={value}
                  onChange={(e) => set(e.target.checked)}
                />
                <span className="text-sm font-medium">{label}</span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      {totalClasses > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
            <CardDescription>{totalClasses} classes will be created</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {(classDefs ?? [])
                .filter((d) => selectedAgeIds.has(d.id))
                .flatMap((def) => {
                  const label = AGE_CLASS_DISPLAY[def.name] ?? def.name.replace(/^SV /, '');
                  return [
                    `${label} · Bitch Stock`,
                    `${label} · Bitch Long Stock`,
                    `${label} · Dog Stock`,
                    `${label} · Dog Long Stock`,
                  ];
                })
                .concat([
                  ...(includeJh6_11 ? ['JH 6–11'] : []),
                  ...(includeJh12_16 ? ['JH 12–16'] : []),
                ])
                .map((label) => (
                  <Badge key={label} variant="secondary" className="text-xs">
                    {label}
                  </Badge>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          size="lg"
          className="w-full sm:w-auto"
          disabled={setupMutation.isPending || totalClasses === 0}
          onClick={handleSave}
        >
          {setupMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Save SV Classes
        </Button>
      </div>
    </div>
  );
}
