'use client';

import { useState, useEffect, useCallback } from 'react';
import { fireDogConfetti } from '@/lib/confetti';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
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
import type { RouterOutputs } from '@/server/trpc/router';
import { ClassManager, BulkClassCreator } from './class-manager';
import { DiscountsSection } from './discounts-section';
import { SectionHeading, InlineHelp } from './section-help';
import { JudgesSection } from './judge-section';
import { ScheduleSettingsForm } from './schedule-settings-form';
import { SundryItemManager } from './sundry-item-manager';

type Show = NonNullable<RouterOutputs['shows']['getById']>;

// ── Step definitions ──────────────────────────────────────

const STEPS = [
  { id: 'classes', label: 'Classes & Breeds', shortLabel: 'Classes' },
  { id: 'judge', label: 'Judge', shortLabel: 'Judge' },
  { id: 'details', label: 'Fees & Setup', shortLabel: 'Setup' },
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
          return autoDetect.judges_assigned === true && autoDetect.judge_offers_sent === true;
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
          <div className="mt-2">
            <InlineHelp
              label="New to this? Read the quick guide"
              content={{
                what: 'These steps cover everything we need before exhibitors can enter your show. Each one saves on its own and you can come back to any step at any time. When all five are done, you can open entries to the public.',
                todo: [
                  'Work through the steps in order if you like, or click any step to jump to it.',
                  'Each step has its own Help button (the small question mark next to each section) if you get stuck.',
                  'Nothing goes live until you press the green Open Entries button at the end.',
                ],
                benefit: 'Running a show used to mean a folder full of paper forms, a spreadsheet of entries, several trips to the printer, late nights with the calculator, and a cardboard box of cash on the day. With us, all of that is one online form, one button to open entries, and one click to print whatever you need. Your evenings are yours again.',
                tip: 'You can leave this page and come back later. Your progress is saved automatically.',
              }}
            />
          </div>
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

  const help = (
    <div className="mb-3">
      <InlineHelp
        label="What are classes?"
        content={{
          what: 'A class is a group of dogs competing against each other, like Puppy, Junior, or Open. Most shows offer several classes so dogs compete with others of a similar age or experience. Each class needs to be set up before exhibitors can enter their dogs.',
          todo: [
            'Pick the classes you want to offer (you can use a standard set as a starting point).',
            'Add or remove classes if your show is different from the usual.',
            'For Champ shows, the Royal Kennel Club has rules about which classes must be offered. We try to flag anything missing.',
          ],
          benefit: 'No more typing your class list into a Word document and re-typing it next year. We remember your set up, flag any RKC rules that you might miss, and the same classes flow straight through to the schedule, the catalogue, and the judges book without you lifting a finger.',
          tip: 'You can change classes at any time before entries open. Once a dog has entered a class, that class is locked in so its entry stays valid.',
        }}
      />
    </div>
  );

  if (!hasClasses) {
    return (
      <>
        {help}
        <BulkClassCreator showId={showId} />
      </>
    );
  }

  return (
    <>
      {help}
      <ClassManager
        showId={showId}
        showType={show.showType}
        showScope={show.showScope}
        classes={show.showClasses ?? []}
      />
    </>
  );
}

// ── Step 2: Judge ─────────────────────────────────────────

function StepJudge({ showId }: { showId: string }) {
  return (
    <>
      <div className="mb-3">
        <InlineHelp
          label="How do judges work?"
          content={{
            what: 'Every breed at your show needs a judge. We keep a directory of judges with their Royal Kennel Club details, and we email each one to ask if they accept the invitation. They confirm online and that locks them in.',
            todo: [
              'Search for the judge by name. If they are in our directory we will fill in their RKC number for you.',
              'Choose which breeds and sex each judge is doing (for multi-breed shows).',
              'When you save, we send the judge an email with the invitation. They click Accept or Decline.',
              'You can see who has accepted at the top of this section. Chase any that have not replied a week or two before the show.',
            ],
            benefit: 'No more posting invitation letters, sending follow-up texts, or wondering whether a judge has confirmed. We send the invitation the moment you save, the judge clicks one button to accept, and you see the green tick instantly. Their name flows straight into the schedule and catalogue.',
            tip: 'If a judge cannot do the show in the end, you can swap them out at any time and we will send a new invitation to the replacement.',
          }}
        />
      </div>
      <JudgesSection showId={showId} />
    </>
  );
}

