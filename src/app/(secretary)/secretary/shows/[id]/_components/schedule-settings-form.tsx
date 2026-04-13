'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Check,
  ChevronsUpDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Eye,
  Heart,
  Info,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Save,
  Shield,
  Stethoscope,
  Trophy,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
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
import type { ScheduleData } from '@/server/db/schema/shows';
import { RKC_STATEMENTS, RKC_STATEMENT_CATEGORIES } from '@/lib/rkc-statements';
import { SHOW_TIMES } from '@/lib/show-times';

interface OfficerWithGuarantor {
  name: string;
  position: string;
  isGuarantor: boolean;
  address?: string;
}

interface ScheduleSettingsFormProps {
  showId: string;
  onSaved?: () => void;
}

// ── Section type ─────────────────────────────────────
type SectionId = 'showday' | 'people' | 'awards' | 'venue' | 'regulations';

const SECTIONS: { id: SectionId; label: string; icon: React.ElementType }[] = [
  { id: 'showday', label: 'Show Day', icon: Clock },
  { id: 'people', label: 'People', icon: Users },
  { id: 'awards', label: 'Awards', icon: Trophy },
  { id: 'venue', label: 'Venue & Info', icon: MapPin },
  { id: 'regulations', label: 'Regulations', icon: Shield },
];

const OFFICER_POSITIONS = [
  'President', 'Vice President', 'Chairman', 'Vice Chairman',
  'Honorary Secretary', 'Honorary Treasurer', 'Committee Member',
  'Show Manager', 'Show Secretary', 'Assistant Secretary',
  'Chief Steward', 'Ring Steward', 'Veterinary Surgeon',
  'Health & Safety Officer', 'First Aid Officer', 'Trophy Steward', 'Field Officer',
];

const COUNTRY_LABELS: Record<string, string> = {
  england: 'England',
  wales: 'Wales',
  scotland: 'Scotland',
  northern_ireland: 'Northern Ireland',
};

