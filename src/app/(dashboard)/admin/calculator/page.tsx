'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  Calculator,
  RotateCcw,
  Save,
  Trash2,
  TrendingUp,
  TrendingDown,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { PageHeader, PageTitle, PageDescription } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';

// ── Defaults seeded from Amanda's costing spreadsheet ─────────────

const DEFAULTS = {
  // Show shape
  entries: 100,
  catalogues: 50,
  catalogueFormat: 'standard' as 'standard' | 'by_class',
  cataloguePages: 24,
  classes: 22,
  placesPerClass: 5,
  judges: 1,

  // Catalogue print cost (Mixam, per copy + delivery)
  mixamCostPerCopy: 1.10,
  mixamDelivery: 6.25,

  // Sundry unit costs (Remi home-print rates)
  prizeCardCost: 0.11,
  ringNumberCost: 0.02,
  awardBoardCost: 0.16,
  judgesBookPageCost: 0.041,

  // Sundry quantities
  ringNumbers: 100,
  awardBoards: 2,
  judgesBookPagesPerJudge: 24,

  // Delivery to the club
  dpdCost: 2.99,

  // What Remi charges the club
  showEssentialsPrice: 80,
  perCataloguePriceStandard: 1.65,
  perCataloguePriceByClass: 2.05,

  // Exhibitor surcharge
  surchargeFlat: 1,
  surchargePercent: 0.01,
  surchargeCap: 2.50,
  avgEntryFee: 25,
  avgEntriesPerOrder: 1.5,

  // Stripe
  stripePercent: 0.015,
  stripeFlat: 0.20,

  // Volume
  showsPerMonth: 4,

  // Running costs (monthly £)
  claudeCost: 90,
  renderWebCost: 20,
  renderDbCost: 19,
  resendCost: 20,
  domainCost: 1,
  backupCost: 5,
  otherCost: 10,
};

type Inputs = typeof DEFAULTS;

const STORAGE_KEY = 'remi.calculator.inputs.v1';
const SCENARIOS_KEY = 'remi.calculator.scenarios.v1';

type Scenario = { name: string; inputs: Inputs };

// ── Pure calculation layer ────────────────────────────────────────

function calc(i: Inputs) {
  // ── Per show ──
  const prizeCardsTotal = i.classes * i.placesPerClass * i.prizeCardCost;
  const ringNumbersTotal = i.ringNumbers * i.ringNumberCost;
  const awardBoardsTotal = i.awardBoards * i.awardBoardCost;
  const judgesBookTotal = i.judges * i.judgesBookPagesPerJudge * i.judgesBookPageCost;
  const sundriesTotal = prizeCardsTotal + ringNumbersTotal + awardBoardsTotal + judgesBookTotal;

  const catalogueCost = i.mixamCostPerCopy * i.catalogues + (i.catalogues > 0 ? i.mixamDelivery : 0);

  const fulfilmentCost = catalogueCost + sundriesTotal + i.dpdCost;

  const perCataloguePrice =
    i.catalogueFormat === 'by_class' ? i.perCataloguePriceByClass : i.perCataloguePriceStandard;
  const packageRevenue = i.showEssentialsPrice + i.catalogues * perCataloguePrice;

  // ── Exhibitor surcharge → Stripe → Remi net ──
  // The surcharge & Stripe fee are per ORDER, not per entry. A typical
  // exhibitor enters several dogs in one transaction.
  const orders = i.avgEntriesPerOrder > 0 ? i.entries / i.avgEntriesPerOrder : 0;
  const avgOrderValue = i.avgEntryFee * i.avgEntriesPerOrder;
  const surchargeRaw = i.surchargeFlat + i.surchargePercent * avgOrderValue;
  const surchargeCharged = Math.min(surchargeRaw, i.surchargeCap);
  const exhibitorPays = avgOrderValue + surchargeCharged;
  const stripeFeePerOrder = i.stripePercent * exhibitorPays + i.stripeFlat;
  const netSurchargePerOrder = surchargeCharged - stripeFeePerOrder;
  const totalNetSurcharge = orders * netSurchargePerOrder;

  // ── Per-show profit ──
  const fulfilmentProfit = packageRevenue - fulfilmentCost;
  const showProfit = fulfilmentProfit + totalNetSurcharge;

  // ── Monthly ──
  const monthlyRevenue = i.showsPerMonth * showProfit;
  const monthlyFixedCost =
    i.claudeCost +
    i.renderWebCost +
    i.renderDbCost +
    i.resendCost +
    i.domainCost +
    i.backupCost +
    i.otherCost;
  const monthlyNet = monthlyRevenue - monthlyFixedCost;
  const breakEvenShows = showProfit > 0 ? monthlyFixedCost / showProfit : Infinity;

  return {
    prizeCardsTotal,
    ringNumbersTotal,
    awardBoardsTotal,
    judgesBookTotal,
    sundriesTotal,
    catalogueCost,
    fulfilmentCost,
    packageRevenue,
    orders,
    avgOrderValue,
    surchargeCharged,
    stripeFeePerOrder,
    netSurchargePerOrder,
    totalNetSurcharge,
    fulfilmentProfit,
    showProfit,
    monthlyRevenue,
    monthlyFixedCost,
    monthlyNet,
    breakEvenShows,
  };
}

