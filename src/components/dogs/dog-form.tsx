'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, parse, isValid } from 'date-fns';
import { CalendarIcon, Check, ChevronsUpDown, Loader2, Plus, Trash2, Award, Search, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { cn, getTitleDisplay } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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

const ownerSchema = z.object({
  ownerName: z.string().min(1, 'Name is required'),
  ownerAddress: z.string().min(1, 'Address is required'),
  ownerEmail: z.string().email('Valid email required'),
  ownerPhone: z.string().optional(),
  isPrimary: z.boolean(),
});

// Owners are required at create-time (RKC catalogue listing), but in edit
// mode the form only updates top-level dog fields — the submit handler
// strips `owners` before mutating. Baking `.min(1)` into the schema silently
// blocked edit saves when the form loaded with no owners. We enforce the
// create-mode requirement at submission time instead.
const dogFormSchema = z.object({
  registeredName: z
    .string()
    .min(1, 'Registered name is required')
    .max(255, 'Name must be less than 255 characters'),
  kcRegNumber: z.string().optional(),
  breedId: z.string().min(1, 'Please select a breed'),
  sex: z.enum(['dog', 'bitch'], {
    error: 'Please select the sex of your dog',
  }),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  colour: z.string().optional(),
  sireName: z.string().optional(),
  damName: z.string().optional(),
  breederName: z.string().optional(),
  bio: z.string().optional(),
  owners: z.array(ownerSchema),
});

type DogFormValues = z.infer<typeof dogFormSchema>;

const TITLE_OPTIONS = [
  { value: 'ch', label: 'Ch. — Champion' },
  { value: 'sh_ch', label: 'Sh.Ch. — Show Champion' },
  { value: 'ir_ch', label: 'Ir.Ch. — Irish Champion' },
  { value: 'ir_sh_ch', label: 'Ir.Sh.Ch. — Irish Show Champion' },
  { value: 'int_ch', label: 'Int.Ch. — International Champion' },
  { value: 'ob_ch', label: 'Ob.Ch. — Obedience Champion' },
  { value: 'ft_ch', label: 'FT.Ch. — Field Trial Champion' },
  { value: 'wt_ch', label: 'WT.Ch. — Working Trial Champion' },
] as const;

interface DogFormProps {
  mode: 'create' | 'edit';
  defaultValues?: Partial<DogFormValues>;
  dogId?: string;
}

export function DogForm({ mode, defaultValues, dogId }: DogFormProps) {
  const router = useRouter();
  const [breedOpen, setBreedOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const { data: breeds, isLoading: breedsLoading } =
    trpc.breeds.list.useQuery();

  // If RKC lookup returns before breeds have loaded, stash the breed name
  // and apply it once the breeds query resolves.
  const pendingBreedName = useRef<string | null>(null);

  // Fetch existing dog data for titles in edit mode
  const { data: dogData } = trpc.dogs.getById.useQuery(
    { id: dogId! },
    { enabled: mode === 'edit' && !!dogId }
  );

  const utils = trpc.useUtils();

  const createDog = trpc.dogs.create.useMutation({
    onSuccess: () => {
      utils.dogs.list.invalidate();
      toast.success('Dog added successfully!', {
        description: 'Your dog has been added to your profile.',
      });
      router.push('/dogs');
    },
    onError: (error) => {
      toast.error('Something went wrong', {
        description: error.message,
      });
    },
  });

  const updateDog = trpc.dogs.update.useMutation({
    onSuccess: () => {
      utils.dogs.list.invalidate();
      if (dogId) utils.dogs.getById.invalidate({ id: dogId });
      toast.success('Dog updated successfully!', {
        description: 'Your changes have been saved.',
      });
      router.push(`/dogs/${dogId}`);
    },
    onError: (error) => {
      toast.error('Something went wrong', {
        description: error.message,
      });
    },
  });

  const addTitle = trpc.dogs.addTitle.useMutation({
    onSuccess: () => {
      if (dogId) utils.dogs.getById.invalidate({ id: dogId });
      toast.success('Title added');
    },
  });

  const removeTitle = trpc.dogs.removeTitle.useMutation({
    onSuccess: () => {
      if (dogId) utils.dogs.getById.invalidate({ id: dogId });
      toast.success('Title removed');
    },
  });

  // RKC lookup — returns an array of results
  const [kcResults, setKcResults] = useState<
    { registeredName: string; breed: string; sex: string; dateOfBirth: string; colour?: string; sire: string; dam: string; breeder: string; dogId?: string }[]
  >([]);

  // Phase 2: Fetch enriched pedigree data from the RKC dog profile page
  const kcProfileLookup = trpc.dogs.kcLookupProfile.useMutation({
    onSuccess: (profile) => {
      if (!profile) return;
      const sv = { shouldValidate: true, shouldDirty: true } as const;
      // Only fill sire/dam/breeder if not already populated (don't overwrite manual entries)
      if (profile.sire && !form.getValues('sireName')) {
        form.setValue('sireName', profile.sire, sv);
      }
      if (profile.dam && !form.getValues('damName')) {
        form.setValue('damName', profile.dam, sv);
      }
      if (profile.breeder && !form.getValues('breederName')) {
        form.setValue('breederName', profile.breeder, sv);
      }
      // Colour from profile page may be more detailed
      if (profile.colour && !form.getValues('colour')) {
        form.setValue('colour', profile.colour, sv);
      }

      const enriched = [profile.sire, profile.dam, profile.breeder].filter(Boolean);
      if (enriched.length > 0) {
        toast.success('Pedigree details populated from RKC', {
          description: `Sire, dam, and breeder info filled in from the Royal Kennel Club.`,
        });
      }
    },
    // Silent failure — profile enrichment is optional
    onError: () => {},
  });

  function applyKcResult(data: typeof kcResults[number]) {
    const sv = { shouldValidate: true, shouldDirty: true } as const;

    if (data.registeredName) form.setValue('registeredName', data.registeredName, sv);
    if (data.sex) form.setValue('sex', data.sex as 'dog' | 'bitch', sv);
    if (data.dateOfBirth) {
      // Parse RKC dates robustly — Safari doesn't handle "18 January 2024" via new Date()
      const dateStr = data.dateOfBirth.trim();
      const formats = ['dd MMMM yyyy', 'dd/MM/yyyy', 'dd MMM yyyy', 'yyyy-MM-dd'];
      let parsed: Date | null = null;
      for (const fmt of formats) {
        const attempt = parse(dateStr, fmt, new Date());
        if (isValid(attempt)) { parsed = attempt; break; }
      }
      // Fallback to native Date (works in Chrome)
      if (!parsed) {
        const fallback = new Date(dateStr);
        if (isValid(fallback)) parsed = fallback;
      }
      if (parsed) {
        form.setValue('dateOfBirth', format(parsed, 'yyyy-MM-dd'), sv);
      }
    }
    if (data.sire) form.setValue('sireName', data.sire, sv);
    if (data.dam) form.setValue('damName', data.dam, sv);
    if (data.breeder) form.setValue('breederName', data.breeder, sv);
    if (data.colour) form.setValue('colour', data.colour, sv);

    if (data.breed) {
      if (breeds) {
        const breedNameLower = data.breed.toLowerCase();
        const matchedBreed = breeds.find(
          (b) => b.name.toLowerCase() === breedNameLower
            || b.name.toLowerCase().includes(breedNameLower)
            || breedNameLower.includes(b.name.toLowerCase())
        );
        if (matchedBreed) {
          form.setValue('breedId', matchedBreed.id, sv);
        }
      } else {
        // Breeds haven't loaded yet — stash for the useEffect to pick up
        pendingBreedName.current = data.breed;
      }
    }

    setKcResults([]);
    toast.success('Dog details found on RKC website!', {
      description: `${data.registeredName} — fields have been populated.`,
    });

    // Phase 2: If we have a dogId, fetch the profile page for sire/dam/breeder
    if (data.dogId) {
      kcProfileLookup.mutate({ dogId: data.dogId });
    }
  }

  // Local Remi search results
  const [remiResults, setRemiResults] = useState<
    {
      id: string;
      registeredName: string;
      kcRegNumber: string | null;
      breed: string | null;
      sex: string | null;
      dateOfBirth: string | null;
      sireName: string | null;
      damName: string | null;
      breederName: string | null;
      colour: string | null;
      ownerId: string;
      source: 'remi';
    }[]
  >([]);
  const [searchingRemi, setSearchingRemi] = useState(false);

  function applyRemiResult(data: typeof remiResults[number]) {
    const sv = { shouldValidate: true, shouldDirty: true } as const;

    if (data.registeredName) form.setValue('registeredName', data.registeredName, sv);
    if (data.kcRegNumber) form.setValue('kcRegNumber', data.kcRegNumber, sv);
    if (data.sex === 'dog' || data.sex === 'bitch') {
      form.setValue('sex', data.sex, sv);
    }
    if (data.dateOfBirth) form.setValue('dateOfBirth', data.dateOfBirth, sv);
    if (data.colour) form.setValue('colour', data.colour, sv);
    if (data.sireName) form.setValue('sireName', data.sireName, sv);
    if (data.damName) form.setValue('damName', data.damName, sv);
    if (data.breederName) form.setValue('breederName', data.breederName, sv);

    if (data.breed) {
      if (breeds) {
        const matched = breeds.find((b) => b.name === data.breed);
        if (matched) form.setValue('breedId', matched.id, sv);
      } else {
        pendingBreedName.current = data.breed;
      }
    }

    setRemiResults([]);
    toast.success('Dog details populated from Remi', {
      description: `${data.registeredName} — check the fields and fill in anything missing.`,
    });
  }

  const kcLookup = trpc.dogs.kcLookup.useMutation({
    onSuccess: (results) => {
      if (results.length === 1) {
        applyKcResult(results[0]);
      } else {
        setKcResults(results);
        toast.info(`Found ${results.length} dogs on RKC — please select the right one.`);
      }
    },
    onError: (error) => {
      toast.error('RKC Lookup failed', {
        description: error.message,
      });
    },
  });

  // Fetch previously-used owner profiles for reuse
  const { data: ownerProfiles } = trpc.dogs.getMyOwnerProfiles.useQuery(
    undefined,
    { enabled: mode === 'create' }
  );

  // Fetch current user's profile to pre-populate the primary owner
  const { data: userProfile } = trpc.users.getProfile.useQuery(
    undefined,
    { enabled: mode === 'create' }
  );

  const form = useForm<DogFormValues>({
    resolver: zodResolver(dogFormSchema),
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
      bio: '',
      owners: [],
      ...defaultValues,
    },
  });

  // Pre-populate primary owner from user profile when creating a new dog
  const ownerPrepopulated = useRef(false);
  useEffect(() => {
    if (mode === 'create' && userProfile && !ownerPrepopulated.current && form.getValues('owners').length === 0) {
      ownerPrepopulated.current = true;
      form.setValue('owners', [{
        ownerName: userProfile.name ?? '',
        ownerAddress: [userProfile.address, userProfile.postcode].filter(Boolean).join(', '),
        ownerEmail: userProfile.email ?? '',
        ownerPhone: userProfile.phone ?? '',
        isPrimary: true,
      }]);
    }
  }, [mode, userProfile, form]);

  // When breeds load after a RKC lookup already stashed a breed name, apply it
  useEffect(() => {
    if (breeds && pendingBreedName.current && !form.getValues('breedId')) {
      const breedNameLower = pendingBreedName.current.toLowerCase();
      const matched = breeds.find(
        (b) => b.name.toLowerCase() === breedNameLower
          || b.name.toLowerCase().includes(breedNameLower)
          || breedNameLower.includes(b.name.toLowerCase())
      );
      if (matched) {
        form.setValue('breedId', matched.id, { shouldValidate: true, shouldDirty: true });
      }
      pendingBreedName.current = null;
    }
  }, [breeds, form]);

  const { fields: ownerFields, append: appendOwner, remove: removeOwner } =
    useFieldArray({ control: form.control, name: 'owners' });

  const isPending = createDog.isPending || updateDog.isPending;

  function onSubmit(data: DogFormValues) {
    if (mode === 'create') {
      if (!data.owners || data.owners.length === 0) {
        form.setError('owners', {
          type: 'manual',
          message: 'At least one owner with name and address is required',
        });
        toast.error('Please add at least one owner');
        return;
      }
      createDog.mutate(data);
    } else if (dogId) {
      const { owners: _owners, ...dogFields } = data;
      updateDog.mutate({ id: dogId, ...dogFields });
    }
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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Registration Details */}
        <Card>
          <CardHeader>
            <CardTitle>Registration Details</CardTitle>
            <CardDescription>
              Enter the details as they appear on your Royal Kennel Club registration
              certificate, or use the RKC Lookup to auto-fill.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="kcRegNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>RKC Registration Number <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. AQ04052601"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Found on your Royal Kennel Club registration certificate. Leave
                    blank if not yet registered.
                  </FormDescription>
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
                      placeholder="e.g. Thornfield Silver Dream"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Enter the name exactly as it appears on your RKC registration
                    certificate.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* RKC Lookup Button */}
            <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4">
              <div className="flex items-start gap-3">
                <Search className="mt-0.5 size-5 shrink-0 text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    Find your dog
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Enter the registered name or RKC registration number above, then
                    click the button. We&apos;ll search Remi first — if your dog has been
                    entered in a show before, we&apos;ll find them instantly. Otherwise
                    we&apos;ll look them up on the RKC website.
                  </p>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="mt-3"
                    disabled={kcLookup.isPending || searchingRemi}
                    onClick={async () => {
                      setKcResults([]);
                      setRemiResults([]);
                      const query = form.getValues('kcRegNumber') || form.getValues('registeredName');
                      if (!query || query.trim().length < 2) {
                        toast.error('Enter a RKC registration number or registered name first');
                        return;
                      }

                      // Search Remi first
                      setSearchingRemi(true);
                      try {
                        const local = await utils.dogs.search.fetch({ query: query.trim() });
                        if (local.length > 0) {
                          setRemiResults(local);
                          setSearchingRemi(false);
                          toast.success(`Found ${local.length} dog${local.length !== 1 ? 's' : ''} already in Remi`);
                          return;
                        }
                      } catch {
                        // Remi search failed — fall through to RKC
                      }
                      setSearchingRemi(false);

                      // Fall back to RKC
                      kcLookup.mutate({ query: query.trim() });
                    }}
                  >
                    {searchingRemi ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Searching Remi...
                      </>
                    ) : kcLookup.isPending ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Searching RKC website...
                      </>
                    ) : (
                      <>
                        <Search className="size-4" />
                        Find My Dog
                      </>
                    )}
                  </Button>

                  {/* Remi local results — clicking the dog name populates
                      the form. A secondary "Go to existing profile →" link
                      is offered underneath for the rare case where the user
                      actually wants to navigate to the existing dog rather
                      than create a new entry. */}
                  {remiResults.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-sm font-medium text-emerald-700">
                        Found in Remi — tap to fill in the details
                      </p>
                      <div className="space-y-1">
                        {remiResults.map((dog) => (
                          <div
                            key={dog.id}
                            className="rounded-md border border-emerald-200 bg-emerald-50"
                          >
                            <button
                              type="button"
                              onClick={() => applyRemiResult(dog)}
                              className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-emerald-100 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:py-2"
                            >
                              <div className="min-w-0">
                                <span className="font-medium">{dog.registeredName}</span>
                                {dog.breed && (
                                  <span className="ml-2 text-muted-foreground">{dog.breed}</span>
                                )}
                              </div>
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {dog.sex === 'bitch' ? 'Bitch' : dog.sex === 'dog' ? 'Dog' : ''}
                                {dog.kcRegNumber ? ` · ${dog.kcRegNumber}` : ''}
                              </span>
                            </button>
                            <a
                              href={`/dogs/${dog.id}`}
                              className="block border-t border-emerald-200 px-3 py-1.5 text-center text-xs text-emerald-700 hover:bg-emerald-100"
                            >
                              Go to existing profile →
                            </a>
                          </div>
                        ))}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted-foreground"
                        onClick={() => {
                          setRemiResults([]);
                          const query = form.getValues('kcRegNumber') || form.getValues('registeredName');
                          if (query) kcLookup.mutate({ query: query.trim() });
                        }}
                      >
                        Not here? Search RKC website instead
                      </Button>
                    </div>
                  )}

                  {/* Multiple results picker */}
                  {kcResults.length > 1 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-sm font-medium">
                        {kcResults.length} dogs found — select the correct one:
                      </p>
                      {kcResults.length >= 12 && (
                        <p className="text-xs text-amber-600">
                          Showing first 12 results only. Try a more specific search
                          (e.g. the full registered name) if your dog isn&apos;t listed.
                        </p>
                      )}
                      <div className="max-h-[40vh] sm:max-h-60 space-y-1 overflow-y-auto overscroll-contain -webkit-overflow-scrolling-touch">
                        {kcResults.map((dog, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => applyKcResult(dog)}
                            className="flex w-full flex-col gap-0.5 rounded-md border px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:py-2"
                          >
                            <div className="min-w-0">
                              <span className="font-medium">{dog.registeredName}</span>
                              <span className="ml-2 text-muted-foreground">
                                {dog.breed}
                              </span>
                            </div>
                            <span className="shrink-0 text-xs text-muted-foreground">
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
          </CardContent>
        </Card>

        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>
              Tell us about your dog.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4">
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
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
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
                  <FormDescription>
                    Select your dog&apos;s breed from the Royal Kennel Club breed
                    register.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Sex */}
            <FormField
              control={form.control}
              name="sex"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sex</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full h-11">
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

            {/* Date of Birth */}
            <FormField
              control={form.control}
              name="dateOfBirth"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Date of Birth</FormLabel>
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
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
                            ? format(new Date(field.value), 'dd MMMM yyyy')
                            : 'Select date of birth'}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto max-w-[calc(100vw-2rem)] p-0" align="start">
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
                          date > new Date() || date < new Date('1990-01-01')
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

            {/* Colour */}
            <FormField
              control={form.control}
              name="colour"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Colour</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Tricolour, Red, Black & Tan" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Pedigree */}
        <Card>
          <CardHeader>
            <CardTitle>Pedigree</CardTitle>
            <CardDescription>
              Your dog&apos;s lineage details. These are often required for show
              entries.
            </CardDescription>
            {kcProfileLookup.isPending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Fetching pedigree details from RKC...
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4">
            <FormField
              control={form.control}
              name="sireName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sire (Father)</FormLabel>
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
                  <FormLabel>Dam (Mother)</FormLabel>
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
                  <FormLabel>Breeder</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Name of breeder"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Bio */}
        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
            <CardDescription>
              A short biography for your dog&apos;s public profile. Temperament, achievements,
              or anything that makes them special.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="bio"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea
                      placeholder="e.g. A confident and spirited youngster with a love of the ring..."
                      rows={4}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Owners */}
        <Card>
          <CardHeader>
            <CardTitle>Owners</CardTitle>
            <CardDescription>
              Owner name and full postal address are required — RKC catalogues
              must list them. Add up to 4 owners.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {ownerFields.map((field, index) => (
              <div key={field.id} className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Owner {index + 1}
                    {index === 0 && ' (Primary)'}
                  </span>
                  {index > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeOwner(index)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name={`owners.${index}.ownerName`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Full name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`owners.${index}.ownerEmail`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            placeholder="owner@example.com"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name={`owners.${index}.ownerAddress`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full postal address</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="House, street, town, postcode"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`owners.${index}.ownerPhone`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone (optional)</FormLabel>
                      <FormControl>
                        <Input type="tel" inputMode="tel" autoComplete="tel" placeholder="Phone number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ))}

            {ownerFields.length < 4 && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    appendOwner({
                      ownerName: '',
                      ownerAddress: '',
                      ownerEmail: '',
                      ownerPhone: '',
                      isPrimary: ownerFields.length === 0,
                    })
                  }
                >
                  <Plus className="size-4" />
                  Add New Owner
                </Button>
                {mode === 'create' && ownerProfiles && ownerProfiles.length > 0 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="secondary" size="sm">
                        <UserPlus className="size-4" />
                        Use Previous Owner
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 max-w-[calc(100vw-1rem)] p-0" align="start">
                      <div className="border-b px-3 py-2">
                        <p className="text-sm font-medium">Select a previous owner</p>
                        <p className="text-xs text-muted-foreground">
                          From your other dogs
                        </p>
                      </div>
                      <div className="max-h-60 overflow-y-auto p-1">
                        {ownerProfiles.map((profile, i) => (
                          <button
                            key={`${profile.ownerEmail}-${i}`}
                            type="button"
                            className="flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent"
                            onClick={() => {
                              appendOwner({
                                ownerName: profile.ownerName,
                                ownerAddress: profile.ownerAddress,
                                ownerEmail: profile.ownerEmail,
                                ownerPhone: profile.ownerPhone ?? '',
                                isPrimary: ownerFields.length === 0,
                              });
                              toast.success(`Added ${profile.ownerName}`);
                            }}
                          >
                            <span className="text-sm font-medium">
                              {profile.ownerName}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {profile.ownerEmail}
                            </span>
                            <span className="line-clamp-1 text-xs text-muted-foreground">
                              {profile.ownerAddress}
                            </span>
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            )}

            {ownerFields.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No owners added yet. Click &quot;Add New Owner&quot; to add one.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Titles (edit mode only — need saved dog to add titles) */}
        {mode === 'edit' && dogId && (
          <Card>
            <CardHeader>
              <CardTitle>Titles</CardTitle>
              <CardDescription>
                Championship and other RKC titles awarded to this dog.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {dogData?.titles && dogData.titles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {dogData.titles.map((t) => (
                    <Badge key={t.id} variant="default" className="gap-1.5 text-sm">
                      <Award className="size-3" />
                      {getTitleDisplay(t.title)}
                      <button
                        type="button"
                        className="ml-1 rounded-full p-0.5 hover:bg-white/20"
                        onClick={() => removeTitle.mutate({ id: t.id })}
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Select
                  onValueChange={(value) => {
                    addTitle.mutate({ dogId, title: value as 'ch' | 'sh_ch' | 'ir_ch' | 'ir_sh_ch' | 'int_ch' | 'ob_ch' | 'ft_ch' | 'wt_ch' });
                  }}
                >
                  <SelectTrigger className="w-full sm:w-64 h-11">
                    <SelectValue placeholder="Add a title..." />
                  </SelectTrigger>
                  <SelectContent>
                    {TITLE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Submit */}
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
          <Button type="submit" disabled={isPending} size="lg" className="w-full sm:w-auto">
            {isPending && <Loader2 className="size-4 animate-spin" />}
            {mode === 'create' ? 'Add Dog' : 'Save Changes'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full sm:w-auto"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
