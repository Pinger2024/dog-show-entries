'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import {
  CalendarIcon,
  Check,
  ChevronsUpDown,
  Loader2,
  Search,
  Dog,
  CalendarDays,
  Plus,
  ArrowRight,
  SkipForward,
  PartyPopper,
  Trophy,
  Megaphone,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { PostcodeLookup, formatAddress } from '@/components/postcode-lookup';
import { ClubApplicationForm } from '@/components/club-application-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import Link from 'next/link';

// ── Types ───────────────────────────────────────────────────────
type Intent = 'enter' | 'run' | 'both';

function getSteps(intent: Intent) {
  switch (intent) {
    case 'enter':
      return [
        { label: 'Your Details', number: 1 },
        { label: 'Add a Dog', number: 2 },
        { label: 'All Set', number: 3 },
      ];
    case 'run':
      return [
        { label: 'Your Details', number: 1 },
        { label: 'Your Club', number: 2 },
        { label: 'All Set', number: 3 },
      ];
    case 'both':
      return [
        { label: 'Your Details', number: 1 },
        { label: 'Add a Dog', number: 2 },
        { label: 'Your Club', number: 3 },
        { label: 'All Set', number: 4 },
      ];
  }
}

// ── Step indicator ──────────────────────────────────────────────
function StepIndicator({
  currentStep,
  steps,
}: {
  currentStep: number;
  steps: { label: string; number: number }[];
}) {
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-0">
      {steps.map((step, i) => (
        <div key={step.number} className="flex items-center">
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={cn(
                'flex size-8 sm:size-9 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                currentStep > step.number
                  ? 'bg-primary text-primary-foreground'
                  : currentStep === step.number
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
              )}
            >
              {currentStep > step.number ? (
                <Check className="size-4" />
              ) : (
                step.number
              )}
            </div>
            <span
              className={cn(
                'hidden text-xs font-medium sm:block',
                currentStep >= step.number
                  ? 'text-foreground'
                  : 'text-muted-foreground'
              )}
            >
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={cn(
                'mx-2 h-0.5 w-8 sm:mx-4 sm:w-12 transition-colors',
                currentStep > step.number ? 'bg-primary' : 'bg-muted'
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Schemas ─────────────────────────────────────────────────────
const profileSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  address: z.string().min(1, 'Address is required'),
  postcode: z.string().min(1, 'Postcode is required'),
  phone: z.string().optional(),
});

/** Whether address fields have values (from lookup or pre-existing) */
function hasAddress(address: string | undefined, postcode: string | undefined) {
  return !!(address && postcode);
}

type ProfileValues = z.infer<typeof profileSchema>;

const dogSchema = z.object({
  registeredName: z.string().min(1, 'Registered name is required').max(255),
  kcRegNumber: z.string().optional(),
  breedId: z.string().min(1, 'Please select a breed'),
  sex: z.enum(['dog', 'bitch'], { error: 'Please select the sex' }),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  colour: z.string().optional(),
  sireName: z.string().optional(),
  damName: z.string().optional(),
  breederName: z.string().optional(),
});

type DogValues = z.infer<typeof dogSchema>;

// ── Main wizard ─────────────────────────────────────────────────
interface OnboardingWizardProps {
  user: {
    id?: string;
    name?: string | null;
    email?: string | null;
    role?: string;
  };
}

export function OnboardingWizard({ user }: OnboardingWizardProps) {
  const router = useRouter();
  const [intent, setIntent] = useState<Intent | null>(null);
  const [step, setStep] = useState(1);
  const [dogsAdded, setDogsAdded] = useState(0);

  const { data: status } = trpc.onboarding.getStatus.useQuery();

  // If already completed, send secretaries to their dashboard
  useEffect(() => {
    if (status?.isComplete) {
      const destination =
        status.role === 'secretary' || status.role === 'admin'
          ? '/secretary'
          : '/dashboard';
      router.replace(destination);
    }
  }, [status?.isComplete, status?.role, router]);

  // Auto-advance if profile already completed (e.g., returning to onboarding)
  useEffect(() => {
    if (status?.hasProfile && step === 1 && intent) {
      setStep(2);
    }
  }, [status?.hasProfile, step, intent]);

  // Determine which step component to show based on intent + step number
  function getStepContent() {
    if (!intent) return null;

    const steps = getSteps(intent);
    const lastStep = steps[steps.length - 1].number;

    if (step === lastStep) {
      return <SuccessStep dogsAdded={dogsAdded} userName={user.name} intent={intent} />;
    }

    if (step === 1) {
      return (
        <ProfileStep
          user={user}
          profile={status?.profile}
          onComplete={() => setStep(2)}
          intent={intent}
        />
      );
    }

    if (intent === 'enter') {
      // Step 2 = Dog
      return (
        <DogStep
          dogsAdded={dogsAdded}
          onDogAdded={() => setDogsAdded((n) => n + 1)}
          onSkip={() => setStep(3)}
          onComplete={() => setStep(3)}
        />
      );
    }

    if (intent === 'run') {
      // Step 2 = Club
      return (
        <ClubStep
          userEmail={user.email}
          onComplete={() => setStep(3)}
        />
      );
    }

    if (intent === 'both') {
      if (step === 2) {
        return (
          <DogStep
            dogsAdded={dogsAdded}
            onDogAdded={() => setDogsAdded((n) => n + 1)}
            onSkip={() => setStep(3)}
            onComplete={() => setStep(3)}
          />
        );
      }
      // Step 3 = Club
      return (
        <ClubStep
          userEmail={user.email}
          onComplete={() => setStep(4)}
        />
      );
    }

    return null;
  }

  return (
    <div className="flex min-h-screen flex-col items-center px-3 py-8 sm:px-4 sm:py-12">
      <div className="w-full max-w-lg space-y-6 sm:space-y-8">
        {/* Logo */}
        <div className="text-center">
          <Link
            href="/"
            className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-primary"
          >
            Remi
          </Link>
        </div>

        {/* Intent selection (before steps) */}
        {!intent ? (
          <IntentStep onSelect={(i) => setIntent(i)} userName={user.name} />
        ) : (
          <>
            {/* Step indicator */}
            <StepIndicator currentStep={step} steps={getSteps(intent)} />

            {/* Step content */}
            {getStepContent()}
          </>
        )}
      </div>
    </div>
  );
}

// ── Intent Step ─────────────────────────────────────────────────
function IntentStep({
  onSelect,
  userName,
}: {
  onSelect: (intent: Intent) => void;
  userName?: string | null;
}) {
  const firstName = userName?.split(' ')[0];

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="font-serif text-xl sm:text-2xl">
          Welcome{firstName ? `, ${firstName}` : ''}!
        </CardTitle>
        <CardDescription className="text-sm sm:text-[0.9375rem]">
          What brings you to Remi?
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <button
          type="button"
          onClick={() => onSelect('enter')}
          className="flex w-full items-start gap-4 rounded-xl border-2 border-transparent bg-muted/50 p-4 text-left transition-all hover:border-primary hover:bg-primary/5"
        >
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Trophy className="size-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold">Enter shows</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              I&apos;m an exhibitor — I want to enter my dogs in shows
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onSelect('run')}
          className="flex w-full items-start gap-4 rounded-xl border-2 border-transparent bg-muted/50 p-4 text-left transition-all hover:border-primary hover:bg-primary/5"
        >
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Megaphone className="size-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold">Run shows</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              I&apos;m a show secretary — I want to manage shows for my club
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onSelect('both')}
          className="flex w-full items-start gap-4 rounded-xl border-2 border-transparent bg-muted/50 p-4 text-left transition-all hover:border-primary hover:bg-primary/5"
        >
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Users className="size-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold">Both</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              I exhibit and run shows
            </p>
          </div>
        </button>
      </CardContent>
    </Card>
  );
}

// ── Step 1: Profile ─────────────────────────────────────────────
function ProfileStep({
  user,
  profile,
  onComplete,
  intent,
}: {
  user: OnboardingWizardProps['user'];
  profile?: { name: string; address: string | null; postcode: string | null; phone: string | null; kcAccountNo: string | null } | null;
  onComplete: () => void;
  intent: Intent;
}) {
  const saveProfile = trpc.onboarding.saveProfile.useMutation({
    onSuccess: () => {
      toast.success('Profile saved!');
      onComplete();
    },
    onError: (err) => {
      toast.error('Failed to save profile', { description: err.message });
    },
  });

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: profile?.name ?? user.name ?? '',
      address: profile?.address ?? '',
      postcode: profile?.postcode ?? '',
      phone: profile?.phone ?? '',
    },
  });

  // Show compact summary when address is already populated; expand for editing
  const watchedAddress = form.watch('address');
  const watchedPostcode = form.watch('postcode');
  const addressFilled = hasAddress(watchedAddress, watchedPostcode);
  const [editingAddress, setEditingAddress] = useState(!addressFilled);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-lg sm:text-xl">
          Your Details
        </CardTitle>
        <CardDescription className="text-sm sm:text-[0.9375rem]">
          {intent === 'run'
            ? 'We need a few details about you to get started.'
            : 'We need a few details for show entries. This information appears on your entry forms.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((data) => saveProfile.mutate(data))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Jane Smith"
                      className="h-11 sm:h-12"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* Address — compact summary when filled, postcode lookup + fields when editing */}
            {addressFilled && !editingAddress ? (
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">Address</p>
                    <p className="mt-0.5 text-sm">{watchedAddress}</p>
                    <p className="text-sm font-medium">{watchedPostcode}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-xs text-muted-foreground"
                    onClick={() => setEditingAddress(true)}
                  >
                    Edit
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <PostcodeLookup
                  onSelect={(result) => {
                    form.setValue('address', formatAddress(result));
                    form.setValue('postcode', result.postcode);
                    setEditingAddress(false);
                  }}
                />
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-[1fr_auto]">
                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Your postal address"
                            className="h-11 sm:h-12"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="postcode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Postcode</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="G1 1AA"
                            className="h-11 sm:h-12 sm:w-28"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Your address appears in show catalogues as required by RKC regulations.
                </p>
              </>
            )}
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Phone{' '}
                    <span className="text-muted-foreground font-normal">
                      (optional)
                    </span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="07xxx xxxxxx"
                      className="h-11 sm:h-12"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="h-11 sm:h-12 w-full text-sm sm:text-[0.9375rem]"
              disabled={saveProfile.isPending}
            >
              {saveProfile.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Continue
              <ArrowRight className="size-4" />
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

// ── Dog Step ────────────────────────────────────────────────────
function DogStep({
  dogsAdded,
  onDogAdded,
  onSkip,
  onComplete,
}: {
  dogsAdded: number;
  onDogAdded: () => void;
  onSkip: () => void;
  onComplete: () => void;
}) {
  const [showForm, setShowForm] = useState(dogsAdded === 0);
  const [breedOpen, setBreedOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const { data: breeds, isLoading: breedsLoading } =
    trpc.breeds.list.useQuery();

  const utils = trpc.useUtils();

  const createDog = trpc.dogs.create.useMutation({
    onSuccess: (dog) => {
      utils.dogs.list.invalidate();
      onDogAdded();
      setShowForm(false);
      toast.success(`${dog.registeredName} added!`);
      form.reset();
    },
    onError: (err) => {
      toast.error('Failed to add dog', { description: err.message });
    },
  });

  // RKC lookup
  const [kcResults, setKcResults] = useState<
    {
      registeredName: string;
      breed: string;
      sex: string;
      dateOfBirth: string;
      colour?: string;
      sire: string;
      dam: string;
      breeder: string;
    }[]
  >([]);

  const kcLookup = trpc.dogs.kcLookup.useMutation({
    onSuccess: (results) => {
      if (results.length === 1) {
        applyKcResult(results[0]);
      } else {
        setKcResults(results);
        toast.info(
          `Found ${results.length} dogs — please select the right one.`
        );
      }
    },
    onError: (err) => {
      toast.error('RKC Lookup failed', { description: err.message });
    },
  });

  const form = useForm<DogValues>({
    resolver: zodResolver(dogSchema),
    defaultValues: {
      registeredName: '',
      kcRegNumber: '',
      breedId: '',
      sex: undefined,
      dateOfBirth: '',
      colour: '',
      sireName: '',
      damName: '',
      breederName: '',
    },
  });

  function applyKcResult(
    data: (typeof kcResults)[number]
  ) {
    if (data.registeredName)
      form.setValue('registeredName', data.registeredName);
    if (data.sex) form.setValue('sex', data.sex as 'dog' | 'bitch');
    if (data.dateOfBirth) {
      const parsed = new Date(data.dateOfBirth);
      if (!isNaN(parsed.getTime())) {
        form.setValue('dateOfBirth', format(parsed, 'yyyy-MM-dd'));
      }
    }
    if (data.sire) form.setValue('sireName', data.sire);
    if (data.dam) form.setValue('damName', data.dam);
    if (data.breeder) form.setValue('breederName', data.breeder);
    if (data.colour) form.setValue('colour', data.colour);

    if (data.breed && breeds) {
      const breedNameLower = data.breed.toLowerCase();
      const matchedBreed = breeds.find(
        (b) =>
          b.name.toLowerCase() === breedNameLower ||
          b.name.toLowerCase().includes(breedNameLower) ||
          breedNameLower.includes(b.name.toLowerCase())
      );
      if (matchedBreed) {
        form.setValue('breedId', matchedBreed.id);
      }
    }

    setKcResults([]);
    toast.success('Dog details found on RKC website!', {
      description: `${data.registeredName} — fields have been populated.`,
    });
  }

  // Group breeds by their breed group
  const breedsByGroup = breeds?.reduce(
    (acc, breed) => {
      const groupName = breed.group?.name ?? 'Other';
      if (!acc[groupName]) acc[groupName] = [];
      acc[groupName].push(breed);
      return acc;
    },
    {} as Record<string, typeof breeds>
  );

  // After adding dogs, show success + options
  if (dogsAdded > 0 && !showForm) {
    return (
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-emerald-100">
            <Dog className="size-6 text-emerald-700" />
          </div>
          <CardTitle className="font-serif text-lg sm:text-xl">
            {dogsAdded === 1 ? 'Dog added!' : `${dogsAdded} dogs added!`}
          </CardTitle>
          <CardDescription>
            You can always add more dogs later from your dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button
            variant="outline"
            className="h-11 sm:h-12 w-full"
            onClick={() => setShowForm(true)}
          >
            <Plus className="size-4" />
            Add Another Dog
          </Button>
          <Button
            className="h-11 sm:h-12 w-full"
            onClick={onComplete}
          >
            Continue
            <ArrowRight className="size-4" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-lg sm:text-xl">
          Add Your First Dog
        </CardTitle>
        <CardDescription className="text-sm sm:text-[0.9375rem]">
          Enter your dog&apos;s details, or use the RKC Lookup to auto-fill from
          the Royal Kennel Club website.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((data) => createDog.mutate(data))}
            className="space-y-4"
          >
            {/* RKC Reg + Name + Lookup */}
            <FormField
              control={form.control}
              name="kcRegNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    RKC Registration Number{' '}
                    <span className="text-muted-foreground font-normal">
                      (optional)
                    </span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. AQ04052601" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="registeredName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Registered Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Dorabella Dancing Queen"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* RKC Lookup */}
            <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3 sm:p-4">
              <div className="flex items-start gap-2.5 sm:gap-3">
                <Search className="mt-0.5 size-5 shrink-0 text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    Auto-fill from Royal Kennel Club
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Enter a RKC number or registered name above, then click
                    lookup.
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    Tip: type the name exactly as it appears on your RKC registration certificate, including affixes (e.g. &quot;Dorabella Dancing Queen At Hundark&quot;).
                  </p>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="mt-2.5"
                    disabled={kcLookup.isPending}
                    onClick={() => {
                      setKcResults([]);
                      const query =
                        form.getValues('kcRegNumber') ||
                        form.getValues('registeredName');
                      if (!query || query.trim().length < 2) {
                        toast.error(
                          'Enter a RKC registration number or registered name first'
                        );
                        return;
                      }
                      kcLookup.mutate({ query: query.trim() });
                    }}
                  >
                    {kcLookup.isPending ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Searching...
                      </>
                    ) : (
                      <>
                        <Search className="size-4" />
                        Lookup on RKC Website
                      </>
                    )}
                  </Button>

                  {/* RKC multiple results */}
                  {kcResults.length > 1 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-sm font-medium">
                        {kcResults.length} dogs found — select yours:
                      </p>
                      <div className="max-h-[35vh] space-y-1 overflow-y-auto">
                        {kcResults.map((dog, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => applyKcResult(dog)}
                            className="flex w-full flex-col gap-0.5 rounded-md border px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent"
                          >
                            <span className="font-medium">
                              {dog.registeredName}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {dog.breed} &middot;{' '}
                              {dog.sex === 'bitch' ? 'Bitch' : 'Dog'}
                              {dog.dateOfBirth ? ` · ${dog.dateOfBirth}` : ''}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Breed combobox */}
            <FormField
              control={form.control}
              name="breedId"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Breed</FormLabel>
                  <Popover open={breedOpen} onOpenChange={setBreedOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={breedOpen}
                          className={cn(
                            'w-full justify-between font-normal',
                            !field.value && 'text-muted-foreground'
                          )}
                        >
                          {field.value
                            ? breeds?.find((b) => b.id === field.value)?.name
                            : 'Search for a breed...'}
                          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[--radix-popover-trigger-width] p-0"
                      align="start"
                    >
                      <Command>
                        <CommandInput placeholder="Type to search breeds..." />
                        <CommandList className="max-h-[60vh] sm:max-h-[300px]">
                          <CommandEmpty>
                            {breedsLoading
                              ? 'Loading breeds...'
                              : 'No breed found.'}
                          </CommandEmpty>
                          {breedsByGroup &&
                            Object.entries(breedsByGroup).map(
                              ([group, groupBreeds]) => (
                                <CommandGroup key={group} heading={group}>
                                  {groupBreeds.map((breed) => (
                                    <CommandItem
                                      key={breed.id}
                                      value={breed.name}
                                      onSelect={() => {
                                        field.onChange(breed.id);
                                        setBreedOpen(false);
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          'mr-2 size-4',
                                          breed.id === field.value
                                            ? 'opacity-100'
                                            : 'opacity-0'
                                        )}
                                      />
                                      {breed.name}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              )
                            )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Sex + DOB side by side */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="sex"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sex</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select sex" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="dog">Dog</SelectItem>
                        <SelectItem value="bitch">Bitch</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dateOfBirth"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Date of Birth</FormLabel>
                    <Popover
                      open={calendarOpen}
                      onOpenChange={setCalendarOpen}
                    >
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full justify-start text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            <CalendarIcon className="mr-2 size-4" />
                            {field.value
                              ? format(new Date(field.value), 'dd MMM yyyy')
                              : 'Select date'}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          captionLayout="dropdown"
                          selected={
                            field.value ? new Date(field.value) : undefined
                          }
                          onSelect={(date) => {
                            if (date) {
                              field.onChange(format(date, 'yyyy-MM-dd'));
                            }
                            setCalendarOpen(false);
                          }}
                          disabled={(date) =>
                            date > new Date() ||
                            date < new Date('1990-01-01')
                          }
                          defaultMonth={
                            field.value ? new Date(field.value) : undefined
                          }
                          startMonth={new Date(1990, 0)}
                          endMonth={new Date()}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Colour */}
            <FormField
              control={form.control}
              name="colour"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Colour{' '}
                    <span className="text-muted-foreground font-normal">
                      (optional)
                    </span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Black & Tan"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Pedigree (collapsed/compact) */}
            <div className="space-y-3 rounded-lg border p-3 sm:p-4">
              <p className="text-sm font-medium">
                Pedigree{' '}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </p>
              <FormField
                control={form.control}
                name="sireName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">Sire (Father)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Registered name of sire"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="damName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">Dam (Mother)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Registered name of dam"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="breederName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">Breeder</FormLabel>
                    <FormControl>
                      <Input placeholder="Name of breeder" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Button
              type="submit"
              className="h-11 sm:h-12 w-full text-sm sm:text-[0.9375rem]"
              disabled={createDog.isPending}
            >
              {createDog.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Add Dog
            </Button>
          </form>
        </Form>

        <button
          type="button"
          onClick={onSkip}
          className="mt-4 flex w-full items-center justify-center gap-1.5 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <SkipForward className="size-3.5" />
          Skip for now
        </button>
      </CardContent>
    </Card>
  );
}

// ── Club Registration Step ──────────────────────────────────────
function ClubStep({
  userEmail,
  onComplete,
}: {
  userEmail?: string | null;
  onComplete: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-lg sm:text-xl">
          Register Your Club
        </CardTitle>
        <CardDescription className="text-sm sm:text-[0.9375rem]">
          Tell us about your club and we&apos;ll get you set up to manage shows
          on Remi.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ClubApplicationForm
          defaultContactEmail={userEmail ?? ''}
          onSuccess={onComplete}
          tall
        />
      </CardContent>
    </Card>
  );
}

// ── Success Step ────────────────────────────────────────────────
function SuccessStep({
  dogsAdded,
  userName,
  intent,
}: {
  dogsAdded: number;
  userName?: string | null;
  intent: Intent;
}) {
  const router = useRouter();
  const completeOnboarding = trpc.onboarding.complete.useMutation({
    onSuccess: () => {
      // Onboarding done — redirect below will handle it
    },
  });

  // Mark onboarding complete when this step renders
  useEffect(() => {
    completeOnboarding.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstName = userName?.split(' ')[0] ?? 'there';

  const showRunMessage = intent === 'run' || intent === 'both';

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex size-14 items-center justify-center rounded-full bg-primary/10">
          <PartyPopper className="size-7 text-primary" />
        </div>
        <CardTitle className="font-serif text-xl sm:text-2xl">
          You&apos;re all set, {firstName}!
        </CardTitle>
        <CardDescription className="text-sm sm:text-[0.9375rem]">
          {showRunMessage ? (
            <>
              Your club is registered and your secretary account is active.
              You can start creating shows right away!
            </>
          ) : dogsAdded > 0 ? (
            <>
              Your account is ready. You&apos;ve added {dogsAdded}{' '}
              {dogsAdded === 1 ? 'dog' : 'dogs'} — time to find a show!
            </>
          ) : (
            'Your account is ready. You can add your dogs anytime from the dashboard.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button
          className="h-11 sm:h-12 w-full text-sm sm:text-[0.9375rem]"
          onClick={() => { window.location.href = showRunMessage ? '/secretary/shows/new' : '/shows'; }}
        >
          <CalendarDays className="size-4" />
          {showRunMessage ? 'Create Your First Show' : 'Browse Shows'}
        </Button>
        {dogsAdded === 0 && intent !== 'run' && (
          <Button
            variant="outline"
            className="h-11 sm:h-12 w-full text-sm sm:text-[0.9375rem]"
            onClick={() => { window.location.href = '/dogs/new'; }}
          >
            <Dog className="size-4" />
            Add a Dog
          </Button>
        )}
        <Button
          variant="ghost"
          className="h-11 sm:h-12 w-full text-sm sm:text-[0.9375rem]"
          onClick={() => { window.location.href = showRunMessage ? '/secretary' : '/dashboard'; }}
        >
          Go to Dashboard
          <ArrowRight className="size-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