// ── Formatting ────────────────────────────────────────────────────

const fmtGBP = (v: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2 }).format(v);
const fmtGBPint = (v: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(v);
const fmtPence = (v: number) => `${(v * 100).toFixed(1)}p`;

// ── Reusable input row ────────────────────────────────────────────

function NumberField({
  label,
  value,
  onChange,
  step = 1,
  prefix,
  suffix,
  hint,
  decimals,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  prefix?: string;
  suffix?: string;
  hint?: string;
  decimals?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-3 text-sm text-muted-foreground pointer-events-none">{prefix}</span>
        )}
        <Input
          type="number"
          inputMode="decimal"
          step={step}
          value={Number.isFinite(value) ? (decimals !== undefined ? value.toFixed(decimals) : value) : 0}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            onChange(Number.isFinite(n) ? n : 0);
          }}
          className={cn('h-10', prefix && 'pl-7', suffix && 'pr-12')}
        />
        {suffix && (
          <span className="absolute right-3 text-sm text-muted-foreground pointer-events-none">{suffix}</span>
        )}
      </div>
      {hint && <p className="text-[11px] text-muted-foreground leading-tight">{hint}</p>}
    </div>
  );
}

// ── Section card ──────────────────────────────────────────────────

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent className="p-4 pt-2 grid gap-3 sm:grid-cols-2">{children}</CardContent>
    </Card>
  );
}

// ── Result row ────────────────────────────────────────────────────

function Row({
  label,
  value,
  emphasize,
  hint,
  negative,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  hint?: string;
  negative?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className={cn('text-sm', emphasize ? 'font-semibold' : 'text-muted-foreground')}>
          {label}
        </p>
        {hint && <p className="text-[11px] text-muted-foreground leading-tight">{hint}</p>}
      </div>
      <p
        className={cn(
          'tabular-nums shrink-0',
          emphasize ? 'text-base font-semibold' : 'text-sm',
          negative && 'text-red-600',
        )}
      >
        {value}
      </p>
    </div>
  );
}

// ── Stacked bar (cost vs revenue visualisation) ───────────────────

