'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
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
  User,
  Lock,
  Sparkles,
  CreditCard,
  Mail,
  UserPlus,
} from 'lucide-react';
import Link from 'next/link';
import { format, addDays } from 'date-fns';
import { trpc } from '@/lib/trpc';
import { poundsToPence, formatCurrency } from '@/lib/date-utils';
import { CLASS_TEMPLATES } from '@/lib/class-templates';
import { AllBreedClassSetup, type AllBreedClassData } from '@/components/shows/all-breed-class-setup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { PostcodeLookup, formatAddress } from '@/components/postcode-lookup';
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
  { value: 'general', label: 'General (All-Breed)' },
  { value: 'single_breed', label: 'Single Breed' },
] as const;

const classSexArrangements = [
  { value: 'separate_sex', label: 'Separate Dog & Bitch' },
  { value: 'combined_sex', label: 'Combined Dog & Bitch' },
] as const;

const showTimes = Array.from({ length: 23 }, (_, i) => {
  const hour = 7 + Math.floor(i / 2);
  const min = i % 2 === 0 ? '00' : '30';
  const value = `${String(hour).padStart(2, '0')}:${min}`;
  const label = `${hour}:${min}`;
  return { value, label };
});

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
  ], { required_error: 'Please select a show type' }),
  showScope: z.enum(['single_breed', 'general'], { required_error: 'Please select a show scope' }),
  classSexArrangement: z.enum(['separate_sex', 'combined_sex']).optional(),
  secretaryUserId: z.string().uuid().optional(),
  secretaryEmail: z.string().email('Enter a valid email').optional().or(z.literal('')),
  secretaryName: z.string().optional(),
  secretaryPhone: z.string().optional(),
  showOpenTime: z.string().optional(),
  acceptsPostalEntries: z.boolean().default(false),
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

  // Step 3 - Entry Fees (in pounds, converted to pence on submit)
  firstEntryFee: z.coerce.number().min(0, 'Fee must be 0 or more').default(0),
  subsequentEntryFee: z.coerce.number().min(0).default(0),
  nfcEntryFee: z.coerce.number().min(0).default(0),

  // Step 4 - Classes
  selectedClassIds: z.array(z.string().uuid()).default([]),
}).refine(
  (data) => {
    if (data.entriesOpenDate && data.entryCloseDate) {
      return new Date(data.entryCloseDate) >= new Date(data.entriesOpenDate);
    }
    return true;
  },
  { message: 'Entry close date must be on or after the entries open date', path: ['entryCloseDate'] }
).refine(
  (data) => {
    if (data.entriesOpenDate && data.postalCloseDate) {
      return new Date(data.postalCloseDate) >= new Date(data.entriesOpenDate);
    }
    return true;
  },
  { message: 'Postal close date must be on or after the entries open date', path: ['postalCloseDate'] }
).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return new Date(data.endDate) >= new Date(data.startDate);
    }
    return true;
  },
  { message: 'End date must be on or after the start date', path: ['endDate'] }
).refine(
  (data) => {
    if (data.entryCloseDate && data.startDate) {
      return new Date(data.startDate) >= new Date(data.entryCloseDate);
    }
    return true;
  },
  { message: 'Entry close date must be before the show start date', path: ['entryCloseDate'] }
);

type CreateShowValues = z.infer<typeof createShowSchema>;

const STEPS = [
  'Basic Info',
  'Venue',
  'Entry Fees',
  'Classes',
  'Review',
] as const;

/** Parse a YYYY-MM-DD string as local midnight (not UTC). */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDateDisplay(dateStr: string) {
  if (!dateStr) return '';
  return format(parseLocalDate(dateStr), 'd MMMM yyyy');
}


