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

/** Regional (SV/WUSV) entry-fee editor. The BRG model is a flat rate PER DOG
 *  with a "3 or more dogs" package price, at several levels — Non-member plus
 *  each club membership. This editor speaks that plain model (Mandy 2026-07-08:
 *  the old 1st/2nd/3rd positional grid was only a Google-Forms-era artefact).
 *
 *  Under the hood the fee config still stores a per-dog scale, so we encode each
 *  level's (per-dog, 3-or-more) pair to `[P, P, K−2P, 0]` — 1st & 2nd dog £P,
 *  the 3rd dog tops the running total up to £K, and the 4th dog on is free — and
 *  decode it back when loading. The checkout + schedule read that scale, so what
 *  the secretary types here is exactly what's charged and printed.
 *  Kept deliberately calm for the 60+ secretary: pre-filled defaults, one Save. */

type MemberLevel = { label: string; requiresNumber: boolean; perDog: string; threePlus: string };

const poundsFromPence = (pence: number) => (pence / 100).toFixed(2);
const penceFromPounds = (s: string) => Math.round((parseFloat(s) || 0) * 100);

/** Price the dog at 1-based `position` would pay on a stored per-dog scale. */
function priceAt(tiers: RegionalFeeConfig['tiers'], position: number, member: boolean): number {
  if (!tiers.length) return 0;
  const t = tiers[Math.min(position - 1, tiers.length - 1)]!;
  return member ? t.memberPence : t.standardPence;
}
/** Decode a stored per-dog scale back to the plain (per-dog, 3-or-more) pair. */
function decodeLevel(tiers: RegionalFeeConfig['tiers'], member: boolean): { perDog: number; threePlus: number } {
  return {
    perDog: priceAt(tiers, 1, member),
    threePlus: priceAt(tiers, 1, member) + priceAt(tiers, 2, member) + priceAt(tiers, 3, member),
  };
}
/** Encode a (per-dog, 3-or-more) pair to the stored per-dog scale. The 3rd dog
 *  carries the top-up to the package total; the 4th dog on is free so "3 or more"
 *  is a flat cap. Clamped so the 3rd dog is never negative. */