function StackBar({
  segments,
  total,
}: {
  segments: { label: string; value: number; color: string }[];
  total: number;
}) {
  if (total <= 0) return <div className="h-6 rounded bg-muted" />;
  return (
    <div className="space-y-1.5">
      <div className="flex h-6 overflow-hidden rounded">
        {segments.map((s, idx) => {
          const pct = (s.value / total) * 100;
          if (pct <= 0) return null;
          return (
            <div
              key={idx}
              className={cn('flex items-center justify-center', s.color)}
              style={{ width: `${pct}%` }}
              title={`${s.label}: ${fmtGBP(s.value)}`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        {segments.map((s, idx) => (
          <span key={idx} className="flex items-center gap-1">
            <span className={cn('size-2 rounded-sm', s.color)} />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="font-medium tabular-nums">{fmtGBP(s.value)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────

export default function CalculatorPage() {
  const { data: session } = useSession();
  const [inputs, setInputs] = useState<Inputs>(DEFAULTS);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount (client-only)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setInputs({ ...DEFAULTS, ...JSON.parse(raw) });
      const s = localStorage.getItem(SCENARIOS_KEY);
      if (s) setScenarios(JSON.parse(s));
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  // Persist on change (after hydration)
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs));
  }, [inputs, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
  }, [scenarios, hydrated]);

  const set = useCallback(<K extends keyof Inputs>(key: K, value: Inputs[K]) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }, []);

  const result = useMemo(() => calc(inputs), [inputs]);

  const saveScenario = useCallback(() => {
    const name = prompt('Name this scenario:');
    if (!name) return;
    setScenarios((prev) => [...prev.filter((s) => s.name !== name), { name, inputs }]);
  }, [inputs]);

  const loadScenario = useCallback((name: string) => {
    const s = scenarios.find((x) => x.name === name);
    if (s) setInputs({ ...DEFAULTS, ...s.inputs });
  }, [scenarios]);

  const deleteScenario = useCallback((name: string) => {
    setScenarios((prev) => prev.filter((s) => s.name !== name));
  }, []);

  const reset = useCallback(() => {
    if (confirm('Reset all inputs to defaults?')) setInputs(DEFAULTS);
  }, []);

  // Admin-only guard
  if (session?.user && (session.user as Record<string, unknown>).role !== 'admin') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">Admin access required</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <PageHeader>
        <div>
          <PageTitle>
            <Calculator className="inline-block size-7 mr-2 text-primary" />
            Pricing Calculator
          </PageTitle>
          <PageDescription>
            Sandbox for modelling per-show profit, monthly P&amp;L, and break-even at any pricing.
            All inputs save locally — only you see your scenarios.
          </PageDescription>
        </div>
      </PageHeader>

      {/* ── Headline figures (sticky bar at top of mobile, side panel on lg) ─ */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <HeadlineCard
          label="Profit per show"
          value={fmtGBP(result.showProfit)}
          tone={result.showProfit >= 0 ? 'good' : 'bad'}
          subtext={`= ${fmtGBP(result.fulfilmentProfit)} fulfilment + ${fmtGBP(result.totalNetSurcharge)} surcharge`}
        />
        <HeadlineCard
          label="Monthly net profit"
          value={fmtGBP(result.monthlyNet)}
          tone={result.monthlyNet >= 0 ? 'good' : 'bad'}
          subtext={`${inputs.showsPerMonth} shows/mo − ${fmtGBPint(result.monthlyFixedCost)} running costs`}
        />
        <HeadlineCard
          label="Break-even shows / month"
          value={Number.isFinite(result.breakEvenShows) ? result.breakEvenShows.toFixed(1) : '∞'}
          tone={result.breakEvenShows <= inputs.showsPerMonth ? 'good' : 'warn'}
          subtext={
            Number.isFinite(result.breakEvenShows)
              ? `at ${fmtGBP(result.showProfit)} profit/show`
              : 'show profit is zero or negative'
          }
        />
        <HeadlineCard
          label="Margin per show"
          value={
            result.packageRevenue + result.totalNetSurcharge > 0
              ? `${((result.showProfit / (result.packageRevenue + result.totalNetSurcharge)) * 100).toFixed(0)}%`
              : '—'
          }
          tone="neutral"
          subtext={`on ${fmtGBP(result.packageRevenue + result.totalNetSurcharge)} gross revenue`}
        />
      </div>

      {/* ── Scenarios bar ─ */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <Button onClick={saveScenario} size="sm" variant="outline" className="gap-2">
            <Save className="size-3.5" /> Save scenario
          </Button>
          <Button onClick={reset} size="sm" variant="ghost" className="gap-2">
            <RotateCcw className="size-3.5" /> Reset
          </Button>
          {scenarios.length > 0 && <Separator orientation="vertical" className="h-6 mx-1" />}
          {scenarios.map((s) => (
            <div key={s.name} className="flex items-center gap-1 rounded-md border bg-background pl-2 pr-1 py-1">
              <button
                onClick={() => loadScenario(s.name)}
                className="text-xs font-medium hover:text-primary transition-colors"
              >
                {s.name}
              </button>
              <button
                onClick={() => deleteScenario(s.name)}
                className="rounded p-0.5 text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                aria-label={`Delete ${s.name}`}
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}
          {scenarios.length === 0 && (
            <span className="text-xs text-muted-foreground ml-2">
              Save the current numbers as a named scenario to compare alternatives.
            </span>
          )}
        </CardContent>
      </Card>

      {/* ── Two-column: inputs (left) + results (right) ─ */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* ── Inputs ─ */}
        <div className="lg:col-span-3 space-y-4">
          <Section title="Show shape" description="Size and content of the show being priced.">
            <NumberField label="Entries" value={inputs.entries} onChange={(v) => set('entries', v)} />
            <NumberField label="Catalogues ordered" value={inputs.catalogues} onChange={(v) => set('catalogues', v)} />
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Catalogue format</Label>
              <Select
                value={inputs.catalogueFormat}
                onValueChange={(v) => set('catalogueFormat', v as 'standard' | 'by_class')}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="by_class">By class</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <NumberField label="Catalogue pages" value={inputs.cataloguePages} onChange={(v) => set('cataloguePages', v)} />
            <NumberField label="Classes" value={inputs.classes} onChange={(v) => set('classes', v)} />
            <NumberField
              label="Places per class"
              value={inputs.placesPerClass}
              onChange={(v) => set('placesPerClass', v)}
              hint="Usually 4 (1st–RES) or 5 (1st–VHC)"
            />
            <NumberField label="Judges (for award book)" value={inputs.judges} onChange={(v) => set('judges', v)} />
          </Section>

          <Section title="Catalogue print cost" description="What Mixam charges Remi.">
            <NumberField
              label="Cost per copy (Mixam)"
              value={inputs.mixamCostPerCopy}
              onChange={(v) => set('mixamCostPerCopy', v)}
              prefix="£"
              step={0.01}
              decimals={2}
              hint="Re-quote on Mixam for your spec"
            />
            <NumberField
              label="Mixam delivery"
              value={inputs.mixamDelivery}
              onChange={(v) => set('mixamDelivery', v)}
              prefix="£"
              step={0.25}
              decimals={2}
            />
          </Section>

          <Section title="Sundry unit costs" description="Cost per unit when Amanda prints in-house.">
            <NumberField
              label="Prize card"
              value={inputs.prizeCardCost}
              onChange={(v) => set('prizeCardCost', v)}
              prefix="£"
              step={0.01}
              decimals={2}
            />
            <NumberField
              label="Ring number (per set)"
              value={inputs.ringNumberCost}
              onChange={(v) => set('ringNumberCost', v)}
              prefix="£"
              step={0.01}
              decimals={2}
            />
            <NumberField
              label="Award board"
              value={inputs.awardBoardCost}
              onChange={(v) => set('awardBoardCost', v)}
              prefix="£"
              step={0.01}
              decimals={2}
            />
            <NumberField
              label="Judges book / page"
              value={inputs.judgesBookPageCost}
              onChange={(v) => set('judgesBookPageCost', v)}
              prefix="£"
              step={0.001}
              decimals={3}
            />
            <NumberField label="Ring numbers (count)" value={inputs.ringNumbers} onChange={(v) => set('ringNumbers', v)} />
            <NumberField label="Award boards (count)" value={inputs.awardBoards} onChange={(v) => set('awardBoards', v)} />
            <NumberField
              label="Pages per judge book"
              value={inputs.judgesBookPagesPerJudge}
              onChange={(v) => set('judgesBookPagesPerJudge', v)}
            />
            <NumberField
              label="DPD to club"
              value={inputs.dpdCost}
              onChange={(v) => set('dpdCost', v)}
              prefix="£"
              step={0.01}
              decimals={2}
            />
          </Section>

          <Section
            title="What Remi charges the club"
            description="Continuous model: a flat 'show essentials' fee + per-catalogue. Set per-catalogue to 0 to model a flat package."
          >
            <NumberField
              label="Show essentials"
              value={inputs.showEssentialsPrice}
              onChange={(v) => set('showEssentialsPrice', v)}
              prefix="£"
              step={5}
              decimals={2}
              hint="Covers sundries + Amanda + delivery"
            />
            <NumberField
              label="Per-catalogue (standard)"
              value={inputs.perCataloguePriceStandard}
              onChange={(v) => set('perCataloguePriceStandard', v)}
              prefix="£"
              step={0.05}
              decimals={2}
            />
            <NumberField
              label="Per-catalogue (by class)"
              value={inputs.perCataloguePriceByClass}
              onChange={(v) => set('perCataloguePriceByClass', v)}
              prefix="£"
              step={0.05}
              decimals={2}
            />
          </Section>

          <Section
            title="Exhibitor surcharge (Stripe)"
            description="What we add on top of the entry fee. Capped to protect multi-dog orders."
          >
            <NumberField
              label="Flat fee"
              value={inputs.surchargeFlat}
              onChange={(v) => set('surchargeFlat', v)}
              prefix="£"
              step={0.10}
              decimals={2}
            />
            <NumberField
              label="Percent of order"
              value={inputs.surchargePercent * 100}
              onChange={(v) => set('surchargePercent', v / 100)}
              suffix="%"
              step={0.1}
              decimals={1}
            />
            <NumberField
              label="Cap"
              value={inputs.surchargeCap}
              onChange={(v) => set('surchargeCap', v)}
              prefix="£"
              step={0.25}
              decimals={2}
            />
            <NumberField
              label="Avg entry fee"
              value={inputs.avgEntryFee}
              onChange={(v) => set('avgEntryFee', v)}
              prefix="£"
              step={1}
              decimals={2}
              hint="Per dog"
            />
            <NumberField
              label="Avg entries / order"
              value={inputs.avgEntriesPerOrder}
              onChange={(v) => set('avgEntriesPerOrder', v)}
              step={0.1}
              decimals={1}
              hint="Real shows: 1.2–1.7 dogs per order"
            />
            <NumberField
              label="Stripe percent"
              value={inputs.stripePercent * 100}
              onChange={(v) => set('stripePercent', v / 100)}
              suffix="%"
              step={0.05}
              decimals={2}
              hint="UK card: 1.5%"
            />
            <NumberField
              label="Stripe flat"
              value={inputs.stripeFlat}
              onChange={(v) => set('stripeFlat', v)}
              prefix="£"
              step={0.05}
              decimals={2}
              hint="UK card: £0.20"
            />
          </Section>

          <Section title="Volume" description="How many shows pass through the platform.">
            <NumberField
              label="Shows per month"
              value={inputs.showsPerMonth}
              onChange={(v) => set('showsPerMonth', v)}
              step={1}
            />
          </Section>

          <Section
            title="Running costs (monthly)"
            description="Fixed overhead. Shows/month × profit must clear this for the month to be in the black."
          >
            <NumberField
              label="Claude Code"
              value={inputs.claudeCost}
              onChange={(v) => set('claudeCost', v)}
              prefix="£"
              step={5}
              decimals={2}
              hint="£180/mo, half attributed to Remi"
            />
            <NumberField
              label="Render web service"
              value={inputs.renderWebCost}
              onChange={(v) => set('renderWebCost', v)}
              prefix="£"
              step={1}
              decimals={2}
            />
            <NumberField
              label="Render Postgres"
              value={inputs.renderDbCost}
              onChange={(v) => set('renderDbCost', v)}
              prefix="£"
              step={1}
              decimals={2}
            />
            <NumberField
              label="Resend (email)"
              value={inputs.resendCost}
              onChange={(v) => set('resendCost', v)}
              prefix="£"
              step={1}
              decimals={2}
            />
            <NumberField
              label="Domain (amortised)"
              value={inputs.domainCost}
              onChange={(v) => set('domainCost', v)}
              prefix="£"
              step={0.50}
              decimals={2}
            />
            <NumberField
              label="Backups (planned)"
              value={inputs.backupCost}
              onChange={(v) => set('backupCost', v)}
              prefix="£"
              step={1}
              decimals={2}
              hint="Currently £0 — we're not doing backups!"
            />
            <NumberField
              label="Other"
              value={inputs.otherCost}
              onChange={(v) => set('otherCost', v)}
              prefix="£"
              step={1}
              decimals={2}
            />
          </Section>
        </div>

        {/* ── Results panel ─ */}
        <div className="lg:col-span-2 space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-semibold">Per-show breakdown</CardTitle>
              <CardDescription className="text-xs">
                One show with the inputs you've set
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Cost stack</p>
                  <StackBar
                    total={result.fulfilmentCost}
                    segments={[
                      { label: 'Catalogues', value: result.catalogueCost, color: 'bg-blue-400' },
                      { label: 'Sundries', value: result.sundriesTotal, color: 'bg-amber-400' },
                      { label: 'DPD', value: inputs.dpdCost, color: 'bg-slate-400' },
                    ]}
                  />
                </div>

                <Separator />

                <div className="space-y-0.5">
                  <Row label="Catalogue print + delivery" value={fmtGBP(result.catalogueCost)} />
                  <Row label="Sundries — prize cards" value={fmtGBP(result.prizeCardsTotal)} hint={`${inputs.classes} × ${inputs.placesPerClass} × ${fmtPence(inputs.prizeCardCost)}`} />
                  <Row label="Sundries — ring numbers" value={fmtGBP(result.ringNumbersTotal)} />
                  <Row label="Sundries — award boards" value={fmtGBP(result.awardBoardsTotal)} />
                  <Row label="Sundries — judges book" value={fmtGBP(result.judgesBookTotal)} />
                  <Row label="DPD to club" value={fmtGBP(inputs.dpdCost)} />
                  <Row label="Total fulfilment cost" value={fmtGBP(result.fulfilmentCost)} emphasize />
                </div>

                <Separator />

                <div className="space-y-0.5">
                  <Row label="Package revenue" value={fmtGBP(result.packageRevenue)} hint={`${fmtGBP(inputs.showEssentialsPrice)} essentials + ${inputs.catalogues} × ${fmtGBP(inputs.catalogueFormat === 'by_class' ? inputs.perCataloguePriceByClass : inputs.perCataloguePriceStandard)}`} />
                  <Row label="Fulfilment profit" value={fmtGBP(result.fulfilmentProfit)} negative={result.fulfilmentProfit < 0} />
                </div>

                <Separator />

                <div className="space-y-0.5">
                  <Row
                    label="Avg order value"
                    value={fmtGBP(result.avgOrderValue)}
                    hint={`${inputs.avgEntriesPerOrder.toFixed(1)} dogs × ${fmtGBP(inputs.avgEntryFee)}`}
                  />
                  <Row
                    label="Surcharge / order"
                    value={fmtGBP(result.surchargeCharged)}
                    hint={`${fmtGBP(inputs.surchargeFlat)} + ${(inputs.surchargePercent * 100).toFixed(1)}% of ${fmtGBP(result.avgOrderValue)}, capped ${fmtGBP(inputs.surchargeCap)}`}
                  />
                  <Row
                    label="Stripe fee / order"
                    value={fmtGBP(result.stripeFeePerOrder)}
                    hint={`${(inputs.stripePercent * 100).toFixed(2)}% × ${fmtGBP(result.avgOrderValue + result.surchargeCharged)} + ${fmtGBP(inputs.stripeFlat)}`}
                  />
                  <Row
                    label="Net surcharge / order"
                    value={fmtGBP(result.netSurchargePerOrder)}
                    negative={result.netSurchargePerOrder < 0}
                  />
                  <Row
                    label={`Total net surcharge (${result.orders.toFixed(0)} orders)`}
                    value={fmtGBP(result.totalNetSurcharge)}
                    emphasize
                    negative={result.totalNetSurcharge < 0}
                  />
                </div>

                <Separator />

                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
                  <Row
                    label="Profit per show"
                    value={fmtGBP(result.showProfit)}
                    emphasize
                    negative={result.showProfit < 0}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-semibold">Monthly P&amp;L</CardTitle>
              <CardDescription className="text-xs">
                {inputs.showsPerMonth} {inputs.showsPerMonth === 1 ? 'show' : 'shows'} per month
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Revenue vs fixed costs</p>
                  <StackBar
                    total={Math.max(result.monthlyRevenue, result.monthlyFixedCost)}
                    segments={
                      result.monthlyRevenue >= result.monthlyFixedCost
                        ? [
                            { label: 'Fixed costs', value: result.monthlyFixedCost, color: 'bg-red-400' },
                            { label: 'Net profit', value: result.monthlyRevenue - result.monthlyFixedCost, color: 'bg-emerald-500' },
                          ]
                        : [
                            { label: 'Revenue', value: result.monthlyRevenue, color: 'bg-amber-400' },
                            { label: 'Shortfall', value: result.monthlyFixedCost - result.monthlyRevenue, color: 'bg-red-500' },
                          ]
                    }
                  />
                </div>

                <Separator />

                <Row label="Show profit × volume" value={fmtGBP(result.monthlyRevenue)} />
                <Row label="Fixed costs" value={`− ${fmtGBP(result.monthlyFixedCost)}`} negative />

                <div className={cn(
                  'rounded-lg p-3 border',
                  result.monthlyNet >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200',
                )}>
                  <Row
                    label={result.monthlyNet >= 0 ? 'Monthly profit' : 'Monthly loss'}
                    value={fmtGBP(result.monthlyNet)}
                    emphasize
                    negative={result.monthlyNet < 0}
                  />
                </div>

                <Separator />

                <div className="rounded-lg bg-muted/40 p-3 flex items-start gap-2">
                  {result.breakEvenShows <= inputs.showsPerMonth ? (
                    <TrendingUp className="size-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <TrendingDown className="size-4 text-amber-600 shrink-0 mt-0.5" />
                  )}
                  <div className="text-xs leading-relaxed">
                    {Number.isFinite(result.breakEvenShows) ? (
                      <>
                        Break-even at{' '}
                        <span className="font-semibold tabular-nums">{result.breakEvenShows.toFixed(1)}</span>{' '}
                        shows / month.{' '}
                        {result.breakEvenShows <= inputs.showsPerMonth
                          ? `You're ${(inputs.showsPerMonth - result.breakEvenShows).toFixed(1)} shows ahead.`
                          : `You need ${(result.breakEvenShows - inputs.showsPerMonth).toFixed(1)} more shows / month to clear costs.`}
                      </>
                    ) : (
                      <>
                        Break-even unreachable — show profit is{' '}
                        <span className="font-semibold">{fmtGBP(result.showProfit)}</span>. Fix the
                        per-show maths first.
                      </>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-muted/30">
            <CardContent className="p-4">
              <div className="flex items-start gap-2">
                <Info className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="text-xs text-muted-foreground leading-relaxed space-y-2">
                  <p>
                    <span className="font-medium text-foreground">Continuous pricing:</span> the package
                    revenue scales with catalogues ordered — no cliffs. To model the old tiered
                    package, set per-catalogue fields to 0 and put the full package price into
                    "Show essentials".
                  </p>
                  <p>
                    <span className="font-medium text-foreground">Surcharge net:</span> can go
                    negative on big multi-dog orders that hit the cap if Stripe's fee exceeds the
                    cap. That's the "we swallow the merchant fee" story.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── Headline metric card ──────────────────────────────────────────

function HeadlineCard({
  label,
  value,
  subtext,
  tone,
}: {
  label: string;
  value: string;
  subtext: string;
  tone: 'good' | 'bad' | 'warn' | 'neutral';
}) {
  const tones = {
    good: 'border-emerald-200 bg-emerald-50',
    bad: 'border-red-200 bg-red-50',
    warn: 'border-amber-200 bg-amber-50',
    neutral: 'border-border bg-card',
  };
  const valueTones = {
    good: 'text-emerald-700',
    bad: 'text-red-700',
    warn: 'text-amber-700',
    neutral: 'text-foreground',
  };
  return (
    <Card className={cn('transition-colors', tones[tone])}>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={cn('text-2xl font-bold tabular-nums mt-1', valueTones[tone])}>{value}</p>
        <p className="text-[11px] text-muted-foreground mt-1 leading-tight">{subtext}</p>
      </CardContent>
    </Card>
  );
}
