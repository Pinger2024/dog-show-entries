'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { CalendarIcon, Check, ChevronsUpDown, Loader2, Plus, Trash2, Award, Search, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { cn, getTitleDisplay } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
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

const ownerSchema = z.object({
  ownerName: z.string().min(1, 'Name is required'),
  ownerAddress: z.string().min(1, 'Address is required'),
  ownerEmail: z.string().email('Valid email required'),
  ownerPhone: z.string().optional(),
  isPrimary: z.boolean(),
});

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
  owners: z.array(ownerSchema).optional(),
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

  // KC lookup — returns an array of results
  const [kcResults, setKcResults] = useState<
    { registeredName: string; breed: string; sex: string; dateOfBirth: string; colour?: string; sire: string; dam: string; breeder: string }[]
  >([]);

  function applyKcResult(data: typeof kcResults[number]) {
    if (data.registeredName) form.setValue('registeredName', data.registeredName);
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
        (b) => b.name.toLowerCase() === breedNameLower
          || b.name.toLowerCase().includes(breedNameLower)
          || breedNameLower.includes(b.name.toLowerCase())
      );
      if (matchedBreed) {
        form.setValue('breedId', matchedBreed.id);
      }
    }

    setKcResults([]);
    toast.success('Dog details found on KC website!', {
      description: `${data.registeredName} — fields have been populated.`,
    });
  }

  const kcLookup = trpc.dogs.kcLookup.useMutation({
    onSuccess: (results) => {
      if (results.length === 1) {
        // Single result — auto-fill immediately
        applyKcResult(results[0]);
      } else {
        // Multiple results — show picker
        setKcResults(results);
        toast.info(`Found ${results.length} dogs — please select the right one.`);
      }
    },
    onError: (error) => {
      toast.error('KC Lookup failed', {
        description: error.message,
      });
    },
  });

  // Fetch previously-used owner profiles for reuse
  const { data: ownerProfiles } = trpc.dogs.getMyOwnerProfiles.useQuery(
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
      owners: [],
      ...defaultValues,
    },
  });

  const { fields: ownerFields, append: appendOwner, remove: removeOwner } =
    useFieldArray({ control: form.control, name: 'owners' });

  const isPending = createDog.isPending || updateDog.isPending;

  function onSubmit(data: DogFormValues) {
    if (mode === 'create') {
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
              Enter the details as they appear on your Kennel Club registration
              certificate, or use the KC Lookup to auto-fill.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="kcRegNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>KC Registration Number</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. AQ04052601"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Found on your Kennel Club registration certificate. Leave
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
                      placeholder="e.g. Dorabella Dancing Queen"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Enter the name exactly as it appears on your KC registration
                    certificate.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* KC Lookup Button */}
            <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4">
              <div className="flex items-start gap-3">
                <Search className="mt-0.5 size-5 shrink-0 text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    Auto-fill from Kennel Club
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Enter the KC registration number (e.g. BC28843204) or registered
                    name above, then click the button below. This will look up the
                    dog on the KC website and auto-fill the breed, sex, date of
                    birth, and colour.
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    A registration number gives an exact match. Searching by name can
                    return hundreds of results — use the full registered name (e.g.
                    &quot;Hundark Phantom&quot; not just &quot;Hundark&quot;) to narrow it
                    down. You can find your registration number on your KC certificate or
                    at{' '}
                    <a
                      href="https://www.royalkennelclub.com/search/health-test-results-finder/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary underline underline-offset-2"
                    >
                      royalkennelclub.com
                    </a>
                    .
                  </p>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="mt-3"
                    disabled={kcLookup.isPending}
                    onClick={() => {
                      setKcResults([]);
                      const query = form.getValues('kcRegNumber') || form.getValues('registeredName');
                      if (!query || query.trim().length < 2) {
                        toast.error('Enter a KC registration number or registered name first');
                        return;
                      }
                      kcLookup.mutate({ query: query.trim() });
                    }}
                  >
                    {kcLookup.isPending ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Searching KC website...
                      </>
                    ) : (
                      <>
                        <Search className="size-4" />
                        Lookup on KC Website
                      </>
                    )}
                  </Button>

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
                    Select your dog&apos;s breed from the Kennel Club breed
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

        {/* Owners */}
        <Card>
          <CardHeader>
            <CardTitle>Owners</CardTitle>
            <CardDescription>
              Add up to 4 owners. At least one owner with name, address, and email is required for show entries.
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
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Input placeholder="Full postal address" {...field} />
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
                        <Input placeholder="Phone number" {...field} />
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
                    <PopoverContent className="w-80 p-0" align="start">
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
                No owners added yet. An owner record will be created automatically from your profile when you add this dog.
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
                Championship and other KC titles awarded to this dog.
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
                  <SelectTrigger className="w-full sm:w-64">
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
        <div className="flex gap-3">
          <Button type="submit" disabled={isPending} size="lg">
            {isPending && <Loader2 className="size-4 animate-spin" />}
            {mode === 'create' ? 'Add Dog' : 'Save Changes'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