// ── Secretary Details (read-only with edit toggle) ────────

function SecretaryDetails({
  secretaryName,
  secretaryEmail,
  secretaryPhone,
  secretaryAddress,
  secretaryUserId,
  onChange,
}: {
  secretaryName: string;
  secretaryEmail: string;
  secretaryPhone: string;
  secretaryAddress: string;
  secretaryUserId: string | null;
  onChange: (fields: { name?: string; email?: string; phone?: string; address?: string }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(secretaryName);
  const [editEmail, setEditEmail] = useState(secretaryEmail);
  const [editPhone, setEditPhone] = useState(secretaryPhone);
  const [editAddress, setEditAddress] = useState(secretaryAddress);

  const hasDetails = !!(secretaryName || secretaryEmail || secretaryPhone || secretaryAddress);

  const updateUserMutation = trpc.secretary.updateSecretaryUser.useMutation({
    onError: (err) => toast.error(err.message ?? 'Failed to update secretary record'),
  });

  function startEditing() {
    setEditName(secretaryName);
    setEditEmail(secretaryEmail);
    setEditPhone(secretaryPhone);
    setEditAddress(secretaryAddress);
    setEditing(true);
  }

  function saveEdits() {
    onChange({
      name: editName,
      email: editEmail,
      phone: editPhone,
      address: editAddress,
    });

    // Also update the underlying user record so future shows get the correct data
    if (secretaryUserId) {
      // Split combined address back into address + postcode for user record
      const postcodeMatch = editAddress.match(/,\s*([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\s*$/i);
      const postcode = postcodeMatch?.[1]?.trim() ?? null;
      const address = postcodeMatch
        ? editAddress.slice(0, postcodeMatch.index).replace(/,\s*$/, '').trim()
        : editAddress.trim();

      updateUserMutation.mutate({
        userId: secretaryUserId,
        name: editName || null,
        phone: editPhone || null,
        address: address || null,
        postcode,
      });
    }

    setEditing(false);
  }

  // No details at all — show the edit form directly
  if (!hasDetails || editing) {
    // In edit mode, use local edit buffer; when no details exist, write directly to parent
    const val = editing
      ? { name: editName, email: editEmail, phone: editPhone, address: editAddress }
      : { name: secretaryName, email: secretaryEmail, phone: secretaryPhone, address: secretaryAddress };
    const set = editing
      ? { name: setEditName, email: setEditEmail, phone: setEditPhone, address: setEditAddress }
      : { name: (v: string) => onChange({ name: v }), email: (v: string) => onChange({ email: v }), phone: (v: string) => onChange({ phone: v }), address: (v: string) => onChange({ address: v }) };

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionHeading
            title="Secretary Details"
            help={{
              what: 'Your contact details as the show secretary. These appear in the printed schedule and on the show page so exhibitors know who to ask if they have a question.',
              todo: [
                'Add your name, email and phone number.',
                'A postal address is helpful if any entries come in by post.',
                'These details are saved against your account so future shows can pre-fill them.',
              ],
              benefit: 'Type these once and they pre-fill every show you ever run with us. They also flow through to the schedule, the catalogue, the entry confirmation emails to exhibitors, and any letters we need to send on your behalf. No copy and paste, no remembering to update three documents when your phone number changes.',
              tip: 'If your club has a shared show email like secretary@yourclub.co.uk, use that instead of your personal one. It is easier to hand over if someone else takes over the role.',
            }}
          />
          {hasDetails && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="wiz-sec-name" className="text-xs">Name</Label>
            <Input id="wiz-sec-name" placeholder="Secretary name" className="min-h-[2.75rem]" value={val.name} onChange={(e) => set.name(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wiz-sec-email" className="text-xs">Email</Label>
            <Input id="wiz-sec-email" type="email" placeholder="secretary@example.com" className="min-h-[2.75rem]" value={val.email} onChange={(e) => set.email(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wiz-sec-phone" className="text-xs">Phone</Label>
            <Input id="wiz-sec-phone" type="tel" placeholder="Phone number" className="min-h-[2.75rem]" value={val.phone} onChange={(e) => set.phone(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wiz-sec-address" className="text-xs">Address</Label>
          <Input id="wiz-sec-address" placeholder="House/flat, street, town, postcode" className="min-h-[2.75rem]" value={val.address} onChange={(e) => set.address(e.target.value)} />
        </div>
        {editing && (
          <Button size="sm" className="min-h-[2.75rem]" onClick={saveEdits}>
            Save Changes
          </Button>
        )}
      </div>
    );
  }

  // Read-only display
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Secretary Details</h4>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={startEditing}>
          <Pencil className="size-3" />
          Edit
        </Button>
      </div>
      <div className="rounded-lg border bg-muted/30 px-4 py-3 space-y-1.5">
        {secretaryName && (
          <p className="font-medium text-sm">{secretaryName}</p>
        )}
        {secretaryEmail && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Mail className="size-3.5 shrink-0" />
            {secretaryEmail}
          </p>
        )}
        {secretaryPhone && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Phone className="size-3.5 shrink-0" />
            {secretaryPhone}
          </p>
        )}
        {secretaryAddress && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" />
            {secretaryAddress}
          </p>
        )}
      </div>
    </div>
  );
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
  const [multiDog, setMultiDog] = useState({
    threshold: show.multiDogThreshold != null ? String(show.multiDogThreshold) : '',
    packagePence: show.multiDogPackagePence != null ? penceToPoundsString(show.multiDogPackagePence) : '',
  });
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
      multiDogThreshold: multiDog.threshold ? Number(multiDog.threshold) : null,
      multiDogPackagePence: multiDog.packagePence ? poundsToPence(Number(multiDog.packagePence)) : null,
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
        <SectionHeading
          title="Entry Fees"
          help={{
            what: 'The prices people pay to enter their dog. There are usually two main rates: one for the first class a dog enters, and a cheaper one for any extra classes the same dog enters.',
            todo: [
              'First entry fee: what people pay for one dog in one class.',
              'Subsequent entry fee: what they pay if the same dog enters another class at the same show.',
              'NFC: Not For Competition. For people who want to bring their dog along but not compete. Some shows charge less, some leave it the same.',
              'Junior Handler: for the young handler classes. Usually free or just a small amount.',
            ],
            benefit: 'We work out the right total for every order automatically, including first-class and extra-class fees, and we collect the money for you at the same time the exhibitor enters. No more cash on the day, no more chasing late payments, no more sums on a notepad.',
            tip: 'You can leave any of these blank if you do not offer that type of entry. Just set what applies to your show.',
          }}
        />
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

        <DiscountsSection
          showId={showId}
          multiDog={multiDog}
          onMultiDogChange={setMultiDog}
        />
      </div>

      {/* Close Dates */}
      <div className="space-y-3">
        <SectionHeading
          title="Close Dates"
          help={{
            what: 'The deadlines for entries. After the online close date, exhibitors cannot enter through Remi any more. The postal close date is for people who post their entry form to you by hand, if you accept those.',
            todo: [
              'Pick the date and time online entries should close. This is usually a couple of weeks before the show.',
              'If you accept postal entries, set the postal close date too. It can be the same as the online date, or different.',
              'Both dates must be before the show day. We will warn you if they are not.',
            ],
            benefit: 'We close entries automatically at the exact date and time you set. No more checking the inbox at midnight, no more deciding whether a late entry that arrived in the post a day late should be accepted. The deadline is fair, firm, and out of your hands.',
            tip: 'You can extend a close date later if you need more entries. Just come back and change it.',
          }}
        />
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
      <SecretaryDetails
        secretaryName={secretaryName}
        secretaryEmail={secretaryEmail}
        secretaryPhone={secretaryPhone}
        secretaryAddress={secretaryAddress}
        secretaryUserId={show.secretaryUserId}
        onChange={(fields) => {
          if (fields.name !== undefined) setSecretaryName(fields.name);
          if (fields.email !== undefined) setSecretaryEmail(fields.email);
          if (fields.phone !== undefined) setSecretaryPhone(fields.phone);
          if (fields.address !== undefined) setSecretaryAddress(fields.address);
        }}
      />

      {/* RKC Licence */}
      <div className="space-y-1.5">
        <SectionHeading
          title="RKC Licence Number"
          help={{
            what: 'The Royal Kennel Club gives each licensed show a unique number. It must be printed on the schedule and catalogue. The RKC sends it to you when they approve your show licence.',
            todo: [
              'Find the licence number on the approval email or letter the RKC sent you.',
              'Type it in here. We will put it on the schedule and catalogue automatically.',
            ],
            tip: 'If you have not had the licence number back yet, you can come back and add it later. It does not stop you opening entries.',
          }}
          level="h5"
        />
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
        <SectionHeading
          title="Sundry Items"
          subtitle="Optional extras exhibitors can add to their order at checkout."
          help={{
            what: 'Anything you would like to sell alongside the entry fees, like printed catalogues, club memberships, raffle tickets, or a donation to a charity. Exhibitors see these as add-ons when they check out.',
            todo: [
              'Click Add to create a new item.',
              'Give it a clear name and a price.',
              'Tick whether it is a yes/no item (like a printed catalogue) or whether people can buy more than one (like raffle tickets).',
              'You can edit or remove items any time before the order is paid.',
            ],
            benefit: 'No more bags of cash for catalogue sales on the day, no more counting raffle ticket stubs, no more chasing club memberships through the post. Exhibitors tick what they want, pay online, and you arrive on the day with a clean list of who has bought what.',
            tip: 'This is a great place to add a donation to a charity close to your club. Exhibitors are often happy to add £5 to their order if it goes to a good cause.',
          }}
        />
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
  return (
    <>
      <div className="mb-3">
        <InlineHelp
          label="What is the schedule for?"
          content={{
            what: 'The schedule is the printed (or shared digitally) document that tells exhibitors everything about your show. It includes the date, the venue, the classes, the judges, the fees, and all the rules. The Royal Kennel Club requires certain statements to be on it, and we add those for you automatically.',
            todo: [
              'Fill in each section by clicking it open and typing the details.',
              'Click Preview PDF at the top to see how it looks before you share it.',
              'When you are happy, share the link or the PDF with exhibitors.',
            ],
            benefit: 'Schedules used to mean a Word document, an emailed quote from the printer, a marked up PDF proof going back and forth, postage costs, and a week or two of wait. With us, you fill in the form once and the schedule appears as a polished PDF in seconds. Every time you change something, the PDF updates. No printer, no postage, no proofs, no waiting. Share the link on social media and exhibitors read it on their phone.',
            tip: 'You do not have to finish this in one go. The form saves as you type, so you can come back any time and pick up where you left off.',
          }}
        />
      </div>
      <ScheduleSettingsForm showId={showId} onSaved={onSaved} />
    </>
  );
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
      fireDogConfetti();
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
      <InlineHelp
        label="What happens when I open entries?"
        content={{
          what: 'Opening entries makes your show live. From that moment, exhibitors can find it on Remi and enter their dogs. Their money is taken at the time of entry, and we hold it until after the show, when it is paid out to your club.',
          todo: [
            'Make sure every item on the checklist below has a green tick.',
            'Click the green Open Entries button at the bottom.',
            'You will see a confirmation and the show will appear publicly.',
          ],
          benefit: 'The moment you click open, exhibitors can find the show in our directory and on every search engine. They enter on their phone in two minutes, pay there and then, and you get an email confirming each entry. No envelopes, no cheques to bank, no spreadsheet to maintain. Watch your entries grow in real time on the dashboard.',
          tip: 'You can edit most things about the show after entries open, but be careful changing fees or classes once people have started entering. Tell exhibitors first if you do.',
        }}
      />
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
