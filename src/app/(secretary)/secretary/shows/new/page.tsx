'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  CalendarDays,
  Sparkles,
  Trophy,
  Award,
  PawPrint,
} from 'lucide-react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

/* ────────────────────────────────────────────────────────────────────────
   Three questions, one at a time (the GOV.UK "one thing per page" pattern).
   Everything else — fees, classes, venue, judges, dates — is gathered
   afterwards by the Setup Wizard on the show page, with help at every step.
   The job here is to get a confident secretary from "New Show" to "it
   exists!" in under a minute, without a single word of jargon.
   ──────────────────────────────────────────────────────────────────────── */

type ShowTypeOption = {
  value: 'open' | 'limited' | 'championship' | 'premier_open' | 'primary' | 'companion';
  label: string;
  blurb: string;
};

// Ordered by how common they are for the clubs we serve — the everyday
// choices first, the rare ones last. Plain one-liners, no RKC shorthand.
const SHOW_TYPES: ShowTypeOption[] = [
  { value: 'open', label: 'Open Show', blurb: 'The everyday show — anyone can enter, no tickets at stake.' },
  { value: 'championship', label: 'Championship Show', blurb: 'The big one — Challenge Certificates are on offer.' },
  { value: 'limited', label: 'Limited Show', blurb: 'Members and a smaller field — a friendlier, local affair.' },
  { value: 'premier_open', label: 'Premier Open Show', blurb: 'A larger Open show, a step up from the usual.' },
  { value: 'primary', label: 'Primary Show', blurb: 'A small, gentle starter show for newcomers.' },
  { value: 'companion', label: 'Companion Show', blurb: 'Fun classes for any dog — pedigree or not.' },
];

type Step = 'name' | 'type' | 'when';