function encodeTiers(perDogPence: number, threePlusPence: number): RegionalFeeConfig['tiers'] {
  const third = Math.max(0, threePlusPence - 2 * perDogPence);
  return [
    { standardPence: perDogPence, memberPence: perDogPence },
    { standardPence: perDogPence, memberPence: perDogPence },
    { standardPence: third, memberPence: third },
    { standardPence: 0, memberPence: 0 },
  ];
}

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

  // Decode the stored config back to plain per-dog / 3-or-more figures.
  const seedNonMember = config ? decodeLevel(config.tiers, false) : { perDog: 2000, threePlus: 5600 };
  const seedMemberships: MemberLevel[] = config
    ? (config.memberships ?? []).map((m) => {
        // Option B (own prices) reads its own scale; option A shares the config
        // member column. Either way we present a plain per-dog / 3-or-more pair.
        const d = m.tiers && m.tiers.length ? decodeLevel(m.tiers, false) : decodeLevel(config.tiers, true);
        return {
          label: m.label,
          requiresNumber: !!m.requiresNumber,
          perDog: poundsFromPence(d.perDog),
          threePlus: poundsFromPence(d.threePlus),
        };
      })
    : [{ label: 'BRG/League member', requiresNumber: true, perDog: '17.00', threePlus: '45.00' }];

  const [nmPerDog, setNmPerDog] = useState(poundsFromPence(seedNonMember.perDog));
  const [nmThreePlus, setNmThreePlus] = useState(poundsFromPence(seedNonMember.threePlus));
  const [memberships, setMemberships] = useState<MemberLevel[]>(seedMemberships);
  const [firstTimeEnabled, setFirstTimeEnabled] = useState(config ? !!config.firstTimeEnabled : true);
  const [firstTimeFee, setFirstTimeFee] = useState(poundsFromPence(config?.firstTimeFeePence ?? 0));
  const [donationsEnabled, setDonationsEnabled] = useState(!!config?.donationsEnabled);
  const [jhFee, setJhFee] = useState(poundsFromPence(juniorHandlerFeePence ?? 0));

  const save = trpc.shows.update.useMutation({
    onSuccess: () => {
      toast.success('Regional entry fees saved');
      utils.shows.getById.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  function updateMembership(i: number, patch: Partial<MemberLevel>) {
    setMemberships((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }

  function buildPayload(): RegionalFeePayload {
    const memberConfigs = memberships
      .filter((m) => m.label.trim())
      .map((m) => ({
        label: m.label.trim(),
        requiresNumber: m.requiresNumber,
        tiers: encodeTiers(penceFromPounds(m.perDog), penceFromPounds(m.threePlus)),
      }));
    return {
      config: {
        tiers: encodeTiers(penceFromPounds(nmPerDog), penceFromPounds(nmThreePlus)),
        memberships: memberConfigs,
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
  }, [nmPerDog, nmThreePlus, memberships, firstTimeEnabled, firstTimeFee, donationsEnabled, jhFee]);

  function onSave() {
    const payload = buildPayload();
    save.mutate({
      id: showId,
      juniorHandlerFee: payload.juniorHandlerFeePence,
      regionalFeeConfig: payload.config,
    });
  }

  // Gentle validation: a "3 or more" price below two dogs can't be represented
  // (three dogs would never cost less than two), so warn rather than mis-charge.
  const belowTwoDogs = (perDog: string, threePlus: string) => {
    const p = penceFromPounds(perDog);
    const k = penceFromPounds(threePlus);
    return k > 0 && k < 2 * p;
  };

  return (
    <div className="space-y-6 rounded-lg border bg-card p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Regional entry fees</h3>
        <p className="text-xs text-muted-foreground">
          Set a price per dog, and a price for when someone enters 3 or more dogs. First-time
          exhibitors and Junior Handlers are set further down.
        </p>
      </div>

      {/* Non-member */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Standard (non-member)</p>
        <LevelPrices
          perDog={nmPerDog}
          threePlus={nmThreePlus}
          onPerDog={setNmPerDog}
          onThreePlus={setNmThreePlus}
        />
        {belowTwoDogs(nmPerDog, nmThreePlus) && <BelowTwoDogsHint perDog={nmPerDog} />}
      </div>

      {/* Membership rates */}
      <div className="space-y-3 border-t pt-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">Membership rates</p>
          <p className="text-xs text-muted-foreground">
            Cheaper rates for members. Add each type your club offers — they show on the schedule
            and exhibitors pick which one they are at checkout.
          </p>
        </div>
        {memberships.map((m, i) => (
          <div key={i} className="space-y-3 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Input
                value={m.label}
                placeholder="e.g. BRG/League member"
                onChange={(e) => updateMembership(i, { label: e.target.value })}
                className="h-11"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 shrink-0"
                onClick={() => setMemberships((prev) => prev.filter((_, idx) => idx !== i))}
                aria-label="Remove membership"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <LevelPrices
              perDog={m.perDog}
              threePlus={m.threePlus}
              onPerDog={(v) => updateMembership(i, { perDog: v })}
              onThreePlus={(v) => updateMembership(i, { threePlus: v })}
            />
            {belowTwoDogs(m.perDog, m.threePlus) && <BelowTwoDogsHint perDog={m.perDog} />}
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={m.requiresNumber}
                onCheckedChange={(v) => updateMembership(i, { requiresNumber: v })}
              />
              Ask for a membership number
            </label>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-[2.75rem]"
          onClick={() =>
            setMemberships((prev) => [...prev, { label: '', requiresNumber: false, perDog: '0.00', threePlus: '0.00' }])
          }
        >
          <Plus className="size-4" /> Add a membership rate
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
              <PriceInput value={firstTimeFee} onChange={setFirstTimeFee} />
            </div>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <Switch checked={donationsEnabled} onCheckedChange={setDonationsEnabled} />
          Let exhibitors add a donation
        </label>
        <div className="max-w-[10rem] space-y-1">
          <Label className="text-xs">Junior Handler fee</Label>
          <PriceInput value={jhFee} onChange={setJhFee} />
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

/** A single £ number input with the pound prefix. */
function PriceInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
      <Input
        type="number"
        min="0"
        step="0.01"
        className="pl-7 h-11"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** The "Per dog" + "3 or more dogs" pair for one fee level. */
function LevelPrices({
  perDog,
  threePlus,
  onPerDog,
  onThreePlus,
}: {
  perDog: string;
  threePlus: string;
  onPerDog: (v: string) => void;
  onThreePlus: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1">
        <Label className="text-xs">Per dog</Label>
        <PriceInput value={perDog} onChange={onPerDog} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">3 or more dogs</Label>
        <PriceInput value={threePlus} onChange={onThreePlus} />
      </div>
    </div>
  );
}

function BelowTwoDogsHint({ perDog }: { perDog: string }) {
  return (
    <p className="text-[11px] text-destructive">
      The &quot;3 or more dogs&quot; price can&apos;t be less than two dogs (£{(penceFromPounds(perDog) * 2 / 100).toFixed(2)}).
    </p>
  );
}
