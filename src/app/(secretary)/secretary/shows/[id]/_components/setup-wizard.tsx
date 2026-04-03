'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Loader2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { penceToPoundsString, poundsToPence } from '@/lib/date-utils';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PostcodeLookup, formatAddress } from '@/components/postcode-lookup';
import type { RouterOutputs } from '@/server/trpc/router';
import { ClassManager, BulkClassCreator } from './class-manager';
import { JudgesSection } from './judge-section';
import { ScheduleSettingsForm } from './schedule-settings-form';
import { SundryItemManager } from './sundry-item-manager';

type Show = NonNullable<RouterOutputs['shows']['getById']>;

// ── Step definitions ──────────────────────────────────────

const STEPS = [
  { id: 'classes', label: 'Classes & Breeds', shortLabel: 'Classes' },
  { id: 'judge', label: 'Judge', shortLabel: 'Judge' },
  { id: 'details', label: 'Show Details', shortLabel: 'Details' },
  { id: 'schedule', label: 'Schedule', shortLabel: 'Schedule' },
  { id: 'open', label: 'Open Entries', shortLabel: 'Open' },
] as const;

type StepId = (typeof STEPS)[number]['id'];

interface SetupWizardProps {
  showId: string;
  show: Show;
}

export function SetupWizard({ showId, show }: SetupWizardProps) {
  // ── All hooks first (Rules of Hooks!) ──────────────

  const { data: autoDetect } = trpc.secretary.getChecklistAutoDetect.useQuery(
    { showId },
    { staleTime: 15_000 },
  );

  const [activeStep, setActiveStep] = useState<StepId>('classes');
  const [initialized, setInitialized] = useState(false);

  // Derive step completion from server data
  const stepComplete = useCallback(
    (stepId: StepId): boolean => {
      if (!autoDetect) return false;
      switch (stepId) {
        case 'classes':
          return autoDetect.classes_created === true;
        case 'judge':
          return autoDetect.judges_assigned === true;
        case 'details':
          return (
            autoDetect.entry_fees_set === true &&
            autoDetect.entry_close_date_set === true &&
            autoDetect.secretary_details_set === true
          );
        case 'schedule':
          return show.scheduleData != null;
        case 'open':
          return false; // This step is "done" when entries are opened
        default:
          return false;
      }
    },
    [autoDetect, show.scheduleData],
  );

  // Auto-open first incomplete step on mount
  useEffect(() => {
    if (initialized || !autoDetect) return;
    const firstIncomplete = STEPS.find((s) => !stepComplete(s.id));
    if (firstIncomplete) {
      setActiveStep(firstIncomplete.id);
    }
    setInitialized(true);
  }, [autoDetect, initialized, stepComplete]);

  // ── Render ─────────────────────────────────────────

  const currentStepIndex = STEPS.findIndex((s) => s.id === activeStep);
  const completedCount = STEPS.filter((s) => stepComplete(s.id)).length;

  function goNext() {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setActiveStep(STEPS[nextIndex].id);
      // Scroll to top of wizard so the new step is visible
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }
  }

  function goBack() {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setActiveStep(STEPS[prevIndex].id);
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }
  }

  return (
    <div className="space-y-4">
      {/* Intro banner — only shown when not all steps are complete */}
      {completedCount < STEPS.length && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <p className="text-sm font-medium text-primary">
            Let&apos;s get your show ready!
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Complete these {STEPS.length} steps to open entries. You can do them in any order.
          </p>
        </div>
      )}

      {/* Mobile: text + progress bar */}
      <div className="sm:hidden">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            Step {currentStepIndex + 1} of {STEPS.length}:{' '}
            {STEPS[currentStepIndex].label}
          </span>
          <Badge variant="secondary" className="text-xs">
            {completedCount}/{STEPS.length}
          </Badge>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{
              width: `${((completedCount) / STEPS.length) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Desktop: numbered circles connected by lines */}
      <div className="hidden sm:block">
        <div className="flex items-center justify-between">
          {STEPS.map((step, i) => {
            const isComplete = stepComplete(step.id);
            const isCurrent = step.id === activeStep;

            return (
              <div key={step.id} className="flex flex-1 items-center">
                {/* Circle + label */}
                <button
                  type="button"
                  onClick={() => setActiveStep(step.id)}
                  className="flex flex-col items-center gap-1.5 min-h-[2.75rem]"
                >
                  <div
                    className={cn(
                      'flex size-8 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                      isComplete
                        ? 'bg-emerald-500 text-white'
                        : isCurrent
                          ? 'ring-2 ring-primary bg-background text-primary'
                          : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {isComplete ? (
                      <Check className="size-4" />
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span
                    className={cn(
                      'text-[11px] font-medium leading-tight text-center',
                      isCurrent
                        ? 'text-primary'
                        : isComplete
                          ? 'text-muted-foreground'
                          : 'text-muted-foreground/60',
                    )}
                  >
                    {step.shortLabel}
                  </span>
                </button>

                {/* Connecting line */}
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      'mx-2 h-0.5 flex-1',
                      stepComplete(STEPS[i].id)
                        ? 'bg-emerald-500'
                        : 'bg-muted',
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step cards (accordion-style) */}
      {STEPS.map((step, i) => {
        const isComplete = stepComplete(step.id);
        const isCurrent = step.id === activeStep;

        return (
          <Card key={step.id} className="overflow-hidden">
            {/* Step header — always visible */}
            <button
              type="button"
              onClick={() => setActiveStep(step.id)}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors min-h-[2.75rem]',
                isCurrent
                  ? 'bg-primary/[0.03]'
                  : 'hover:bg-muted/50',
              )}
            >
              {/* Step number/check circle */}
              <div
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  isComplete
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : isCurrent
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                {isComplete ? (
                  <Check className="size-3.5" />
                ) : (
                  i + 1
                )}
              </div>

              {/* Title */}
              <span
                className={cn(
                  'flex-1 text-sm font-medium',
                  isComplete
                    ? 'text-muted-foreground'
                    : 'text-foreground',
                )}
              >
                {step.label}
              </span>

              {/* Completion badge */}
              {isComplete && (
                <Badge
                  variant="secondary"
                  className="bg-emerald-50 text-emerald-700 text-xs dark:bg-emerald-900/20 dark:text-emerald-400"
                >
                  Complete
                </Badge>
              )}

              {/* Chevron */}
              <ChevronRight
                className={cn(
                  'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
                  isCurrent && 'rotate-90',
                )}
              />
            </button>

            {/* Step content — only shown when active */}
            {isCurrent && (
              <CardContent className="border-t px-4 pt-4 pb-4">
                {step.id === 'classes' && (
                  <StepClasses showId={showId} show={show} />
                )}
                {step.id === 'judge' && (
                  <StepJudge showId={showId} />
                )}
                {step.id === 'details' && (
                  <StepDetails showId={showId} show={show} />
                )}
                {step.id === 'schedule' && (
                  <StepSchedule showId={showId} onSaved={goNext} />
                )}
                {step.id === 'open' && (
                  <StepOpenEntries showId={showId} />
                )}

                {/* Navigation */}
                <div className="mt-6 flex items-center justify-between border-t pt-4">
                  {i > 0 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-[2.75rem] text-sm"
                      onClick={goBack}
                    >
                      Back
                    </Button>
                  ) : (
                    <div />
                  )}
                  {i < STEPS.length - 1 && (
                    <Button
                      size="sm"
                      className="min-h-[2.75rem] text-sm"
                      onClick={goNext}
                    >
                      Next
                      <ChevronRight className="ml-1 size-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ── Step 1: Classes & Breeds ──────────────────────────────

function StepClasses({ showId, show }: { showId: string; show: Show }) {
  const hasClasses = (show.showClasses?.length ?? 0) > 0;

  if (!hasClasses) {
    return <BulkClassCreator showId={showId} />;
  }

  return (
    <ClassManager
      showId={showId}
      showType={show.showType}
      classes={show.showClasses ?? []}
    />
  );
}

// ── Step 2: Judge ─────────────────────────────────────────

function StepJudge({ showId }: { showId: string }) {
  return <JudgesSection showId={showId} />;
}

// ── Step 3: Show Details ──────────────────────────────────

function StepDetails({ showId, show }: { showId: string; show: Show }) {
  const [firstEntryFee, setFirstEntryFee] = useState(
    show.firstEntryFee != null ? penceToPoundsString(show.firstEntryFee) : '',
  );
  const [subsequentEntryFee, setSubsequentEntryFee] = useState(
    show.subsequentEntryFee != null
      ? penceToPoundsString(show.subsequentEntryFee)
      : '',
  );
  const [nfcEntryFee, setNfcEntryFee] = useState(
    show.nfcEntryFee != null ? penceToPoundsString(show.nfcEntryFee) : '',
  );
  const [juniorHandlerFee, setJuniorHandlerFee] = useState(
    show.juniorHandlerFee != null ? penceToPoundsString(show.juniorHandlerFee) : '',
  );
  const [entryCloseDate, setEntryCloseDate] = useState(
    show.entryCloseDate
      ? new Date(show.entryCloseDate).toISOString().slice(0, 16)
      : '',
  );
  const [postalCloseDate, setPostalCloseDate] = useState(
    show.postalCloseDate
      ? new Date(show.postalCloseDate).toISOString().slice(0, 16)
      : '',
  );
  const [secretaryName, setSecretaryName] = useState(show.secretaryName ?? '');
  const [secretaryEmail, setSecretaryEmail] = useState(
    show.secretaryEmail ?? '',
  );
  const [secretaryPhone, setSecretaryPhone] = useState(
    show.secretaryPhone ?? '',
  );
  const [secretaryAddress, setSecretaryAddress] = useState(
    show.secretaryAddress ?? '',
  );
  const [kcLicenceNo, setKcLicenceNo] = useState(show.kcLicenceNo ?? '');

  const utils = trpc.useUtils();
  const updateMutation = trpc.shows.update.useMutation({
    onSuccess: () => {
      utils.shows.getById.invalidate({ id: showId });
      utils.secretary.getChecklistAutoDetect.invalidate({ showId });
      utils.secretary.getPhaseBlockers.invalidate({ showId });
      toast.success('Show details saved');
    },
    onError: (err) => toast.error(err.message ?? 'Failed to save details'),
  });

  function handleSave() {
    if (entryCloseDate && show.startDate && new Date(entryCloseDate) >= new Date(show.startDate)) {
      toast.error('Entry close date must be before the show start date');
      return;
    }
    if (postalCloseDate && show.startDate && new Date(postalCloseDate) >= new Date(show.startDate)) {
      toast.error('Postal close date must be before the show start date');
      return;
    }

    updateMutation.mutate({
      id: showId,
      firstEntryFee: firstEntryFee ? poundsToPence(Number(firstEntryFee)) : null,
      subsequentEntryFee: subsequentEntryFee
        ? poundsToPence(Number(subsequentEntryFee))
        : null,
      nfcEntryFee: nfcEntryFee ? poundsToPence(Number(nfcEntryFee)) : null,
      juniorHandlerFee: juniorHandlerFee ? poundsToPence(Number(juniorHandlerFee)) : null,
      entryCloseDate: entryCloseDate
        ? new Date(entryCloseDate).toISOString()
        : null,
      postalCloseDate: postalCloseDate
        ? new Date(postalCloseDate).toISOString()
        : null,
      secretaryName: secretaryName || null,
      secretaryEmail: secretaryEmail || null,
      secretaryPhone: secretaryPhone || null,
      secretaryAddress: secretaryAddress || null,
      kcLicenceNo: kcLicenceNo || null,
    });
  }

  return (
    <div className="space-y-6">
      {/* Entry Fees */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold">Entry Fees</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="wiz-first-fee" className="text-xs">
              First entry fee
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                &pound;
              </span>
              <Input
                id="wiz-first-fee"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                className="pl-7 min-h-[2.75rem]"
                value={firstEntryFee}
                onChange={(e) => setFirstEntryFee(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wiz-sub-fee" className="text-xs">
              Subsequent entry fee
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                &pound;
              </span>
              <Input
                id="wiz-sub-fee"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                className="pl-7 min-h-[2.75rem]"
                value={subsequentEntryFee}
                onChange={(e) => setSubsequentEntryFee(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wiz-nfc-fee" className="text-xs">
              NFC entry fee
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                &pound;
              </span>
              <Input
                id="wiz-nfc-fee"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                className="pl-7 min-h-[2.75rem]"
                value={nfcEntryFee}
                onChange={(e) => setNfcEntryFee(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wiz-jh-fee" className="text-xs">
              Junior handler fee
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                &pound;
              </span>
              <Input
                id="wiz-jh-fee"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                className="pl-7 min-h-[2.75rem]"
                value={juniorHandlerFee}
                onChange={(e) => setJuniorHandlerFee(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Close Dates */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold">Close Dates</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="wiz-close-date" className="text-xs">
              Entry close date
            </Label>
            <Input
              id="wiz-close-date"
              type="datetime-local"
              className="min-h-[2.75rem]"
              value={entryCloseDate}
              onChange={(e) => setEntryCloseDate(e.target.value)}
            />
          </div>
          {show.acceptsPostalEntries && (
            <div className="space-y-1.5">
              <Label htmlFor="wiz-postal-close" className="text-xs">
                Postal close date
              </Label>
              <Input
                id="wiz-postal-close"
                type="datetime-local"
                className="min-h-[2.75rem]"
                value={postalCloseDate}
                onChange={(e) => setPostalCloseDate(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Secretary Details */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold">Secretary Details</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="wiz-sec-name" className="text-xs">
              Name
            </Label>
            <Input
              id="wiz-sec-name"
              placeholder="Secretary name"
              className="min-h-[2.75rem]"
              value={secretaryName}
              onChange={(e) => setSecretaryName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wiz-sec-email" className="text-xs">
              Email
            </Label>
            <Input
              id="wiz-sec-email"
              type="email"
              placeholder="secretary@example.com"
              className="min-h-[2.75rem]"
              value={secretaryEmail}
              onChange={(e) => setSecretaryEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wiz-sec-phone" className="text-xs">
              Phone
            </Label>
            <Input
              id="wiz-sec-phone"
              type="tel"
              placeholder="Phone number"
              className="min-h-[2.75rem]"
              value={secretaryPhone}
              onChange={(e) => setSecretaryPhone(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wiz-sec-address" className="text-xs">
            Address
          </Label>
          <PostcodeLookup
            compact
            onSelect={(result) => {
              setSecretaryAddress(
                `${formatAddress(result)}, ${result.postcode}`,
              );
            }}
          />
          <Input
            id="wiz-sec-address"
            placeholder="Full address"
            className="min-h-[2.75rem]"
            value={secretaryAddress}
            onChange={(e) => setSecretaryAddress(e.target.value)}
          />
        </div>
      </div>

      {/* RKC Licence */}
      <div className="space-y-1.5">
        <Label htmlFor="wiz-licence" className="text-xs">
          RKC Licence Number
        </Label>
        <Input
          id="wiz-licence"
          placeholder="Licence number"
          className="min-h-[2.75rem] max-w-xs"
          value={kcLicenceNo}
          onChange={(e) => setKcLicenceNo(e.target.value)}
        />
      </div>

      {/* Save */}
      <Button
        className="w-full min-h-[2.75rem] sm:w-auto"
        onClick={handleSave}
        disabled={updateMutation.isPending}
      >
        {updateMutation.isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Saving...
          </>
        ) : (
          'Save Details'
        )}
      </Button>

      {/* Sundry Items */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold">Sundry Items</h4>
        <p className="text-xs text-muted-foreground">
          Configure add-on items exhibitors can purchase at checkout, such as catalogues, memberships, and donations.
        </p>
        <SundryItemManager showId={showId} />
      </div>
    </div>
  );
}

// ── Step 4: Schedule ──────────────────────────────────────

function StepSchedule({
  showId,
  onSaved,
}: {
  showId: string;
  onSaved: () => void;
}) {
  return <ScheduleSettingsForm showId={showId} onSaved={onSaved} />;
}

// ── Step 5: Open Entries ──────────────────────────────────

function StepOpenEntries({ showId }: { showId: string }) {
  const { data: blockers, isLoading } = trpc.secretary.getPhaseBlockers.useQuery(
    { showId },
    { staleTime: 15_000 },
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const utils = trpc.useUtils();
  const updateMutation = trpc.shows.update.useMutation({
    onSuccess: () => {
      utils.shows.getById.invalidate({ id: showId });
      utils.secretary.getPhaseBlockers.invalidate({ showId });
      utils.secretary.getChecklistAutoDetect.invalidate({ showId });
      toast.success('Entries are now open!');
    },
    onError: (err) => toast.error(err.message ?? 'Failed to open entries'),
  });

  const allBlockers = blockers?.openEntriesBlockers ?? [];
  const canOpen = blockers?.canOpenEntries ?? false;

  function handleOpenEntries() {
    updateMutation.mutate({
      id: showId,
      status: 'entries_open',
    });
    setConfirmOpen(false);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Review the checklist below. All required items must be completed before
        you can open entries.
      </p>

      {isLoading ? (
        <div className="flex items-center gap-2 py-4">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Checking requirements...
          </span>
        </div>
      ) : (
        <div className="space-y-1.5">
          {allBlockers.length === 0 && (
            <div className="flex items-center gap-2.5 rounded-md bg-emerald-50 px-3 py-3 dark:bg-emerald-900/20">
              <Check className="size-5 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                All requirements met — ready to open entries!
              </span>
            </div>
          )}
          {allBlockers.map((blocker) => (
            <div
              key={blocker.key}
              className="flex items-center gap-2.5 min-h-[2.75rem] rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50"
            >
              {/* Status icon */}
              <div
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full',
                  blocker.severity === 'required'
                    ? 'bg-destructive/10'
                    : 'bg-amber-100 dark:bg-amber-900/30',
                )}
              >
                {blocker.severity === 'required' ? (
                  <X className="size-3 text-destructive" />
                ) : (
                  <AlertTriangle className="size-3 text-amber-600" />
                )}
              </div>

              {/* Label */}
              <div className="flex-1 min-w-0">
                <span
                  className={cn(
                    'text-sm',
                    blocker.severity === 'required'
                      ? 'font-medium text-foreground'
                      : 'text-muted-foreground',
                  )}
                >
                  {blocker.label}
                </span>
                {blocker.detail && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {blocker.detail}
                  </p>
                )}
              </div>

              {/* Severity badge */}
              <Badge
                variant={blocker.severity === 'required' ? 'destructive' : 'secondary'}
                className="text-xs shrink-0"
              >
                {blocker.severity === 'required' ? 'Required' : 'Recommended'}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {/* Open Entries button */}
      <Button
        className="w-full min-h-[2.75rem] sm:w-auto"
        disabled={!canOpen || isLoading || updateMutation.isPending}
        onClick={() => setConfirmOpen(true)}
      >
        {updateMutation.isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Opening...
          </>
        ) : canOpen ? (
          'Open Entries'
        ) : (
          `Complete ${allBlockers.filter((b) => b.severity === 'required').length} required item${allBlockers.filter((b) => b.severity === 'required').length !== 1 ? 's' : ''}`
        )}
      </Button>

      {/* Confirmation dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Open entries?</AlertDialogTitle>
            <AlertDialogDescription>
              This will make the show live and allow exhibitors to submit entries.
              You can still edit show details after opening.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[2.75rem]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[2.75rem]"
              onClick={handleOpenEntries}
            >
              Yes, open entries
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