export default function NewShowPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [showType, setShowType] = useState<ShowTypeOption['value'] | null>(null);
  const [orgId, setOrgId] = useState<string>('');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [multiDay, setMultiDay] = useState(false);
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const { data: dashboard } = trpc.secretary.getDashboard.useQuery();
  const utils = trpc.useUtils();
  const createShow = trpc.shows.create.useMutation();

  const organisations = useMemo(() => dashboard?.organisations ?? [], [dashboard]);
  const currentOrg = organisations.find((o) => o.id === orgId);
  const isWusv = currentOrg?.showRuleset === 'wusv';

  // One club → pick it automatically; the secretary never sees the question.
  useEffect(() => {
    if (organisations.length === 1 && !orgId) setOrgId(organisations[0].id);
  }, [organisations, orgId]);

  // SV/WUSV regionals are always championship-class under the hood — don't
  // ask, just set it, so those clubs jump straight from name to date.
  useEffect(() => {
    if (isWusv && !showType) setShowType('championship');
  }, [isWusv, showType]);

  // A friendly default name the moment we know the club: "<Club> Open Show
  // 2026". She can keep it, tweak it, or clear it — but she never faces a
  // blank box wondering what to type.
  useEffect(() => {
    if (name || !currentOrg) return;
    const year = new Date().getFullYear();
    setName(`${currentOrg.name.trim()} Open Show ${year}`);
  }, [currentOrg, name]);

  const steps: Step[] = useMemo(
    () => (isWusv ? ['name', 'when'] : ['name', 'type', 'when']),
    [isWusv],
  );
  const stepIndex = steps.indexOf(step);

  const goNext = useCallback(() => {
    const next = steps[stepIndex + 1];
    if (next) setStep(next);
  }, [steps, stepIndex]);

  const goBack = useCallback(() => {
    const prev = steps[stepIndex - 1];
    if (prev) setStep(prev);
  }, [steps, stepIndex]);

  const canContinue =
    step === 'name'
      ? name.trim().length > 0 && !!orgId
      : step === 'type'
        ? !!showType
        : !!startDate;

  async function handleCreate() {
    if (!orgId || !showType || !startDate) return;
    setSubmitting(true);
    try {
      const start = format(startDate, 'yyyy-MM-dd');
      const end = multiDay && endDate ? format(endDate, 'yyyy-MM-dd') : start;

      const show = await createShow.mutateAsync({
        name: name.trim(),
        showType,
        // Derived from the club for the common case — single-breed RKC clubs
        // and WUSV clubs never need to answer "scope". General/all-breed clubs
        // start single_breed here and widen breeds in the Setup Wizard.
        showScope: currentOrg?.breedId ? 'single_breed' : 'general',
        showRuleset: (currentOrg?.showRuleset as 'rkc' | 'wusv') ?? 'rkc',
        breedId: currentOrg?.breedId ?? undefined,
        organisationId: orgId,
        startDate: start,
        endDate: end,
      });

      await utils.shows.getById.prefetch({ id: show.id });
      // The destination fires the celebration on ?created=true — landing
      // straight in the Setup Wizard, confetti and all.
      router.push(`/secretary/shows/${show.slug ?? show.id}?created=true`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong';
      toast.error("We couldn't create the show just yet", { description: message });
      setSubmitting(false);
    }
  }

  // No clubs yet — send them to set one up first, kindly.
  if (dashboard && organisations.length === 0) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <PawPrint className="mb-4 size-12 text-primary/70" />
        <h1 className="font-serif text-2xl font-semibold text-foreground">
          Let&rsquo;s set up your club first
        </h1>
        <p className="mt-3 text-muted-foreground">
          Every show belongs to a club. It only takes a minute, then you can
          create as many shows as you like.
        </p>
        <Button asChild className="mt-6 min-h-[2.75rem]">
          <Link href="/secretary/club">Set up my club</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="relative mx-auto max-w-xl px-5 pt-6 sm:pt-10">
      {/* ── Top bar: back + progress dots ─────────────────────────── */}
      <div className="mb-8 flex items-center justify-between">
        {stepIndex > 0 ? (
          <button
            onClick={goBack}
            className="inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-full px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back
          </button>
        ) : (
          <Link
            href="/secretary"
            className="inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-full px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> My shows
          </Link>
        )}
        <div className="flex items-center gap-2" aria-hidden>
          {steps.map((s, i) => (
            <span
              key={s}
              className={cn(
                'h-2 rounded-full transition-all duration-500',
                i === stepIndex
                  ? 'w-7 bg-primary'
                  : i < stepIndex
                    ? 'w-2 bg-primary/60'
                    : 'w-2 bg-muted-foreground/20',
              )}
            />
          ))}
        </div>
      </div>

      {/* ── The question ──────────────────────────────────────────── */}
      <div key={step} className="animate-[fadeup_.45s_ease]">
        {step === 'name' && (
          <StepShell
            kicker="New show"
            title="What shall we call your show?"
            help="Most clubs use their name, the kind of show, and the year — but it's your call. You can change this any time."
          >
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && canContinue && goNext()}
              placeholder="e.g. Clyde Valley GSD Club Open Show 2026"
              className="h-14 rounded-2xl border-2 px-4 text-lg shadow-sm focus-visible:ring-2"
            />

            {organisations.length > 1 && (
              <div className="mt-6">
                <p className="mb-2 text-sm font-medium text-muted-foreground">
                  Which club is this for?
                </p>
                <div className="grid gap-2">
                  {organisations.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => setOrgId(o.id)}
                      className={cn(
                        'flex min-h-[2.75rem] items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-all',
                        orgId === o.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/40',
                      )}
                    >
                      <span className="font-medium">{o.name}</span>
                      {orgId === o.id && <Check className="size-5 text-primary" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </StepShell>
        )}

        {step === 'type' && (
          <StepShell
            kicker="New show"
            title="What kind of show is it?"
            help="Not sure? Most clubs run an Open Show. You can change this later."
          >
            <div className="grid gap-3">
              {SHOW_TYPES.map((t) => {
                const selected = showType === t.value;
                return (
                  <button
                    key={t.value}
                    onClick={() => {
                      setShowType(t.value);
                      // A small beat so the selection is felt before we move on.
                      setTimeout(goNext, 220);
                    }}
                    className={cn(
                      'group flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all',
                      selected
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border hover:border-primary/40 hover:bg-muted/40',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 grid size-9 shrink-0 place-items-center rounded-full transition-colors',
                        selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {t.value === 'championship' ? (
                        <Trophy className="size-4" />
                      ) : t.value === 'companion' ? (
                        <PawPrint className="size-4" />
                      ) : (
                        <Award className="size-4" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-serif text-lg font-semibold leading-tight">
                        {t.label}
                      </span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">
                        {t.blurb}
                      </span>
                    </span>
                    {selected && <Check className="ml-auto size-5 shrink-0 text-primary" />}
                  </button>
                );
              })}
            </div>
          </StepShell>
        )}

        {step === 'when' && (
          <StepShell
            kicker="New show"
            title="When is it?"
            help="Just the date for now — opening and closing dates for entries come next, with a hand."
          >
            <div className="rounded-2xl border-2 border-border bg-card p-2 shadow-sm">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={(d) => {
                  setStartDate(d);
                  if (d && (!endDate || endDate < d)) setEndDate(d);
                }}
                disabled={{ before: new Date() }}
                className="mx-auto"
              />
            </div>

            {startDate && (
              <p className="mt-4 flex items-center justify-center gap-2 text-center text-base font-medium text-foreground">
                <CalendarDays className="size-4 text-primary" />
                {format(startDate, 'EEEE d MMMM yyyy')}
              </p>
            )}

            <div className="mt-5 flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-3">
              <label htmlFor="multiday" className="text-sm font-medium">
                Runs over more than one day?
              </label>
              <Switch
                id="multiday"
                checked={multiDay}
                onCheckedChange={(v) => {
                  setMultiDay(v);
                  if (v && startDate) setEndDate(addDays(startDate, 1));
                }}
              />
            </div>

            {multiDay && startDate && (
              <div className="mt-4 rounded-2xl border-2 border-border bg-card p-2 shadow-sm">
                <p className="px-3 pt-2 text-sm font-medium text-muted-foreground">
                  Last day of the show
                </p>
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={setEndDate}
                  disabled={{ before: startDate }}
                  className="mx-auto"
                />
              </div>
            )}
          </StepShell>
        )}
      </div>

      {/* ── Action: inline, full-width on mobile, so it never fights the
            shell's bottom tab bar. One clear primary action per screen. ── */}
      <div className="mt-10 flex justify-stretch sm:justify-end">
        {step !== 'when' ? (
          <Button
            size="lg"
            disabled={!canContinue}
            onClick={goNext}
            className="min-h-[3rem] w-full gap-2 rounded-2xl text-base sm:w-auto sm:rounded-full sm:px-8"
          >
            Continue <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button
            size="lg"
            disabled={!canContinue || submitting}
            onClick={handleCreate}
            className="min-h-[3rem] w-full gap-2 rounded-2xl text-base sm:w-auto sm:rounded-full sm:px-8"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Creating&hellip;
              </>
            ) : (
              <>
                <Sparkles className="size-4" /> Create my show
              </>
            )}
          </Button>
        )}
      </div>

      <style jsx global>{`
        @keyframes fadeup {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
      `}</style>
    </div>
  );
}

/* ── Shared layout for each question ─────────────────────────────── */
function StepShell({
  kicker,
  title,
  help,
  children,
}: {
  kicker: string;
  title: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-primary/70">
        {kicker}
      </p>
      <h1 className="font-serif text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
        {title}
      </h1>
      <p className="mt-3 text-[0.975rem] leading-relaxed text-muted-foreground">
        {help}
      </p>
      <div className="mt-7">{children}</div>
    </div>
  );
}