export function ScheduleSettingsForm({ showId, onSaved }: ScheduleSettingsFormProps) {
  const { data: existing, isLoading, isError: existingError } =
    trpc.secretary.getScheduleData.useQuery({ showId }, { retry: 2 });
  const { data: showData } = trpc.shows.getById.useQuery({ id: showId });

  // Derive existing schedule data from showData as fallback if getScheduleData fails
  const effectiveExisting = existing ?? (existingError ? (showData?.scheduleData as typeof existing ?? null) : undefined);

  const { data: previousData } = trpc.secretary.getPreviousScheduleData.useQuery(
    { showId },
    { enabled: effectiveExisting === null }  // Only fetch if this show definitively has no schedule data
  );
  const updateMutation = trpc.secretary.updateScheduleData.useMutation();
  const utils = trpc.useUtils();

  // Club people for roster picker
  const orgId = showData?.organisationId;
  const { data: clubPeople } = trpc.secretary.listOrgPeople.useQuery(
    { organisationId: orgId ?? '' },
    { enabled: !!orgId }
  );
  const [clubPickerOpen, setClubPickerOpen] = useState(false);

  // Which section is currently being edited (null = all summaries)
  const [editingSection, setEditingSection] = useState<SectionId | null>(null);

  // ── Form state ──
  const [country, setCountry] = useState<string>('england');
  const [publicAdmission, setPublicAdmission] = useState(false);
  const [wetWeather, setWetWeather] = useState(false);
  const [isBenched, setIsBenched] = useState(false);
  const [benchingRemovalTime, setBenchingRemovalTime] = useState('');
  const [acceptsNfc, setAcceptsNfc] = useState(true);
  const [judgedOnGroupSystem, setJudgedOnGroupSystem] = useState(false);
  const [latestArrivalTime, setLatestArrivalTime] = useState('');
  const [showOpenTime, setShowOpenTime] = useState('');
  const [judgingStartTime, setJudgingStartTime] = useState('');
  const [onCallVet, setOnCallVet] = useState('');
  const [what3words, setWhat3words] = useState('');
  const [showManager, setShowManager] = useState('');
  const [officers, setOfficers] = useState<OfficerWithGuarantor[]>([]);
  const [awardsDescription, setAwardsDescription] = useState('');
  const [prizeMoney, setPrizeMoney] = useState('');
  const [directions, setDirections] = useState('');
  const [catering, setCatering] = useState('');
  const [futureShowDates, setFutureShowDates] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [welcomeNote, setWelcomeNote] = useState('');
  const [outsideAttraction, setOutsideAttraction] = useState(false);
  const [customStatements, setCustomStatements] = useState<string[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [appliedDefaults, setAppliedDefaults] = useState(false);

  // Load existing data OR smart defaults from previous show
  useEffect(() => {
    if (hasLoaded) return;
    if (!showData) return;
    // Wait for existing to resolve (undefined = still loading, null = no data)
    if (effectiveExisting === undefined) return;
    // If no saved data, wait for previous show defaults to load before proceeding
    if (effectiveExisting === null && previousData === undefined) return;

    // Source: this show's saved data, or previous show as defaults
    const sd = (effectiveExisting ?? previousData?.scheduleData) as ScheduleData | null | undefined;

    setCountry(sd?.country ?? 'england');
    setPublicAdmission(sd?.publicAdmission ?? false);
    setWetWeather(sd?.wetWeatherAccommodation ?? false);
    setIsBenched(sd?.isBenched ?? false);
    setBenchingRemovalTime(sd?.benchingRemovalTime ?? '');
    setAcceptsNfc(sd?.acceptsNfc ?? true);
    setJudgedOnGroupSystem(sd?.judgedOnGroupSystem ?? false);
    setLatestArrivalTime(sd?.latestArrivalTime ?? '');
    // Show-level fields: always prefer current show's data, fall back to previous show
    setShowOpenTime(showData?.showOpenTime ?? previousData?.showOpenTime ?? '');
    setJudgingStartTime(showData?.startTime ?? previousData?.startTime ?? '');
    setOnCallVet(showData?.onCallVet ?? previousData?.onCallVet ?? '');
    setWhat3words(sd?.what3words ?? '');
    setShowManager(sd?.showManager ?? '');

    const existingOfficers = sd?.officers ?? [];
    const existingGuarantors = sd?.guarantors ?? [];
    const guarantorNames = new Set(existingGuarantors.map((g) => g.name));
    const guarantorAddresses = new Map(
      existingGuarantors.map((g) => [g.name, g.address ?? ''])
    );
    setOfficers(
      existingOfficers.map((o) => ({
        name: o.name,
        position: o.position,
        isGuarantor: guarantorNames.has(o.name),
        address: guarantorAddresses.get(o.name) ?? '',
      }))
    );

    setAwardsDescription(sd?.awardsDescription ?? '');
    setPrizeMoney(sd?.prizeMoney ?? '');
    setDirections(sd?.directions ?? '');
    setCatering(sd?.catering ?? '');
    setFutureShowDates(sd?.futureShowDates ?? '');
    setAdditionalNotes(sd?.additionalNotes ?? '');
    setWelcomeNote(sd?.welcomeNote ?? '');
    setOutsideAttraction(sd?.outsideAttraction ?? false);
    setCustomStatements(sd?.customStatements ?? []);

    if (!effectiveExisting && previousData) {
      setAppliedDefaults(true);
    }

    setHasLoaded(true);
  }, [effectiveExisting, showData, previousData, hasLoaded]);

  // ── Autosave ──
  // Two-pronged save:
  //   1. Debounced tRPC mutation while the form is mounted — gives us
  //      the Saving…/Saved status indicator and proper React Query
  //      cache invalidation on success.
  //   2. navigator.sendBeacon() to a dedicated REST endpoint on
  //      unmount — guaranteed delivery even when navigating away,
  //      because beacons survive page tear-down whereas tRPC's
  //      AbortController-backed fetch gets cancelled when the
  //      mutation observer is destroyed.
  // The debounce is short (350ms) so the loss window in the rare
  // case where neither path fires (network drop, browser crash) is
  // very small.
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<Date | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
  const latestPayloadRef = useRef<{
    showOpenTime: string | undefined;
    judgingStartTime: string | undefined;
    onCallVet: string | undefined;
    scheduleData: ScheduleData;
  } | null>(null);

  useEffect(() => {
    if (!hasLoaded) return;
    const data: ScheduleData = {
      ...effectiveExisting,
      country: country as ScheduleData['country'],
      publicAdmission,
      wetWeatherAccommodation: wetWeather,
      isBenched,
      benchingRemovalTime: benchingRemovalTime || undefined,
      acceptsNfc,
      judgedOnGroupSystem,
      latestArrivalTime: latestArrivalTime || undefined,
      showManager: showManager || undefined,
      officers: officers
        .filter((o) => o.name)
        .map((o) => ({ name: o.name, position: o.position })),
      guarantors: officers
        .filter((o) => o.name && o.isGuarantor)
        .map((o) => ({ name: o.name, address: o.address || undefined })),
      awardsDescription: awardsDescription || undefined,
      prizeMoney: prizeMoney || undefined,
      what3words: what3words || undefined,
      directions: directions || undefined,
      catering: catering || undefined,
      futureShowDates: futureShowDates || undefined,
      additionalNotes: additionalNotes || undefined,
      welcomeNote: welcomeNote || undefined,
      outsideAttraction: outsideAttraction || undefined,
      customStatements: customStatements.filter((s) => s.trim()).length > 0
        ? customStatements.filter((s) => s.trim())
        : undefined,
    };
    const payload = {
      showOpenTime: showOpenTime || undefined,
      judgingStartTime: judgingStartTime || undefined,
      onCallVet: onCallVet || undefined,
      scheduleData: data,
    };
    // Always update the ref so the unmount beacon has the latest
    // snapshot to send, regardless of whether the debounce has fired.
    latestPayloadRef.current = payload;

    setAutoSaveStatus('pending');
    const timer = setTimeout(() => {
      setAutoSaveStatus('saving');
      updateMutation.mutateAsync({ showId, ...payload })
        .then(() => {
          setLastAutoSavedAt(new Date());
          setAutoSaveStatus('saved');
        })
        .catch(() => {
          setAutoSaveStatus('error');
        });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hasLoaded, country, publicAdmission, wetWeather, isBenched, benchingRemovalTime,
    acceptsNfc, judgedOnGroupSystem, latestArrivalTime, showOpenTime, judgingStartTime,
    onCallVet, what3words, showManager, officers, awardsDescription, prizeMoney,
    directions, catering, futureShowDates, additionalNotes, welcomeNote,
    outsideAttraction, customStatements,
  ]);

  // Flush the latest snapshot via navigator.sendBeacon when the form
  // unmounts (e.g. user clicks through to Sponsors). Beacons are
  // delivered by the browser even during navigation tear-down — they
  // bypass the AbortController abort that kills our normal tRPC
  // fetch when the React Query mutation observer is destroyed.
  useEffect(() => {
    return () => {
      const payload = latestPayloadRef.current;
      if (!payload) return;
      if (typeof navigator === 'undefined' || !navigator.sendBeacon) return;
      try {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        navigator.sendBeacon(`/api/schedule-autosave/${showId}`, blob);
      } catch {
        // Beacon is best-effort; if it fails the user has already
        // navigated and we can't show anything anyway.
      }
    };
  }, [showId]);

  // ── Derived counts ──
  const officerCount = officers.filter((o) => o.name).length;
  const guarantorCount = officers.filter((o) => o.isGuarantor).length;

  // ── Section completion checks ──
  const hasBeenSaved = !!effectiveExisting;
  const sectionStatus = useMemo(() => {
    if (!hasBeenSaved) {
      // Nothing saved yet — nothing is complete
      return { showday: false, people: false, awards: false, venue: false, regulations: false };
    }
    const showday = !!(showOpenTime && judgingStartTime);
    const people = !!(showManager && officerCount > 0);
    const awards = !!awardsDescription;
    const venue = !!(directions || what3words || catering);
    const regulations = !!country;
    return { showday, people, awards, venue, regulations };
  }, [hasBeenSaved, showOpenTime, judgingStartTime, showManager, officerCount, awardsDescription, directions, what3words, catering, country]);

  async function handleSave() {
    if (!showOpenTime) {
      toast.error('Show opens at time is required');
      setEditingSection('showday');
      return;
    }
    if (!judgingStartTime) {
      toast.error('Judging commences time is required');
      setEditingSection('showday');
      return;
    }

    const data: ScheduleData = {
      ...effectiveExisting,
      country: country as ScheduleData['country'],
      publicAdmission,
      wetWeatherAccommodation: wetWeather,
      isBenched,
      benchingRemovalTime: benchingRemovalTime || undefined,
      acceptsNfc,
      judgedOnGroupSystem,
      latestArrivalTime: latestArrivalTime || undefined,
      showManager: showManager || undefined,
      officers: officers
        .filter((o) => o.name)
        .map((o) => ({ name: o.name, position: o.position })),
      guarantors: officers
        .filter((o) => o.name && o.isGuarantor)
        .map((o) => ({ name: o.name, address: o.address || undefined })),
      awardsDescription: awardsDescription || undefined,
      prizeMoney: prizeMoney || undefined,
      what3words: what3words || undefined,
      directions: directions || undefined,
      catering: catering || undefined,
      futureShowDates: futureShowDates || undefined,
      additionalNotes: additionalNotes || undefined,
      welcomeNote: welcomeNote || undefined,
      outsideAttraction: outsideAttraction || undefined,
      customStatements: customStatements.filter((s) => s.trim()).length > 0
        ? customStatements.filter((s) => s.trim())
        : undefined,
    };

    try {
      await updateMutation.mutateAsync({
        showId,
        showOpenTime: showOpenTime || undefined,
        judgingStartTime: judgingStartTime || undefined,
        onCallVet: onCallVet || undefined,
        scheduleData: data,
      });
      await Promise.all([
        utils.secretary.getScheduleData.invalidate({ showId }),
        utils.shows.getById.invalidate({ id: showId }),
        orgId ? utils.secretary.listOrgPeople.invalidate({ organisationId: orgId }) : Promise.resolve(),
      ]);
      toast.success('Schedule settings saved');
      setEditingSection(null);
      onSaved?.();
    } catch {
      toast.error('Failed to save schedule settings');
    }
  }

  // ── Officer helpers ──
  function addOfficer() {
    setOfficers([...officers, { name: '', position: '', isGuarantor: false, address: '' }]);
  }
  function removeOfficer(idx: number) {
    setOfficers(officers.filter((_, i) => i !== idx));
  }
  function updateOfficer(idx: number, field: keyof OfficerWithGuarantor, value: string | boolean) {
    setOfficers(officers.map((o, i) => (i === idx ? { ...o, [field]: value } : o)));
  }
  function addFromClub(person: NonNullable<typeof clubPeople>[number]) {
    setOfficers([
      ...officers,
      {
        name: person.name,
        position: person.position ?? '',
        isGuarantor: person.isGuarantor,
        address: person.address ?? '',
      },
    ]);
    setClubPickerOpen(false);
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-12 text-muted-foreground justify-center">
        <Loader2 className="size-4 animate-spin" />
        Loading schedule settings...
      </div>
    );
  }

  // Derived counts — used below and passed to child components
  // (defined earlier, near sectionStatus which depends on officerCount)
  const requiredGuarantors = showData?.showType === 'championship' ? 6 : 3;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Schedule Settings</h2>
          <p className="text-sm text-muted-foreground">
            Configure your show schedule PDF.
            <span className="hidden sm:inline"> Mandatory RKC statements are auto-included.</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AutoSaveIndicator status={autoSaveStatus} lastAutoSavedAt={lastAutoSavedAt} />
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/schedule/${showId}`} target="_blank" rel="noopener noreferrer">
              <Eye className="size-4" />
              Preview PDF
            </a>
          </Button>
        </div>
      </div>

      {/* Smart defaults notice */}
      {appliedDefaults && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2.5 text-sm dark:border-blue-800 dark:bg-blue-950/20">
          <Info className="mt-0.5 size-4 shrink-0 text-blue-600 dark:text-blue-400" />
          <p className="text-blue-800 dark:text-blue-300">
            Pre-filled from your last show. Review each section and save when ready.
          </p>
        </div>
      )}

      {/* Sections */}
      <div className="space-y-2">
        {SECTIONS.map((section) => {
          const isEditing = editingSection === section.id;
          const isComplete = sectionStatus[section.id];
          const Icon = section.icon;

          return (
            <div key={section.id} className="rounded-xl border bg-card">
              {/* Section header — always visible */}
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/50"
                onClick={() => setEditingSection(isEditing ? null : section.id)}
              >
                <div className={cn(
                  'flex size-8 items-center justify-center rounded-full',
                  isComplete && !isEditing
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : 'bg-muted text-muted-foreground',
                )}>
                  {isComplete && !isEditing ? (
                    <Check className="size-4" />
                  ) : (
                    <Icon className="size-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{section.label}</p>
                  {!isEditing && (
                    <SectionSummary
                      section={section.id}
                      showOpenTime={showOpenTime}
                      judgingStartTime={judgingStartTime}
                      latestArrivalTime={latestArrivalTime}
                      onCallVet={onCallVet}
                      showManager={showManager}
                      officers={officers}
                      guarantorCount={guarantorCount}
                      requiredGuarantors={requiredGuarantors}
                      awardsDescription={awardsDescription}
                      prizeMoney={prizeMoney}
                      directions={directions}
                      what3words={what3words}
                      catering={catering}
                      country={country}
                      acceptsNfc={acceptsNfc}
                      isBenched={isBenched}
                      wetWeather={wetWeather}
                    />
                  )}
                </div>
                {isEditing ? (
                  <Badge variant="secondary" className="shrink-0 text-xs">Editing</Badge>
                ) : (
                  <Pencil className="size-3.5 shrink-0 text-muted-foreground" />
                )}
              </button>

              {/* Section content — only when editing */}
              {isEditing && (
                <div className="border-t px-4 pb-4 pt-4">
                  {section.id === 'showday' && (
                    <ShowDaySection
                      showOpenTime={showOpenTime} setShowOpenTime={setShowOpenTime}
                      latestArrivalTime={latestArrivalTime} setLatestArrivalTime={setLatestArrivalTime}
                      judgingStartTime={judgingStartTime} setJudgingStartTime={setJudgingStartTime}
                      onCallVet={onCallVet} setOnCallVet={setOnCallVet}
                    />
                  )}
                  {section.id === 'people' && (
                    <PeopleSection
                      showManager={showManager} setShowManager={setShowManager}
                      officers={officers}
                      addOfficer={addOfficer}
                      removeOfficer={removeOfficer}
                      updateOfficer={updateOfficer}
                      clubPeople={clubPeople ?? null}
                      clubPickerOpen={clubPickerOpen}
                      setClubPickerOpen={setClubPickerOpen}
                      addFromClub={addFromClub}
                      guarantorCount={guarantorCount}
                      requiredGuarantors={requiredGuarantors}
                      showType={showData?.showType ?? 'open'}
                    />
                  )}
                  {section.id === 'awards' && (
                    <AwardsSection
                      awardsDescription={awardsDescription} setAwardsDescription={setAwardsDescription}
                      prizeMoney={prizeMoney} setPrizeMoney={setPrizeMoney}
                      showId={showId}
                    />
                  )}
                  {section.id === 'venue' && (
                    <VenueSection
                      directions={directions} setDirections={setDirections}
                      what3words={what3words} setWhat3words={setWhat3words}
                      catering={catering} setCatering={setCatering}
                      futureShowDates={futureShowDates} setFutureShowDates={setFutureShowDates}
                      additionalNotes={additionalNotes} setAdditionalNotes={setAdditionalNotes}
                      outsideAttraction={outsideAttraction} setOutsideAttraction={setOutsideAttraction}
                    />
                  )}
                  {section.id === 'regulations' && (
                    <RegulationsSection
                      country={country} setCountry={setCountry}
                      publicAdmission={publicAdmission} setPublicAdmission={setPublicAdmission}
                      wetWeather={wetWeather} setWetWeather={setWetWeather}
                      isBenched={isBenched} setIsBenched={setIsBenched}
                      benchingRemovalTime={benchingRemovalTime} setBenchingRemovalTime={setBenchingRemovalTime}
                      acceptsNfc={acceptsNfc} setAcceptsNfc={setAcceptsNfc}
                      judgedOnGroupSystem={judgedOnGroupSystem} setJudgedOnGroupSystem={setJudgedOnGroupSystem}
                      customStatements={customStatements} setCustomStatements={setCustomStatements}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Save bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end pb-4">
        {lastAutoSavedAt && (
          <p className="text-xs text-muted-foreground sm:mr-auto">
            Auto-saved at {lastAutoSavedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
        <Button variant="outline" asChild className="w-full sm:w-auto min-h-[2.75rem]">
          <a href={`/api/schedule/${showId}`} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-4" />
            Open Schedule PDF
          </a>
        </Button>
        <Button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="w-full sm:w-auto min-h-[2.75rem]"
        >
          {updateMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Save Settings
        </Button>
      </div>
    </div>
  );
}

// ── Section Summaries ────────────────────────────────

function SectionSummary({
  section, showOpenTime, judgingStartTime, latestArrivalTime, onCallVet,
  showManager, officers, guarantorCount, requiredGuarantors,
  awardsDescription, prizeMoney, directions, what3words, catering,
  country, acceptsNfc, isBenched, wetWeather,
}: {
  section: SectionId;
  showOpenTime: string; judgingStartTime: string; latestArrivalTime: string; onCallVet: string;
  showManager: string; officers: OfficerWithGuarantor[]; guarantorCount: number; requiredGuarantors: number;
  awardsDescription: string; prizeMoney: string;
  directions: string; what3words: string; catering: string;
  country: string; acceptsNfc: boolean; isBenched: boolean; wetWeather: boolean;
}) {
  switch (section) {
    case 'showday': {
      const parts: string[] = [];
      if (showOpenTime) parts.push(`Opens ${showOpenTime}`);
      if (judgingStartTime) parts.push(`Judging ${judgingStartTime}`);
      if (onCallVet) parts.push('Vet confirmed');
      return parts.length > 0 ? (
        <p className="text-xs text-muted-foreground truncate">{parts.join(' · ')}</p>
      ) : (
        <p className="text-xs text-amber-600 dark:text-amber-400">Set show times</p>
      );
    }
    case 'people': {
      const parts: string[] = [];
      if (showManager) parts.push(showManager);
      if (officers.length > 0) parts.push(`${officers.length} officer${officers.length !== 1 ? 's' : ''}`);
      if (guarantorCount > 0) parts.push(`${guarantorCount}/${requiredGuarantors} guarantors`);
      return parts.length > 0 ? (
        <p className="text-xs text-muted-foreground truncate">{parts.join(' · ')}</p>
      ) : (
        <p className="text-xs text-amber-600 dark:text-amber-400">Add show manager & officers</p>
      );
    }
    case 'awards':
      return awardsDescription ? (
        <p className="text-xs text-muted-foreground truncate">
          {awardsDescription.slice(0, 80)}{awardsDescription.length > 80 ? '...' : ''}
          {prizeMoney ? ` · ${prizeMoney}` : ''}
        </p>
      ) : (
        <p className="text-xs text-amber-600 dark:text-amber-400">Describe awards & rosettes</p>
      );
    case 'venue': {
      const parts: string[] = [];
      if (directions) parts.push('Directions set');
      if (what3words) parts.push(what3words);
      if (catering) parts.push('Catering info');
      return parts.length > 0 ? (
        <p className="text-xs text-muted-foreground truncate">{parts.join(' · ')}</p>
      ) : (
        <p className="text-xs text-muted-foreground">Optional — directions, catering, etc.</p>
      );
    }
    case 'regulations': {
      const tags: string[] = [COUNTRY_LABELS[country] ?? country];
      if (acceptsNfc) tags.push('NFC');
      if (isBenched) tags.push('Benched');
      if (wetWeather) tags.push('Wet weather');
      return <p className="text-xs text-muted-foreground truncate">{tags.join(' · ')}</p>;
    }
    default:
      return null;
  }
}

// ── Show Day Section ─────────────────────────────────

function ShowDaySection({
  showOpenTime, setShowOpenTime,
  latestArrivalTime, setLatestArrivalTime,
  judgingStartTime, setJudgingStartTime,
  onCallVet, setOnCallVet,
}: {
  showOpenTime: string; setShowOpenTime: (v: string) => void;
  latestArrivalTime: string; setLatestArrivalTime: (v: string) => void;
  judgingStartTime: string; setJudgingStartTime: (v: string) => void;
  onCallVet: string; setOnCallVet: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Show opens at <span className="text-destructive">*</span></Label>
          <Select value={showOpenTime} onValueChange={setShowOpenTime}>
            <SelectTrigger className={cn('min-h-[2.75rem]', !showOpenTime && 'border-destructive/50')}><SelectValue placeholder="Select time" /></SelectTrigger>
            <SelectContent>
              {SHOW_TIMES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Latest time dogs received</Label>
          <Select value={latestArrivalTime} onValueChange={setLatestArrivalTime}>
            <SelectTrigger className="min-h-[2.75rem]"><SelectValue placeholder="Select time" /></SelectTrigger>
            <SelectContent>
              {SHOW_TIMES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Judging commences <span className="text-destructive">*</span></Label>
          <Select value={judgingStartTime} onValueChange={setJudgingStartTime}>
            <SelectTrigger className={cn('min-h-[2.75rem]', !judgingStartTime && 'border-destructive/50')}><SelectValue placeholder="Select time" /></SelectTrigger>
            <SelectContent>
              {SHOW_TIMES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="onCallVet" className="text-xs">Veterinary surgeon on call</Label>
        <Input id="onCallVet" value={onCallVet} onChange={(e) => setOnCallVet(e.target.value)} placeholder="e.g. Westport Vets, Unit 42, Mill Road, Linlithgow EH49 7SF" className="min-h-[2.75rem]" />
      </div>
    </div>
  );
}

// ── People Section ───────────────────────────────────

function AutoSaveIndicator({
  status,
  lastAutoSavedAt,
}: {
  status: 'idle' | 'pending' | 'saving' | 'saved' | 'error';
  lastAutoSavedAt: Date | null;
}) {
  if (status === 'idle') return null;
  if (status === 'pending' || status === 'saving') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        Saving…
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
        <AlertTriangle className="size-3" />
        Couldn&apos;t save
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
      <Check className="size-3" />
      Saved {lastAutoSavedAt ? lastAutoSavedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}
    </span>
  );
}

function PeopleSection({
  showManager, setShowManager, officers,
  addOfficer, removeOfficer, updateOfficer,
  clubPeople, clubPickerOpen, setClubPickerOpen, addFromClub,
  guarantorCount, requiredGuarantors, showType,
}: {
  showManager: string; setShowManager: (v: string) => void;
  officers: OfficerWithGuarantor[];
  addOfficer: () => void;
  removeOfficer: (idx: number) => void;
  updateOfficer: (idx: number, field: keyof OfficerWithGuarantor, value: string | boolean) => void;
  clubPeople: NonNullable<ReturnType<typeof trpc.secretary.listOrgPeople.useQuery>['data']> | null;
  clubPickerOpen: boolean; setClubPickerOpen: (v: boolean) => void;
  addFromClub: (person: NonNullable<typeof clubPeople>[number]) => void;
  guarantorCount: number; requiredGuarantors: number; showType: string;
}) {
  const met = guarantorCount >= requiredGuarantors;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="showManager" className="text-xs">Show Manager <span className="text-destructive">*</span></Label>
        <Input id="showManager" value={showManager} onChange={(e) => setShowManager(e.target.value)} placeholder="Full name" className="min-h-[2.75rem]" />
      </div>

      {/* Officers */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Officers & Guarantors</Label>
          <div className="flex gap-1.5">
            {clubPeople && clubPeople.length > 0 && (
              <Popover open={clubPickerOpen} onOpenChange={setClubPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs">
                    <Users className="size-3" />
                    Club Roster
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] max-w-[calc(100vw-2rem)] p-0" align="end">
                  <Command>
                    <CommandInput placeholder="Search..." />
                    <CommandList className="max-h-[40vh] sm:max-h-[300px]">
                      <CommandEmpty>No people found.</CommandEmpty>
                      <CommandGroup>
                        {clubPeople.map((person) => {
                          const alreadyAdded = officers.some(
                            (o) => o.name.toLowerCase() === person.name.toLowerCase()
                          );
                          return (
                            <CommandItem
                              key={person.id}
                              value={person.name}
                              disabled={alreadyAdded}
                              onSelect={() => { if (!alreadyAdded) addFromClub(person); }}
                              className={alreadyAdded ? 'opacity-40' : ''}
                            >
                              <span className="truncate font-medium">
                                {person.name}
                              </span>
                              <span className="ml-auto text-xs text-muted-foreground truncate">
                                {person.position ?? ''}
                                {alreadyAdded ? ' ✓' : ''}
                              </span>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={addOfficer}>
              <Plus className="size-3" />
              Add
            </Button>
          </div>
        </div>

        {officers.length > 0 && (
          <div className="rounded-lg border divide-y">
            {officers.map((officer, idx) => (
              <div key={idx} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center">
                {/* Name + Position */}
                <div className="grid flex-1 grid-cols-1 gap-1.5 sm:grid-cols-2 min-w-0">
                  <Input
                    placeholder="Name"
                    value={officer.name}
                    onChange={(e) => updateOfficer(idx, 'name', e.target.value)}
                    className="h-10 text-sm"
                  />
                  <Select value={officer.position} onValueChange={(v) => updateOfficer(idx, 'position', v)}>
                    <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="Position" /></SelectTrigger>
                    <SelectContent>
                      {OFFICER_POSITIONS.map((pos) => (
                        <SelectItem key={pos} value={pos}>{pos}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3">
                  {/* Guarantor checkbox — clearly labelled, was previously a tiny G icon nobody noticed */}
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none whitespace-nowrap">
                    <Checkbox
                      checked={officer.isGuarantor}
                      onCheckedChange={(checked) => updateOfficer(idx, 'isGuarantor', checked === true)}
                      className="size-5"
                    />
                    Guarantor
                  </label>
                  <Button variant="ghost" size="icon" className="shrink-0 size-8" onClick={() => removeOfficer(idx)}>
                    <X className="size-3.5 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div
          className={cn(
            'rounded-lg border px-3 py-2 text-sm flex items-start gap-2',
            met
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
              : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
          )}
        >
          {met ? <Check className="size-4 mt-0.5 shrink-0" /> : <AlertTriangle className="size-4 mt-0.5 shrink-0" />}
          <div>
            <p className="font-medium">{guarantorCount} of {requiredGuarantors} guarantors</p>
            {!met && (
              <p className="text-xs mt-0.5 opacity-80">
                Tick the &quot;Guarantor&quot; box next to each officer who is acting as a guarantor for this show. {showType === 'championship' ? 'Championship' : 'Open'} shows need {requiredGuarantors}.
              </p>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}

// ── Awards Section ───────────────────────────────────

function AwardsSection({
  awardsDescription, setAwardsDescription, prizeMoney, setPrizeMoney, showId,
}: {
  awardsDescription: string; setAwardsDescription: (v: string) => void;
  prizeMoney: string; setPrizeMoney: (v: string) => void;
  showId: string;
}) {
  const { data: sponsors } = trpc.secretary.listShowSponsors.useQuery({ showId });
  const sponsorCount = sponsors?.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="awards" className="text-xs">Awards / Rosettes / Trophies</Label>
        <Textarea id="awards" value={awardsDescription} onChange={(e) => setAwardsDescription(e.target.value)} placeholder="e.g. Rosettes to VHC in all classes. Trophies for Best in Show, Reserve Best in Show, Best Puppy in Show." rows={3} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="prizeMoney" className="text-xs">Prize Money</Label>
        <p className="text-xs text-muted-foreground">Leave blank if no prize money is offered</p>
        <Input id="prizeMoney" value={prizeMoney} onChange={(e) => setPrizeMoney(e.target.value)} placeholder="e.g. No prize money offered" className="min-h-[2.75rem]" />
      </div>

      {/* Sponsors link */}
      <Link
        href={`/secretary/shows/${showId}/sponsors`}
        className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50"
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-900/30">
          <Heart className="size-4 text-rose-600 dark:text-rose-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Show Sponsors</p>
          <p className="text-xs text-muted-foreground">
            {sponsorCount > 0
              ? `${sponsorCount} sponsor${sponsorCount !== 1 ? 's' : ''} — these will appear in your schedule`
              : 'Add sponsors so they appear in your schedule'}
          </p>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </div>
  );
}

// ── Venue & Info Section ─────────────────────────────

function VenueSection({
  directions, setDirections, what3words, setWhat3words,
  catering, setCatering, futureShowDates, setFutureShowDates,
  additionalNotes, setAdditionalNotes,
  outsideAttraction, setOutsideAttraction,
}: {
  directions: string; setDirections: (v: string) => void;
  what3words: string; setWhat3words: (v: string) => void;
  catering: string; setCatering: (v: string) => void;
  futureShowDates: string; setFutureShowDates: (v: string) => void;
  additionalNotes: string; setAdditionalNotes: (v: string) => void;
  outsideAttraction: boolean; setOutsideAttraction: (v: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="directions" className="text-xs">Directions to Venue</Label>
        <Textarea id="directions" value={directions} onChange={(e) => setDirections(e.target.value)} placeholder="Directions, parking information, etc." rows={2} />
      </div>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="what3words" className="text-xs">What3Words</Label>
          <Input id="what3words" value={what3words} onChange={(e) => setWhat3words(e.target.value)} placeholder="e.g. ///filled.count.soap" className="min-h-[2.75rem]" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="catering" className="text-xs">Catering</Label>
          <Input id="catering" value={catering} onChange={(e) => setCatering(e.target.value)} placeholder="e.g. Light refreshments available" className="min-h-[2.75rem]" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="futureShows" className="text-xs">Future Show Dates</Label>
        <Input id="futureShows" value={futureShowDates} onChange={(e) => setFutureShowDates(e.target.value)} placeholder="e.g. Next show: 15th September 2026" className="min-h-[2.75rem]" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="additionalNotes" className="text-xs">Additional Notes</Label>
        <Textarea id="additionalNotes" value={additionalNotes} onChange={(e) => setAdditionalNotes(e.target.value)} placeholder="Any other information to include in the schedule" rows={2} />
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <Label className="text-xs">Outside Attraction</Label>
          <p className="text-xs text-muted-foreground">
            Displays notice: &quot;RKC Regulation F(1) 16H will be strictly enforced&quot;
          </p>
        </div>
        <Switch checked={outsideAttraction} onCheckedChange={setOutsideAttraction} />
      </div>
    </div>
  );
}

// ── Regulations Section ──────────────────────────────

function RegulationsSection({
  country, setCountry, publicAdmission, setPublicAdmission,
  wetWeather, setWetWeather, isBenched, setIsBenched,
  benchingRemovalTime, setBenchingRemovalTime,
  acceptsNfc, setAcceptsNfc, judgedOnGroupSystem, setJudgedOnGroupSystem,
  customStatements, setCustomStatements,
}: {
  country: string; setCountry: (v: string) => void;
  publicAdmission: boolean; setPublicAdmission: (v: boolean) => void;
  wetWeather: boolean; setWetWeather: (v: boolean) => void;
  isBenched: boolean; setIsBenched: (v: boolean) => void;
  benchingRemovalTime: string; setBenchingRemovalTime: (v: string) => void;
  acceptsNfc: boolean; setAcceptsNfc: (v: boolean) => void;
  judgedOnGroupSystem: boolean; setJudgedOnGroupSystem: (v: boolean) => void;
  customStatements: string[]; setCustomStatements: (v: string[]) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Mandatory RKC statements are auto-included. These settings control show-specific regulations.
      </p>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="country" className="text-xs">Country</Label>
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger id="country" className="min-h-[2.75rem]"><SelectValue /></SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="england">England</SelectItem>
              <SelectItem value="wales">Wales</SelectItem>
              <SelectItem value="scotland">Scotland</SelectItem>
              <SelectItem value="northern_ireland">Northern Ireland</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <Label className="text-xs">Public admission fee</Label>
          <Switch checked={publicAdmission} onCheckedChange={setPublicAdmission} />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <Label className="text-xs">Wet weather accommodation</Label>
          <Switch checked={wetWeather} onCheckedChange={setWetWeather} />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <Label className="text-xs">NFC entries accepted</Label>
          <Switch checked={acceptsNfc} onCheckedChange={setAcceptsNfc} />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <Label className="text-xs">Group system judging</Label>
          <Switch checked={judgedOnGroupSystem} onCheckedChange={setJudgedOnGroupSystem} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label className="text-xs">Benched show</Label>
            <Switch checked={isBenched} onCheckedChange={setIsBenched} />
          </div>
          {isBenched && (
            <Input value={benchingRemovalTime} onChange={(e) => setBenchingRemovalTime(e.target.value)} placeholder="e.g. Dogs may be removed after Best in Show" className="min-h-[2.75rem]" />
          )}
        </div>
      </div>

      {/* Optional extra statements */}
      <div className="space-y-3">
        <Label className="text-xs">Additional Schedule Statements</Label>

        <div className="space-y-2 max-h-48 overflow-y-auto rounded-lg border p-3">
          {RKC_STATEMENT_CATEGORIES.map((category) => {
            const statementsInCategory = RKC_STATEMENTS.filter((s) => s.category === category);
            return (
              <div key={category}>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">{category}</p>
                <div className="space-y-0.5">
                  {statementsInCategory.map((stmt) => {
                    const isSelected = customStatements.includes(stmt.text);
                    return (
                      <label key={stmt.id} className="flex items-start gap-2 rounded-md px-2 py-1 cursor-pointer hover:bg-accent text-xs">
                        <Checkbox checked={isSelected} onCheckedChange={(checked) => {
                          if (checked) setCustomStatements([...customStatements, stmt.text]);
                          else setCustomStatements(customStatements.filter((s) => s !== stmt.text));
                        }} className="mt-0.5" />
                        <span className="leading-snug">
                          {stmt.text}
                          {stmt.regulation && <span className="ml-1 text-muted-foreground">({stmt.regulation})</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {customStatements.filter((s) => !RKC_STATEMENTS.some((r) => r.text === s)).length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Custom statements</p>
            {customStatements
              .map((stmt, i) => ({ stmt, i }))
              .filter(({ stmt }) => !RKC_STATEMENTS.some((r) => r.text === stmt))
              .map(({ stmt, i }) => (
                <div key={i} className="flex gap-2">
                  <Input value={stmt} onChange={(e) => {
                    const updated = [...customStatements];
                    updated[i] = e.target.value;
                    setCustomStatements(updated);
                  }} placeholder="Enter statement..." className="flex-1 text-xs min-h-[2.75rem]" />
                  <Button type="button" variant="ghost" size="icon" className="shrink-0 size-10 text-destructive hover:text-destructive" onClick={() => setCustomStatements(customStatements.filter((_, idx) => idx !== i))}>
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
          </div>
        )}
        <Button type="button" variant="outline" size="sm" className="min-h-[2.75rem]" onClick={() => setCustomStatements([...customStatements, ''])}>
          <Plus className="size-4" />
          Add Custom Statement
        </Button>
      </div>
    </div>
  );
}
