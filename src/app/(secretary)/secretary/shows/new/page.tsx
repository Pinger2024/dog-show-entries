'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Plus,
  CalendarIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

const showTypes = [
  { value: 'championship', label: 'Championship' },
  { value: 'open', label: 'Open' },
  { value: 'limited', label: 'Limited' },
  { value: 'premier_open', label: 'Premier Open' },
  { value: 'primary', label: 'Primary' },
  { value: 'companion', label: 'Companion' },
] as const;

const showScopes = [
  { value: 'general', label: 'General' },
  { value: 'single_breed', label: 'Breed' },
  { value: 'group', label: 'Group' },
] as const;

const createShowSchema = z.object({
  // Step 1 - Basic Info
  name: z.string().min(1, 'Show name is required').max(255),
  showType: z.enum([
    'companion',
    'primary',
    'limited',
    'open',
    'premier_open',
    'championship',
  ]),
  showScope: z.enum(['single_breed', 'group', 'general']),
  organisationId: z.string().uuid('Please select an organisation'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  entriesOpenDate: z.string().optional(),
  entryCloseDate: z.string().optional(),
  postalCloseDate: z.string().optional(),
  description: z.string().optional(),

  // Step 2 - Venue
  venueId: z.string().uuid().optional(),
  newVenueName: z.string().optional(),
  newVenueAddress: z.string().optional(),
  newVenuePostcode: z.string().optional(),
  newVenueIndoorOutdoor: z.string().optional(),

  // Step 3 - Entry Fees (in pence)
  firstEntryFee: z.coerce.number().min(0, 'Fee must be 0 or more').default(0),
  subsequentEntryFee: z.coerce.number().min(0).default(0),
  nfcEntryFee: z.coerce.number().min(0).default(0),

  // Step 4 - Classes
  selectedClassIds: z.array(z.string().uuid()).default([]),
});

type CreateShowValues = z.infer<typeof createShowSchema>;

const STEPS = [
  'Basic Info',
  'Venue',
  'Entry Fees',
  'Classes',
  'Review',
] as const;

function formatDateDisplay(dateStr: string) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatCurrency(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

export default function NewShowPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [createVenue, setCreateVenue] = useState(false);

  const form = useForm<CreateShowValues>({
    resolver: zodResolver(createShowSchema) as never,
    defaultValues: {
      name: '',
      showType: 'open',
      showScope: 'general',
      organisationId: '',
      startDate: '',
      endDate: '',
      entriesOpenDate: '',
      entryCloseDate: '',
      postalCloseDate: '',
      description: '',
      venueId: undefined,
      newVenueName: '',
      newVenueAddress: '',
      newVenuePostcode: '',
      newVenueIndoorOutdoor: '',
      firstEntryFee: 0,
      subsequentEntryFee: 0,
      nfcEntryFee: 0,
      selectedClassIds: [],
    },
  });

  const { data: dashboardData } = trpc.secretary.getDashboard.useQuery();
  const { data: venues } = trpc.secretary.listVenues.useQuery();
  const { data: classDefinitions } = trpc.secretary.listClassDefinitions.useQuery();

  const createVenueMutation = trpc.secretary.createVenue.useMutation();
  const createShowMutation = trpc.shows.create.useMutation();

  const organisations = dashboardData?.organisations ?? [];

  // Auto-select the organisation if there's only one
  const currentOrgId = form.watch('organisationId');
  if (organisations.length === 1 && !currentOrgId) {
    form.setValue('organisationId', organisations[0].id);
  }

  const isSubmitting =
    createVenueMutation.isPending || createShowMutation.isPending;

  async function onSubmit(values: CreateShowValues, asDraft: boolean) {
    try {
      let venueId = values.venueId;

      // Create venue if needed
      if (createVenue && values.newVenueName) {
        const venue = await createVenueMutation.mutateAsync({
          name: values.newVenueName,
          address: values.newVenueAddress || undefined,
          postcode: values.newVenuePostcode || undefined,
          indoorOutdoor: values.newVenueIndoorOutdoor || undefined,
        });
        venueId = venue.id;
      }

      const show = await createShowMutation.mutateAsync({
        name: values.name,
        showType: values.showType,
        showScope: values.showScope,
        organisationId: values.organisationId,
        venueId: venueId || undefined,
        startDate: values.startDate,
        endDate: values.endDate,
        entriesOpenDate: values.entriesOpenDate
          ? new Date(values.entriesOpenDate).toISOString()
          : undefined,
        entryCloseDate: values.entryCloseDate
          ? new Date(values.entryCloseDate).toISOString()
          : undefined,
        postalCloseDate: values.postalCloseDate
          ? new Date(values.postalCloseDate).toISOString()
          : undefined,
        description: values.description || undefined,
        classDefinitionIds: values.selectedClassIds.length > 0
          ? values.selectedClassIds
          : undefined,
        entryFee: values.firstEntryFee > 0
          ? values.firstEntryFee
          : undefined,
      });

      toast.success(
        asDraft ? 'Show saved as draft' : 'Show created successfully'
      );
      router.push(`/secretary/shows/${show.id}`);
    } catch (error) {
      console.error('Show creation failed:', error);
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      toast.error('Failed to create show', { description: message });
    }
  }

  // Watch the fields needed for step validation so the button re-renders
  const watchedName = form.watch('name');
  const watchedShowType = form.watch('showType');
  const watchedShowScope = form.watch('showScope');
  const watchedOrgId = form.watch('organisationId');
  const watchedStartDate = form.watch('startDate');
  const watchedEndDate = form.watch('endDate');

  function canProceed(): boolean {
    switch (step) {
      case 0:
        return !!(
          watchedName &&
          watchedShowType &&
          watchedShowScope &&
          watchedOrgId &&
          watchedStartDate &&
          watchedEndDate
        );
      case 1:
        return true; // Venue is optional
      case 2:
        return true; // Fees can be 0
      case 3:
        return true; // Classes can be added later
      default:
        return true;
    }
  }

  const ageClasses =
    classDefinitions?.filter((cd) => cd.type === 'age') ?? [];
  const achievementClasses =
    classDefinitions?.filter((cd) => cd.type === 'achievement') ?? [];
  const specialClasses =
    classDefinitions?.filter((cd) => cd.type === 'special') ?? [];

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Create New Show</h1>
        <p className="mt-1 text-muted-foreground">
          Set up a new show in {STEPS.length} steps.
        </p>
      </div>

      {/* Step indicator */}
      <nav className="flex items-center gap-1 overflow-x-auto">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => i < step && setStep(i)}
            disabled={i > step}
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
              i === step
                ? 'bg-primary text-primary-foreground'
                : i < step
                  ? 'bg-muted text-foreground hover:bg-muted/80 cursor-pointer'
                  : 'text-muted-foreground'
            )}
          >
            <span
              className={cn(
                'flex size-5 items-center justify-center rounded-full text-xs',
                i === step
                  ? 'bg-primary-foreground text-primary'
                  : i < step
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted-foreground/20'
              )}
            >
              {i < step ? <Check className="size-3" /> : i + 1}
            </span>
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </nav>

      <Form {...form}>
        <form onSubmit={(e) => e.preventDefault()}>
          {/* Step 1: Basic Info */}
          {step === 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
                <CardDescription>
                  Set the name, type, and dates for your show.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Show Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Spring Championship 2026"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="showType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Show Type</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {showTypes.map((t) => (
                              <SelectItem key={t.value} value={t.value}>
                                {t.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="showScope"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Show Scope</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select scope" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {showScopes.map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="organisationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Organisation</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select organisation" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {organisations.map((org) => (
                            <SelectItem key={org.id} value={org.id}>
                              {org.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  'w-full justify-start text-left font-normal',
                                  !field.value && 'text-muted-foreground'
                                )}
                              >
                                <CalendarIcon className="size-4" />
                                {field.value
                                  ? format(new Date(field.value), 'PPP')
                                  : 'Pick a date'}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={
                                field.value
                                  ? new Date(field.value)
                                  : undefined
                              }
                              onSelect={(date) =>
                                field.onChange(
                                  date
                                    ? date.toISOString().split('T')[0]
                                    : ''
                                )
                              }
                              disabled={(date) => date < new Date()}
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  'w-full justify-start text-left font-normal',
                                  !field.value && 'text-muted-foreground'
                                )}
                              >
                                <CalendarIcon className="size-4" />
                                {field.value
                                  ? format(new Date(field.value), 'PPP')
                                  : 'Pick a date'}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={
                                field.value
                                  ? new Date(field.value)
                                  : undefined
                              }
                              onSelect={(date) =>
                                field.onChange(
                                  date
                                    ? date.toISOString().split('T')[0]
                                    : ''
                                )
                              }
                              disabled={(date) => {
                                const start = form.getValues('startDate');
                                return start
                                  ? date < new Date(start)
                                  : date < new Date();
                              }}
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="entriesOpenDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Entries Open Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  'w-full justify-start text-left font-normal',
                                  !field.value && 'text-muted-foreground'
                                )}
                              >
                                <CalendarIcon className="size-4" />
                                {field.value
                                  ? format(new Date(field.value), 'PPP')
                                  : 'Optional'}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={
                                field.value
                                  ? new Date(field.value)
                                  : undefined
                              }
                              onSelect={(date) =>
                                field.onChange(
                                  date
                                    ? date.toISOString().split('T')[0]
                                    : ''
                                )
                              }
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="entryCloseDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Entry Close Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  'w-full justify-start text-left font-normal',
                                  !field.value && 'text-muted-foreground'
                                )}
                              >
                                <CalendarIcon className="size-4" />
                                {field.value
                                  ? format(new Date(field.value), 'PPP')
                                  : 'Optional'}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={
                                field.value
                                  ? new Date(field.value)
                                  : undefined
                              }
                              onSelect={(date) =>
                                field.onChange(
                                  date
                                    ? date.toISOString().split('T')[0]
                                    : ''
                                )
                              }
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="postalCloseDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Postal Close Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  'w-full justify-start text-left font-normal',
                                  !field.value && 'text-muted-foreground'
                                )}
                              >
                                <CalendarIcon className="size-4" />
                                {field.value
                                  ? format(new Date(field.value), 'PPP')
                                  : 'Optional'}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={
                                field.value
                                  ? new Date(field.value)
                                  : undefined
                              }
                              onSelect={(date) =>
                                field.onChange(
                                  date
                                    ? date.toISOString().split('T')[0]
                                    : ''
                                )
                              }
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Optional description for exhibitors..."
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          )}

          {/* Step 2: Venue */}
          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Venue</CardTitle>
                <CardDescription>
                  Select an existing venue or create a new one.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={!createVenue ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCreateVenue(false)}
                  >
                    Existing Venue
                  </Button>
                  <Button
                    type="button"
                    variant={createVenue ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setCreateVenue(true);
                      form.setValue('venueId', undefined);
                    }}
                  >
                    <Plus className="size-3.5" />
                    New Venue
                  </Button>
                </div>

                {!createVenue ? (
                  <FormField
                    control={form.control}
                    name="venueId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Venue</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select a venue (optional)" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(venues ?? []).map((v) => (
                              <SelectItem key={v.id} value={v.id}>
                                {v.name}
                                {v.postcode ? ` (${v.postcode})` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <div className="space-y-4 rounded-lg border p-4">
                    <FormField
                      control={form.control}
                      name="newVenueName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Venue Name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. National Exhibition Centre"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="newVenueAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Full address"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="newVenuePostcode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Postcode</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. B40 1NT" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="newVenueIndoorOutdoor"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Indoor/Outdoor</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Select" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="indoor">Indoor</SelectItem>
                                <SelectItem value="outdoor">Outdoor</SelectItem>
                                <SelectItem value="both">Both</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 3: Entry Fees */}
          {step === 2 && (
            <Card>
              <CardHeader>
                <CardTitle>Entry Fees</CardTitle>
                <CardDescription>
                  Set the entry fees in pounds. Enter amounts in pence (e.g.
                  2500 = £25.00).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="firstEntryFee"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Entry Fee (pence)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          placeholder="e.g. 2500"
                          {...field}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        {field.value
                          ? formatCurrency(Number(field.value))
                          : '£0.00'}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="subsequentEntryFee"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subsequent Entry Fee (pence)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          placeholder="e.g. 1500"
                          {...field}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        {field.value
                          ? formatCurrency(Number(field.value))
                          : '£0.00'}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="nfcEntryFee"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>NFC Entry Fee (pence)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          placeholder="e.g. 500"
                          {...field}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        {field.value
                          ? formatCurrency(Number(field.value))
                          : '£0.00'}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          )}

          {/* Step 4: Classes */}
          {step === 3 && (
            <Card>
              <CardHeader>
                <CardTitle>Classes</CardTitle>
                <CardDescription>
                  Select which standard classes to offer at this show. You can
                  refine class configuration after creating the show.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {classDefinitions && classDefinitions.length > 0 ? (
                  <div className="space-y-6">
                    {ageClasses.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                          Age-Based Classes
                        </h3>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {ageClasses.map((cd) => (
                            <ClassCheckbox
                              key={cd.id}
                              classDefinition={cd}
                              form={form}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {achievementClasses.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                          Achievement-Based Classes
                        </h3>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {achievementClasses.map((cd) => (
                            <ClassCheckbox
                              key={cd.id}
                              classDefinition={cd}
                              form={form}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {specialClasses.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                          Special Classes
                        </h3>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {specialClasses.map((cd) => (
                            <ClassCheckbox
                              key={cd.id}
                              classDefinition={cd}
                              form={form}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No class definitions found. You can add classes after
                    creating the show.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 5: Review */}
          {step === 4 && <ReviewStep form={form} organisations={organisations} venues={venues ?? []} classDefinitions={classDefinitions ?? []} createVenue={createVenue} />}

          {/* Navigation */}
          <div className="mt-6 flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => (step === 0 ? router.back() : setStep(step - 1))}
            >
              <ArrowLeft className="size-4" />
              {step === 0 ? 'Cancel' : 'Back'}
            </Button>

            <div className="flex gap-2">
              {step === 4 ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSubmitting}
                    onClick={() => onSubmit(form.getValues(), true)}
                  >
                    {isSubmitting && (
                      <Loader2 className="size-4 animate-spin" />
                    )}
                    Save as Draft
                  </Button>
                  <Button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => onSubmit(form.getValues(), false)}
                  >
                    {isSubmitting && (
                      <Loader2 className="size-4 animate-spin" />
                    )}
                    Create Show
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  disabled={!canProceed()}
                  onClick={() => setStep(step + 1)}
                >
                  Next
                  <ArrowRight className="size-4" />
                </Button>
              )}
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}

function ClassCheckbox({
  classDefinition,
  form,
}: {
  classDefinition: { id: string; name: string; description: string | null };
  form: ReturnType<typeof useForm<CreateShowValues>>;
}) {
  const selectedIds = form.watch('selectedClassIds');
  const isSelected = selectedIds.includes(classDefinition.id);

  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
        isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
      )}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={(e) => {
          if (e.target.checked) {
            form.setValue('selectedClassIds', [
              ...selectedIds,
              classDefinition.id,
            ]);
          } else {
            form.setValue(
              'selectedClassIds',
              selectedIds.filter((id) => id !== classDefinition.id)
            );
          }
        }}
        className="mt-0.5 size-4 rounded border-input"
      />
      <div className="min-w-0">
        <p className="text-sm font-medium">{classDefinition.name}</p>
        {classDefinition.description && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {classDefinition.description}
          </p>
        )}
      </div>
    </label>
  );
}

function ReviewStep({
  form,
  organisations,
  venues,
  classDefinitions,
  createVenue,
}: {
  form: ReturnType<typeof useForm<CreateShowValues>>;
  organisations: { id: string; name: string }[];
  venues: { id: string; name: string; postcode: string | null }[];
  classDefinitions: { id: string; name: string }[];
  createVenue: boolean;
}) {
  const values = form.getValues();
  const org = organisations.find((o) => o.id === values.organisationId);
  const venue = venues.find((v) => v.id === values.venueId);
  const selectedClasses = classDefinitions.filter((cd) =>
    values.selectedClassIds.includes(cd.id)
  );
  const showType = showTypes.find((t) => t.value === values.showType);
  const showScope = showScopes.find((s) => s.value === values.showScope);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review & Create</CardTitle>
        <CardDescription>
          Review your show details before creating.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Basic Info
          </h3>
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">Name</dt>
              <dd className="font-medium">{values.name}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Type</dt>
              <dd className="font-medium">{showType?.label}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Scope</dt>
              <dd className="font-medium">{showScope?.label}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Organisation</dt>
              <dd className="font-medium">{org?.name ?? 'Not set'}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Start Date</dt>
              <dd className="font-medium">
                {values.startDate ? formatDateDisplay(values.startDate) : 'Not set'}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">End Date</dt>
              <dd className="font-medium">
                {values.endDate ? formatDateDisplay(values.endDate) : 'Not set'}
              </dd>
            </div>
          </dl>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Venue
          </h3>
          {createVenue && values.newVenueName ? (
            <p className="font-medium">
              {values.newVenueName} (new)
              {values.newVenuePostcode && ` — ${values.newVenuePostcode}`}
            </p>
          ) : venue ? (
            <p className="font-medium">
              {venue.name}
              {venue.postcode && ` — ${venue.postcode}`}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No venue selected</p>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Entry Fees
          </h3>
          <dl className="grid gap-2 sm:grid-cols-3">
            <div>
              <dt className="text-sm text-muted-foreground">First Entry</dt>
              <dd className="font-medium">
                {formatCurrency(values.firstEntryFee)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Subsequent</dt>
              <dd className="font-medium">
                {formatCurrency(values.subsequentEntryFee)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">NFC</dt>
              <dd className="font-medium">
                {formatCurrency(values.nfcEntryFee)}
              </dd>
            </div>
          </dl>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Classes ({selectedClasses.length})
          </h3>
          {selectedClasses.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {selectedClasses.map((cd) => (
                <Badge key={cd.id} variant="secondary">
                  {cd.name}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No classes selected — you can add them after creating the show.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
