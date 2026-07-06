'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { RegionalFeeConfig } from '@/server/db/schema/shows';

/** Regional (SV/WUSV) entry-fee editor. Edits the BRG-style tiered per-dog
 *  scale (standard + member columns), any club memberships (optionally with
 *  their own prices — Mandy's option B), the first-time-exhibitor option and
 *  the discretionary donation, plus the Junior Handler fee. Saves the whole
 *  config to shows.regionalFeeConfig. Kept deliberately calm for the 60+
 *  secretary — pre-filled sensible defaults, one Save button. */

type TierRow = { standard: string; member: string };
type MembershipRow = { label: string; requiresNumber: boolean; ownPrices: string[] | null };

const poundsFromPence = (pence: number) => (pence / 100).toFixed(2);
const penceFromPounds = (s: string) => Math.round((parseFloat(s) || 0) * 100);
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
const ordinal = (i: number) => ORDINALS[i] ?? `${i + 1}th`;

export type RegionalFeePayload = {
  config: RegionalFeeConfig;
  juniorHandlerFeePence: number;
};

export function RegionalFeesEditor({
  showId,
  config,
  juniorHandlerFeePence,
  onChange,
}: {
  showId: string;
  config: RegionalFeeConfig | null;
  juniorHandlerFeePence: number | null;
  /** When provided, the editor becomes "embedded": it reports its current
   *  config up on every change and DROPS its own Save button, so the parent
   *  form (setup wizard / edit dialog) saves everything with ONE button — no
   *  two-save-button trap that lost Mandy's close date (2026-07-05). Standalone
   *  (no onChange) keeps its own Save button + mutation. */
  onChange?: (payload: RegionalFeePayload) => void;
}) {
  const utils = trpc.useUtils();
  const seed: RegionalFeeConfig = config ?? {
    tiers: [
      { standardPence: 2000, memberPence: 1700 },
      { standardPence: 2000, memberPence: 1700 },
      { standardPence: 1600, memberPence: 1100 },
      { standardPence: 0, memberPence: 0 },
    ],
    memberships: [{ label: 'BRG/League member', requiresNumber: true }],
  };

  const [tiers, setTiers] = useState<TierRow[]>(
    seed.tiers.map((t) => ({ standard: poundsFromPence(t.standardPence), member: poundsFromPence(t.memberPence) })),
  );
  const [memberships, setMemberships] = useState<MembershipRow[]>(
    (seed.memberships ?? [{ label: 'BRG/League member', requiresNumber: true }]).map((m) => ({
      label: m.label,
      requiresNumber: !!m.requiresNumber,
      ownPrices: m.tiers ? m.tiers.map((t) => poundsFromPence(t.standardPence)) : null,
    })),
  );
  const [firstTimeEnabled, setFirstTimeEnabled] = useState(!!seed.firstTimeEnabled);
  const [firstTimeFee, setFirstTimeFee] = useState(poundsFromPence(seed.firstTimeFeePence ?? 0));
  const [donationsEnabled, setDonationsEnabled] = useState(!!seed.donationsEnabled);
  const [jhFee, setJhFee] = useState(poundsFromPence(juniorHandlerFeePence ?? 0));

  const save = trpc.shows.update.useMutation({
    onSuccess: () => {
      toast.success('Regional entry fees saved');
      utils.shows.getById.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  function updateTier(i: number, key: keyof TierRow, value: string) {
    setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, [key]: value } : t)));
  }
  function addTier() {
    setTiers((prev) => [...prev, { standard: '0.00', member: '0.00' }]);
  }
  function removeTier(i: number) {
    setTiers((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateMembership(i: number, patch: Partial<MembershipRow>) {
    setMemberships((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }

  function buildPayload(): RegionalFeePayload {
    const cfgTiers = tiers.map((t) => ({
      standardPence: penceFromPounds(t.standard),
      memberPence: penceFromPounds(t.member),
    }));
    const cfgMemberships = memberships
      .filter((m) => m.label.trim())
      .map((m) => ({
        label: m.label.trim(),
        requiresNumber: m.requiresNumber,
        ...(m.ownPrices
          ? {
              tiers: m.ownPrices.map((pr) => {
                const pence = penceFromPounds(pr);
                return { standardPence: pence, memberPence: pence };
              }),
            }
          : {}),
      }));
    return {
      config: {
        tiers: cfgTiers,
        memberships: cfgMemberships,
        firstTimeEnabled,
        firstTimeFeePence: penceFromPounds(firstTimeFee),
        donationsEnabled,
      },
      juniorHandlerFeePence: penceFromPounds(jhFee),
    };
  }

  // Embedded mode: report the current config up so the parent form saves it
  // with its single Save button (no separate Save here).
  useEffect(() => {
    if (!onChange) return;
    onChange(buildPayload());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiers, memberships, firstTimeEnabled, firstTimeFee, donationsEnabled, jhFee]);

  function onSave() {
    const payload = buildPayload();
    if (payload.config.tiers.length === 0) {
      toast.error('Add at least one fee tier');
      return;
    }
    save.mutate({
      id: showId,
      juniorHandlerFee: payload.juniorHandlerFeePence,
      regionalFeeConfig: payload.config,
    });
  }

  return (
    <div className="space-y-6 rounded-lg border bg-card p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Regional entry fees</h3>
        <p className="text-xs text-muted-foreground">
          Set the price per dog. The scale counts how many dogs an exhibitor enters — the last
          row applies to that dog and every dog after it.
        </p>
      </div>

      {/* Tier table */}
      <div className="space-y-2">
        <div className="hidden gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[5rem_1fr_1fr_2.5rem]">
          <span>Dog</span>
          <span>Standard</span>
          <span>Member</span>
          <span />
        </div>
        {tiers.map((t, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 rounded-md border p-2 sm:grid-cols-[5rem_1fr_1fr_2.5rem] sm:items-center sm:border-0 sm:p-0">
            <span className="text-sm font-medium">
              {ordinal(i)} dog{i === tiers.length - 1 ? '+' : ''}
            </span>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
              <Input type="number" min="0" step="0.01" className="pl-7 h-11" value={t.standard}
                onChange={(e) => updateTier(i, 'standard', e.target.value)} />
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
              <Input type="number" min="0" step="0.01" className="pl-7 h-11" value={t.member}
                onChange={(e) => updateTier(i, 'member', e.target.value)} />
            </div>
            <Button type="button" variant="ghost" size="icon" className="h-11 w-11"
              disabled={tiers.length <= 1} onClick={() => removeTier(i)} aria-label="Remove tier">
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addTier} className="min-h-[2.75rem]">
          <Plus className="size-4" /> Add another tier
        </Button>
      </div>

      {/* Memberships */}
      <div className="space-y-3 border-t pt-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">Membership discounts</p>
          <p className="text-xs text-muted-foreground">
            The Member column above is used by the BRG/League membership. A club can add its own
            membership with its own prices.
          </p>
        </div>
        {memberships.map((m, i) => (
          <div key={i} className="space-y-3 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Input value={m.label} placeholder="Membership name"
                onChange={(e) => updateMembership(i, { label: e.target.value })} className="h-11" />
              <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0"
                onClick={() => setMemberships((prev) => prev.filter((_, idx) => idx !== i))}
                aria-label="Remove membership">
                <Trash2 className="size-4" />
              </Button>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={m.requiresNumber}
                onCheckedChange={(v) => updateMembership(i, { requiresNumber: v })} />
              Ask for a membership number
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={m.ownPrices !== null}
                onCheckedChange={(v) =>
                  updateMembership(i, { ownPrices: v ? tiers.map((t) => t.member) : null })
                } />
              This membership has its own prices
            </label>
            {m.ownPrices !== null && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {m.ownPrices.map((pr, pi) => (
                  <div key={pi} className="space-y-1">
                    <Label className="text-xs">{ordinal(pi)} dog{pi === m.ownPrices!.length - 1 ? '+' : ''}</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
                      <Input type="number" min="0" step="0.01" className="pl-7 h-11" value={pr}
                        onChange={(e) =>
                          updateMembership(i, {
                            ownPrices: m.ownPrices!.map((v, idx) => (idx === pi ? e.target.value : v)),
                          })
                        } />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" className="min-h-[2.75rem]"
          onClick={() =>
            setMemberships((prev) => [...prev, { label: '', requiresNumber: false, ownPrices: null }])
          }>
          <Plus className="size-4" /> Add a membership
        </Button>
      </div>

      {/* First-time exhibitor + donation + JH fee */}
      <div className="space-y-4 border-t pt-4">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Switch checked={firstTimeEnabled} onCheckedChange={setFirstTimeEnabled} />
            Offer a first-time exhibitor rate
          </label>
          {firstTimeEnabled && (
            <div className="ml-11 max-w-[13rem] space-y-1">
              <Label className="text-xs">First-timer&apos;s first dog</Label>
              <p className="text-[11px] text-muted-foreground">Their other dogs pay the normal rates.</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
                <Input type="number" min="0" step="0.01" className="pl-7 h-11" value={firstTimeFee}
                  onChange={(e) => setFirstTimeFee(e.target.value)} />
              </div>
            </div>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <Switch checked={donationsEnabled} onCheckedChange={setDonationsEnabled} />
          Let exhibitors add a donation
        </label>
        <div className="max-w-[10rem] space-y-1">
          <Label className="text-xs">Junior Handler fee</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
            <Input type="number" min="0" step="0.01" className="pl-7 h-11" value={jhFee}
              onChange={(e) => setJhFee(e.target.value)} />
          </div>
        </div>
      </div>

      {!onChange && (
        <Button type="button" onClick={onSave} disabled={save.isPending} className="min-h-[2.75rem] w-full sm:w-auto">
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          Save regional fees
        </Button>
      )}
    </div>
  );
}