export default function NewShowPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [step, setStep] = useState(0);
  const [createVenue, setCreateVenue] = useState(false);
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [allBreedData, setAllBreedData] = useState<AllBreedClassData>({
    selectedBreedIds: [],
    selectedTemplateId: null,
    classDefinitionIds: [],
    breedClassOverrides: {},
  });

  const form = useForm<CreateShowValues>({
    resolver: zodResolver(createShowSchema) as never,
    defaultValues: {
      name: '',
      showType: '' as never,
      showScope: '' as never,
      classSexArrangement: undefined,
      secretaryUserId: undefined,
      secretaryEmail: '',
      secretaryName: '',
      secretaryPhone: '',
      showOpenTime: '',
      acceptsPostalEntries: false,
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
      firstEntryFee: '' as unknown as number,
      subsequentEntryFee: '' as unknown as number,
      nfcEntryFee: '' as unknown as number,
      selectedClassIds: [],
    },
  });

  const { data: dashboardData } = trpc.secretary.getDashboard.useQuery();
  const { data: venues } = trpc.secretary.listVenues.useQuery();
  const { data: classDefinitions } = trpc.secretary.listClassDefinitions.useQuery();

  const utils = trpc.useUtils();
  const createVenueMutation = trpc.secretary.createVenue.useMutation();
  const createShowMutation = trpc.shows.create.useMutation();
  const inviteMutation = trpc.invitations.send.useMutation();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');

  const organisations = dashboardData?.organisations ?? [];

  // When all-breed data changes with a template selection, auto-set sex arrangement
  const handleAllBreedDataChange = useCallback((data: AllBreedClassData) => {
    setAllBreedData(data);
    if (data.selectedTemplateId) {
      const template = CLASS_TEMPLATES.find((t) => t.id === data.selectedTemplateId);
      if (template?.splitBySex && !form.getValues('classSexArrangement')) {
        form.setValue('classSexArrangement', 'separate_sex');
      }
    }
  }, [form]);

  // Auto-select the organisation if there's only one
  const currentOrgId = form.watch('organisationId');
  if (organisations.length === 1 && !currentOrgId) {
    form.setValue('organisationId', organisations[0].id);
  }

  // Fetch org members for the secretary picker
  const { data: orgMembersData } = trpc.secretary.orgMembers.useQuery(
    { organisationId: currentOrgId },
    { enabled: !!currentOrgId }
  );

  // Always include current user as a fallback so the dropdown is never empty
  const orgMembers = useMemo(() => {
    if (orgMembersData?.length) return orgMembersData;
    if (session?.user?.id) {
      return [{ id: session.user.id, name: session.user.name ?? null, email: session.user.email ?? null, phone: null, address: null, postcode: null }];
    }
    return [];
  }, [orgMembersData, session?.user]);

  // Populate secretary contact fields from a member record
  function applySecretaryMember(member: { name?: string | null; email?: string | null; phone?: string | null }) {
    form.setValue('secretaryName', member.name ?? '');
    form.setValue('secretaryEmail', member.email ?? '');
    form.setValue('secretaryPhone', member.phone ?? '');
  }

  // Auto-select "myself" as secretary when session/members load
  const sessionUserId = session?.user?.id;
  useEffect(() => {
    if (sessionUserId && !form.getValues('secretaryUserId')) {
      form.setValue('secretaryUserId', sessionUserId);
      const me = orgMembers?.find((m) => m.id === sessionUserId);
      if (me) {
        applySecretaryMember(me);
      } else if (session?.user) {
        applySecretaryMember(session.user);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUserId, orgMembers]);

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
        classSexArrangement: values.classSexArrangement || undefined,
        secretaryUserId: values.secretaryUserId || undefined,
        secretaryEmail: values.secretaryEmail || undefined,
        secretaryName: values.secretaryName || undefined,
        secretaryPhone: values.secretaryPhone || undefined,
        showOpenTime: values.showOpenTime || undefined,
        organisationId: values.organisationId,
        venueId: venueId || undefined,
        startDate: values.startDate,
        endDate: values.endDate,
        entriesOpenDate: values.entriesOpenDate
          ? parseLocalDate(values.entriesOpenDate).toISOString()
          : undefined,
        entryCloseDate: values.entryCloseDate
          ? parseLocalDate(values.entryCloseDate).toISOString()
          : undefined,
        postalCloseDate: values.postalCloseDate
          ? parseLocalDate(values.postalCloseDate).toISOString()
          : undefined,
        description: values.description || undefined,
        // Single-breed: pass class definition IDs directly
        classDefinitionIds: (values.showScope !== 'general' && values.selectedClassIds.length > 0)
          ? values.selectedClassIds
          : undefined,
        entryFee: Number(values.firstEntryFee) > 0
          ? poundsToPence(Number(values.firstEntryFee))
          : undefined,
        firstEntryFee: Number(values.firstEntryFee) > 0
          ? poundsToPence(Number(values.firstEntryFee))
          : undefined,
        subsequentEntryFee: Number(values.subsequentEntryFee) > 0
          ? poundsToPence(Number(values.subsequentEntryFee))
          : undefined,
        nfcEntryFee: Number(values.nfcEntryFee) > 0
          ? poundsToPence(Number(values.nfcEntryFee))
          : undefined,
        // All-breed: pass breed + class data
        allBreedClassData: (values.showScope === 'general' && allBreedData.selectedBreedIds.length > 0 && allBreedData.classDefinitionIds.length > 0)
          ? {
              breedIds: allBreedData.selectedBreedIds,
              classDefinitionIds: allBreedData.classDefinitionIds,
              splitBySex: !!values.classSexArrangement && values.classSexArrangement === 'separate_sex',
            }
          : undefined,
      });

      // Prefetch the show data so the detail page doesn't 404
      await utils.shows.getById.prefetch({ id: show.id });

      toast.success(
        asDraft ? 'Show saved as draft' : 'Show created successfully'
      );
      router.push(`/secretary/shows/${show.slug ?? show.id}`);
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
  const watchedStartDate = form.watch('startDate');
  const watchedEndDate = form.watch('endDate');
  const watchedAcceptsPostal = form.watch('acceptsPostalEntries');

  // Auto-compute endDate from startDate + showDays
  const [showDays, setShowDays] = useState(1);
  useEffect(() => {
    if (watchedStartDate) {
      // Parse the date string as local date components to avoid timezone issues
      const [y, m, d] = watchedStartDate.split('-').map(Number);
      const start = new Date(y, m - 1, d);
      const end = addDays(start, showDays - 1);
      form.setValue('endDate', format(end, 'yyyy-MM-dd'));
    }
  }, [watchedStartDate, showDays, form]);

  function canProceed(): boolean {
    switch (step) {
      case 0:
        return !!(
          watchedName &&
          watchedShowType &&
          watchedShowScope &&
          currentOrgId &&
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

  // When templates are selected, compute the combined matched classes
  const matchedTemplateClasses = useMemo(() => {
    if (selectedTemplates.length === 0 || !classDefinitions) return [];
    const allClassNames = new Set<string>();
    for (const tid of selectedTemplates) {
      const template = CLASS_TEMPLATES.find((t) => t.id === tid);
      if (template) template.classNames.forEach((n) => allClassNames.add(n));
    }
    return classDefinitions.filter((cd) => allClassNames.has(cd.name));
  }, [selectedTemplates, classDefinitions]);

  function handleSelectTemplate(templateId: string) {
    const isSelected = selectedTemplates.includes(templateId);
    const newTemplates = isSelected
      ? selectedTemplates.filter((id) => id !== templateId)
      : [...selectedTemplates, templateId];
    setSelectedTemplates(newTemplates);

    if (classDefinitions) {
      // Combine class IDs from all selected templates
      const allClassNames = new Set<string>();
      for (const tid of newTemplates) {
        const template = CLASS_TEMPLATES.find((t) => t.id === tid);
        if (template) template.classNames.forEach((n) => allClassNames.add(n));
      }
      const ids = classDefinitions
        .filter((cd) => allClassNames.has(cd.name))
        .map((cd) => cd.id);
      form.setValue('selectedClassIds', ids);

      // Auto-set class sex arrangement if any template uses split by sex
      const anySplitBySex = newTemplates.some((tid) => CLASS_TEMPLATES.find((t) => t.id === tid)?.splitBySex);
      if (anySplitBySex && !form.getValues('classSexArrangement')) {
        form.setValue('classSexArrangement', 'separate_sex');
      }
    }
  }

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold tracking-tight sm:text-xl lg:text-2xl">Create New Show</h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          Set up a new show in {STEPS.length} steps.
        </p>
      </div>

      {/* Step indicator */}
      <nav className="pb-1 -mb-1">
        <div className="flex flex-wrap items-center gap-1">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => i < step && setStep(i)}
            disabled={i > step}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-2.5 py-2.5 text-xs font-medium whitespace-nowrap transition-colors sm:gap-2 sm:px-3 sm:py-2 sm:text-sm',
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
        </div>
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
                      <FormLabel>Show Name <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Spring Championship 2026" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {organisations.length > 1 && (
                  <FormField
                    control={form.control}
                    name="organisationId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Club</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select your club" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {organisations.map((org) => (
                              <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="showType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Show Type <span className="text-destructive">*</span></FormLabel>
                        <Select onValueChange={field.onChange} value={field.value ?? ''}>
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select show type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {showTypes.map((t) => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
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
                        <FormLabel>Show Scope <span className="text-destructive">*</span></FormLabel>
                        <Select onValueChange={field.onChange} value={field.value ?? ''}>
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select show scope" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {showScopes.map((s) => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
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
                  name="classSexArrangement"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Class Structure</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ''}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select class structure" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {classSexArrangements.map((a) => (
                            <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Date, days, and time together */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <DatePickerField control={form.control} name="startDate" label="Show Date *" placeholder="Pick a date" disablePast />
                  <div className="space-y-2">
                    <Label>Number of Days</Label>
                    <Select value={String(showDays)} onValueChange={(v) => setShowDays(Number(v))}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6].map((n) => (
                          <SelectItem key={n} value={String(n)}>{n} {n === 1 ? 'day' : 'days'}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {watchedEndDate && (
                      <p className="text-xs text-muted-foreground">Ends: {format(parseLocalDate(watchedEndDate), 'd MMM yyyy')}</p>
                    )}
                  </div>
                  <FormField
                    control={form.control}
                    name="showOpenTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Show Opens At</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value ?? ''}>
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select time" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {showTimes.map((t) => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Entry dates */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <DatePickerField control={form.control} name="entriesOpenDate" label="Entries Open" placeholder="Optional" />
                  <DatePickerField control={form.control} name="entryCloseDate" label="Entries Close" placeholder="Optional" disableAfter={watchedStartDate ? parseLocalDate(watchedStartDate) : undefined} />
                </div>

                {/* Postal entries toggle */}
                <FormField
                  control={form.control}
                  name="acceptsPostalEntries"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel className="text-sm font-medium">Accept Postal Entries</FormLabel>
                        <p className="text-xs text-muted-foreground">Allow exhibitors to send entries by post</p>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {watchedAcceptsPostal && (
                  <DatePickerField control={form.control} name="postalCloseDate" label="Postal Close Date" placeholder="Pick a date" disableAfter={watchedStartDate ? parseLocalDate(watchedStartDate) : undefined} />
                )}

                {/* Secretary — person picker + contact details */}
                <div className="space-y-4 rounded-lg border p-4">
                  <FormField
                    control={form.control}
                    name="secretaryUserId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Show Secretary</FormLabel>
                        <div className="flex gap-2">
                          <Select
                            onValueChange={(value) => {
                              field.onChange(value);
                              const member = orgMembers?.find((m) => m.id === value);
                              if (member) applySecretaryMember(member);
                            }}
                            value={field.value ?? ''}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select a person" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {orgMembers?.map((member) => (
                                <SelectItem key={member.id} value={member.id}>
                                  <div className="flex items-center gap-2">
                                    <User className="size-3.5 text-muted-foreground" />
                                    {member.name || member.email}
                                    {member.id === session?.user?.id && (
                                      <span className="text-xs text-muted-foreground">(you)</span>
                                    )}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="shrink-0"
                            onClick={() => setInviteOpen(true)}
                            title="Add a new member"
                          >
                            <UserPlus className="size-4" />
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {form.watch('secretaryUserId') && (
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <Label className="text-sm text-muted-foreground">Name</Label>
                        <p className="mt-1 text-sm font-medium">{form.watch('secretaryName') || '—'}</p>
                      </div>
                      <div>
                        <Label className="text-sm text-muted-foreground">Email</Label>
                        <p className="mt-1 text-sm font-medium">{form.watch('secretaryEmail') || '—'}</p>
                      </div>
                      <div>
                        <Label className="text-sm text-muted-foreground">Phone</Label>
                        <p className="mt-1 text-sm font-medium">{form.watch('secretaryPhone') || '—'}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Add member modal */}
                <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Add a Member</DialogTitle>
                      <DialogDescription>
                        Enter their email address. If they already have a Remi account, they'll be added to your club immediately. Otherwise, they'll be notified and asked to sign up.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-2">
                        <Label htmlFor="invite-email">Email address</Label>
                        <div className="flex gap-2">
                          <Input
                            id="invite-email"
                            type="email"
                            placeholder="e.g. colleague@email.com"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                document.getElementById('invite-send-btn')?.click();
                              }
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => { setInviteOpen(false); setInviteEmail(''); }}
                      >
                        Cancel
                      </Button>
                      <Button
                        id="invite-send-btn"
                        type="button"
                        disabled={!inviteEmail || inviteMutation.isPending}
                        onClick={async () => {
                          try {
                            await inviteMutation.mutateAsync({
                              email: inviteEmail,
                              role: 'secretary',
                              organisationId: currentOrgId || undefined,
                            });
                            toast.success('Member added! They\'ve been notified and will appear in the dropdown once they sign up.');
                            setInviteOpen(false);
                            setInviteEmail('');
                            // Refresh org members list
                            utils.secretary.orgMembers.invalidate();
                          } catch (err) {
                            toast.error('Failed to add member. Please try again.');
                          }
                        }}
                      >
                        {inviteMutation.isPending ? (
                          <><Loader2 className="size-4 animate-spin" /> Sending...</>
                        ) : (
                          <><Mail className="size-4" /> Add &amp; Notify</>
                        )}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
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
                    <PostcodeLookup
                      compact
                      onSelect={(result) => {
                        form.setValue('newVenueAddress', formatAddress(result));
                        form.setValue('newVenuePostcode', result.postcode);
                      }}
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
                  Set the entry fees in pounds.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="firstEntryFee"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Entry Fee (£)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          placeholder="e.g. 10.00"
                          {...field}
                          value={field.value === 0 || field.value ? field.value : ''}
                          onChange={(e) => field.onChange(e.target.value === '' ? '' : Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="subsequentEntryFee"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subsequent Entry Fee (£)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          placeholder="e.g. 8.00"
                          {...field}
                          value={field.value === 0 || field.value ? field.value : ''}
                          onChange={(e) => field.onChange(e.target.value === '' ? '' : Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="nfcEntryFee"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>NFC Entry Fee (£)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          placeholder="e.g. 5.00"
                          {...field}
                          value={field.value === 0 || field.value ? field.value : ''}
                          onChange={(e) => field.onChange(e.target.value === '' ? '' : Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          )}

          {/* Step 4: Classes */}
          {step === 3 && watchedShowScope === 'general' && (
            <Card>
              <CardHeader>
                <CardTitle>All-Breed Classes</CardTitle>
                <CardDescription>
                  Select which breeds to include and choose a class template.
                  The template will apply uniformly to all selected breeds.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AllBreedClassSetup
                  value={allBreedData}
                  onChange={handleAllBreedDataChange}
                  classDefinitions={classDefinitions ?? []}
                />
              </CardContent>
            </Card>
          )}

          {step === 3 && watchedShowScope !== 'general' && (
            <Card>
              <CardHeader>
                <CardTitle>Classes</CardTitle>
                <CardDescription>
                  Choose a class template to get started quickly. You can add or
                  remove individual classes after creating the show.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {CLASS_TEMPLATES.map((t) => {
                    const isActive = selectedTemplates.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleSelectTemplate(t.id)}
                        className={cn(
                          'rounded-lg border p-3 text-left transition-colors relative',
                          isActive
                            ? 'border-primary bg-primary/5'
                            : 'hover:bg-muted/50'
                        )}
                      >
                        {isActive && (
                          <div className="absolute top-2 right-2 size-5 rounded-full bg-primary flex items-center justify-center">
                            <Check className="size-3 text-primary-foreground" />
                          </div>
                        )}
                        <p className="font-medium text-sm">{t.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t.description}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {t.classNames.length} classes
                          {t.splitBySex ? ' · Split by sex' : ''}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {selectedTemplates.length > 0 && matchedTemplateClasses.length > 0 && (
                  <div className="rounded-lg border p-3 space-y-2">
                    <p className="text-sm font-medium">
                      Classes included ({form.watch('selectedClassIds').length})
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {matchedTemplateClasses.map((cd) => {
                        const isSelected = form.watch('selectedClassIds').includes(cd.id);
                        return (
                          <button
                            key={cd.id}
                            type="button"
                            onClick={() => {
                              const current = form.getValues('selectedClassIds');
                              form.setValue(
                                'selectedClassIds',
                                isSelected
                                  ? current.filter((id) => id !== cd.id)
                                  : [...current, cd.id]
                              );
                            }}
                            className={cn(
                              'rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                              isSelected
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-muted/50 text-muted-foreground border-transparent'
                            )}
                          >
                            {cd.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {selectedTemplates.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Select a template above, or skip this step — you can add classes
                    after creating the show.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 5: Review */}
          {step === 4 && <ReviewStep form={form} organisations={organisations} venues={venues ?? []} classDefinitions={classDefinitions ?? []} createVenue={createVenue} classSexArrangements={classSexArrangements} allBreedData={allBreedData} />}

          {/* Navigation */}
          <div className="mt-6 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-[2.75rem] sm:min-h-0"
              onClick={() => (step === 0 ? router.back() : setStep(step - 1))}
            >
              <ArrowLeft className="size-4" />
              {step === 0 ? 'Cancel' : 'Back'}
            </Button>

            <div className="flex flex-wrap gap-2">
              {step === 4 ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-[2.75rem] text-xs sm:min-h-0 sm:text-sm"
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
                    className="min-h-[2.75rem] text-xs sm:min-h-0 sm:text-sm"
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
                  className="min-h-[2.75rem] sm:min-h-0"
                  onClick={async () => {
                    if (step === 0) {
                      const valid = await form.trigger(['name', 'showType', 'showScope', 'startDate']);
                      if (!valid) return;
                    }
                    if (canProceed()) setStep(step + 1);
                  }}
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

function DatePickerField({
  control,
  name,
  label,
  placeholder,
  disablePast,
  disableAfter,
}: {
  control: ReturnType<typeof useForm<CreateShowValues>>['control'];
  name: 'startDate' | 'entriesOpenDate' | 'entryCloseDate' | 'postalCloseDate';
  label: string;
  placeholder: string;
  disablePast?: boolean;
  /** Disable dates after this date (inclusive — the date itself IS selectable) */
  disableAfter?: Date;
}) {
  const [open, setOpen] = useState(false);
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Popover open={open} onOpenChange={setOpen}>
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
                    ? format(parseLocalDate(field.value), 'd MMM yyyy')
                    : placeholder}
                </Button>
              </FormControl>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={
                  field.value ? parseLocalDate(field.value) : undefined
                }
                onSelect={(date) => {
                  field.onChange(
                    date ? format(date, 'yyyy-MM-dd') : ''
                  );
                  setOpen(false);
                }}
                disabled={(date) => {
                  if (disablePast && date < new Date()) return true;
                  if (disableAfter && date > disableAfter) return true;
                  return false;
                }}
              />
            </PopoverContent>
          </Popover>
          <FormMessage />
        </FormItem>
      )}
    />
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
  classSexArrangements,
  allBreedData,
}: {
  form: ReturnType<typeof useForm<CreateShowValues>>;
  organisations: { id: string; name: string }[];
  venues: { id: string; name: string; postcode: string | null }[];
  classDefinitions: { id: string; name: string }[];
  createVenue: boolean;
  classSexArrangements: readonly { value: string; label: string }[];
  allBreedData: AllBreedClassData;
}) {
  const values = form.getValues();
  const org = organisations.find((o) => o.id === values.organisationId);
  const venue = venues.find((v) => v.id === values.venueId);
  const selectedClasses = classDefinitions.filter((cd) =>
    values.selectedClassIds.includes(cd.id)
  );
  const allBreedClasses = classDefinitions.filter((cd) =>
    allBreedData.classDefinitionIds.includes(cd.id)
  );
  const showType = showTypes.find((t) => t.value === values.showType);
  const showScope = showScopes.find((s) => s.value === values.showScope);
  const classSexArrangement = classSexArrangements.find((a) => a.value === values.classSexArrangement);
  const isAllBreed = values.showScope === 'general';

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
            {classSexArrangement && (
              <div>
                <dt className="text-sm text-muted-foreground">Class Structure</dt>
                <dd className="font-medium">{classSexArrangement.label}</dd>
              </div>
            )}
            {values.secretaryEmail && (
              <div>
                <dt className="text-sm text-muted-foreground">Secretary Email</dt>
                <dd className="font-medium">{values.secretaryEmail}</dd>
              </div>
            )}
            {values.secretaryName && (
              <div>
                <dt className="text-sm text-muted-foreground">Secretary Name</dt>
                <dd className="font-medium">{values.secretaryName}</dd>
              </div>
            )}
            {values.secretaryPhone && (
              <div>
                <dt className="text-sm text-muted-foreground">Secretary Phone</dt>
                <dd className="font-medium">{values.secretaryPhone}</dd>
              </div>
            )}
            {values.showOpenTime && (
              <div>
                <dt className="text-sm text-muted-foreground">Show Opens At</dt>
                <dd className="font-medium">{values.showOpenTime}</dd>
              </div>
            )}
            <div>
              <dt className="text-sm text-muted-foreground">Club</dt>
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
                £{Number(values.firstEntryFee).toFixed(2)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Subsequent</dt>
              <dd className="font-medium">
                £{Number(values.subsequentEntryFee).toFixed(2)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">NFC</dt>
              <dd className="font-medium">
                £{Number(values.nfcEntryFee).toFixed(2)}
              </dd>
            </div>
          </dl>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Classes
          </h3>
          {isAllBreed ? (
            allBreedData.selectedBreedIds.length > 0 && allBreedClasses.length > 0 ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border p-2.5 text-center">
                    <p className="text-lg font-bold">{allBreedData.selectedBreedIds.length}</p>
                    <p className="text-xs text-muted-foreground">Breeds</p>
                  </div>
                  <div className="rounded-lg border p-2.5 text-center">
                    <p className="text-lg font-bold">{allBreedClasses.length}</p>
                    <p className="text-xs text-muted-foreground">Classes/breed</p>
                  </div>
                  <div className="rounded-lg border p-2.5 text-center">
                    <p className="text-lg font-bold">
                      {allBreedData.selectedBreedIds.length * allBreedClasses.length}
                    </p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {allBreedClasses.map((cd) => (
                    <Badge key={cd.id} variant="secondary">
                      {cd.name}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No breeds or classes selected — you can add them after creating the show.
              </p>
            )
          ) : (
            selectedClasses.length > 0 ? (
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
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}
