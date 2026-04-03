'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Loader2, Save, Eye, ExternalLink, Download, Check, AlertTriangle, ChevronsUpDown, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
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

export function ScheduleSettingsForm({ showId, onSaved }: ScheduleSettingsFormProps) {
  const { data: existing, isLoading } =
    trpc.secretary.getScheduleData.useQuery({ showId });
  const { data: showData } = trpc.shows.getById.useQuery({ id: showId });
  const updateMutation = trpc.secretary.updateScheduleData.useMutation();
  const utils = trpc.useUtils();

  // Club people for "Select from Club" picker
  const orgId = showData?.organisationId;
  const { data: clubPeople } = trpc.secretary.listOrgPeople.useQuery(
    { organisationId: orgId ?? '' },
    { enabled: !!orgId }
  );
  const [clubPickerOpen, setClubPickerOpen] = useState(false);

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
  const [customStatements, setCustomStatements] = useState<string[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Populate from existing data
  useEffect(() => {
    if (existing && showData && !hasLoaded) {
      setCountry(existing.country ?? 'england');
      setPublicAdmission(existing.publicAdmission ?? false);
      setWetWeather(existing.wetWeatherAccommodation ?? false);
      setIsBenched(existing.isBenched ?? false);
      setBenchingRemovalTime(existing.benchingRemovalTime ?? '');
      setAcceptsNfc(existing.acceptsNfc ?? true);
      setJudgedOnGroupSystem(existing.judgedOnGroupSystem ?? false);
      setLatestArrivalTime(existing.latestArrivalTime ?? '');
      setShowOpenTime(showData?.showOpenTime ?? '');
      setJudgingStartTime(showData?.startTime ?? '');
      setOnCallVet(showData?.onCallVet ?? '');
      setWhat3words(existing.what3words ?? '');
      setShowManager(existing.showManager ?? '');
      // Merge officers with guarantor info
      const existingOfficers = existing.officers ?? [];
      const existingGuarantors = existing.guarantors ?? [];
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
      setAwardsDescription(existing.awardsDescription ?? '');
      setPrizeMoney(existing.prizeMoney ?? '');
      setDirections(existing.directions ?? '');
      setCatering(existing.catering ?? '');
      setFutureShowDates(existing.futureShowDates ?? '');
      setAdditionalNotes(existing.additionalNotes ?? '');
      setCustomStatements(existing.customStatements ?? []);
      setHasLoaded(true);
    }
  }, [existing, showData, hasLoaded]);

  async function handleSave() {
    const data: ScheduleData = {
      // Preserve fields managed by other pages (e.g. sponsors page saves awardSponsors)
      ...existing,
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
        // Invalidate club people cache in case new officers were synced to the roster
        orgId ? utils.secretary.listOrgPeople.invalidate({ organisationId: orgId }) : Promise.resolve(),
      ]);
      toast.success('Schedule settings saved');
      onSaved?.();
    } catch {
      toast.error('Failed to save schedule settings');
    }
  }

  // ── Officer list helpers ──
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Schedule Settings</h2>
          <p className="text-sm text-muted-foreground">
            Configure details for the RKC-compliant show schedule PDF. Mandatory RKC
            statements are auto-included.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href={`/api/schedule/${showId}`} target="_blank" rel="noopener noreferrer">
            <Eye className="size-4" />
            Preview PDF
          </a>
        </Button>
      </div>

      {/* Auto-included notice */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-4">
          <p className="text-sm font-medium text-primary">
            Mandatory RKC statements are automatically included
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Judges assessment, jurisdiction, collar/welfare, dogs in vehicles warning,
            children supervision, fouling, GDPR, 10-minute BIS rule, and all
            Regulation F notices are pre-filled in every schedule. You only need to
            configure the show-specific details below.
          </p>
        </CardContent>
      </Card>

      <Accordion
        type="multiple"
        defaultValue={['regulatory', 'people', 'awards', 'optional']}
        className="space-y-3"
      >
        {/* ── Regulatory & Compliance ── */}
        <AccordionItem value="regulatory" className="rounded-xl border bg-card">
          <AccordionTrigger className="px-5 py-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <span className="font-semibold">Regulatory & Compliance</span>
              <Badge variant="outline" className="text-xs">
                Required
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-5 pb-5">
            <div className="grid gap-5 sm:grid-cols-2">
              {/* Country */}
              <div className="space-y-1.5">
                <Label htmlFor="country">Country</Label>
                <p className="text-xs text-muted-foreground">
                  Determines the docking statement wording
                </p>
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger id="country">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value="england">England</SelectItem>
                    <SelectItem value="wales">Wales</SelectItem>
                    <SelectItem value="scotland">Scotland</SelectItem>
                    <SelectItem value="northern_ireland">
                      Northern Ireland
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Public admission */}
              <div className="space-y-1.5">
                <Label>Public admission fee</Label>
                <p className="text-xs text-muted-foreground">
                  Affects which docking statement is used
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <Switch
                    checked={publicAdmission}
                    onCheckedChange={setPublicAdmission}
                  />
                  <span className="text-sm">
                    {publicAdmission ? 'Yes — public pay entry fee' : 'No — free entry'}
                  </span>
                </div>
              </div>

              {/* Wet weather */}
              <div className="space-y-1.5">
                <Label>Wet weather accommodation</Label>
                <p className="text-xs text-muted-foreground">
                  If not provided, a prominent notice is added to the schedule
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <Switch
                    checked={wetWeather}
                    onCheckedChange={setWetWeather}
                  />
                  <span className="text-sm">
                    {wetWeather ? 'Provided' : 'Not provided'}
                  </span>
                </div>
              </div>

              {/* Benched */}
              <div className="space-y-1.5">
                <Label>Benching</Label>
                <p className="text-xs text-muted-foreground">
                  Required for all-breed shows, optional for single breed
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <Switch
                    checked={isBenched}
                    onCheckedChange={setIsBenched}
                  />
                  <span className="text-sm">
                    {isBenched ? 'Benched show' : 'Unbenched show'}
                  </span>
                </div>
                {isBenched && (
                  <div className="mt-2 space-y-1.5">
                    <Label htmlFor="benchingRemoval">
                      Benching removal time
                    </Label>
                    <Input
                      id="benchingRemoval"
                      value={benchingRemovalTime}
                      onChange={(e) => setBenchingRemovalTime(e.target.value)}
                      placeholder="e.g. Dogs may be removed after Best in Show"
                    />
                  </div>
                )}
              </div>

              {/* NFC */}
              <div className="space-y-1.5">
                <Label>Not For Competition entries</Label>
                <p className="text-xs text-muted-foreground">
                  NFC dogs must be RKC registered and aged 3 months+
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <Switch
                    checked={acceptsNfc}
                    onCheckedChange={setAcceptsNfc}
                  />
                  <span className="text-sm">
                    {acceptsNfc ? 'NFC entries accepted' : 'NFC not accepted'}
                  </span>
                </div>
              </div>

              {/* Group system */}
              <div className="space-y-1.5">
                <Label>Group system judging</Label>
                <p className="text-xs text-muted-foreground">
                  Required if scheduling breeds from more than one RKC group
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <Switch
                    checked={judgedOnGroupSystem}
                    onCheckedChange={setJudgedOnGroupSystem}
                  />
                  <span className="text-sm">
                    {judgedOnGroupSystem
                      ? 'Judged on group system'
                      : 'Not on group system'}
                  </span>
                </div>
              </div>

              {/* Show timing — all three times */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="showOpenTime">Show opens at</Label>
                  <Input
                    id="showOpenTime"
                    value={showOpenTime}
                    onChange={(e) => setShowOpenTime(e.target.value)}
                    placeholder="e.g. 8:30 AM"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="latestArrival">Latest time dogs received</Label>
                  <Input
                    id="latestArrival"
                    value={latestArrivalTime}
                    onChange={(e) => setLatestArrivalTime(e.target.value)}
                    placeholder="e.g. 9:00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="judgingStart">Judging commences</Label>
                  <Input
                    id="judgingStart"
                    value={judgingStartTime}
                    onChange={(e) => setJudgingStartTime(e.target.value)}
                    placeholder="e.g. 9:30 AM"
                  />
                </div>
              </div>

              {/* Vet on call */}
              <div className="space-y-1.5">
                <Label htmlFor="onCallVet">Veterinary surgeon on call</Label>
                <Input
                  id="onCallVet"
                  value={onCallVet}
                  onChange={(e) => setOnCallVet(e.target.value)}
                  placeholder="e.g. Westport Vets, Unit 42, Mill Road, Linlithgow EH49 7SF"
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── People ── */}
        <AccordionItem value="people" className="rounded-xl border bg-card">
          <AccordionTrigger className="px-5 py-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <span className="font-semibold">People & Officials</span>
              <Badge variant="outline" className="text-xs">
                Show Manager Required
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-5 pb-5 space-y-6">
            {/* Show Manager */}
            <div className="space-y-1.5">
              <Label htmlFor="showManager">Show Manager</Label>
              <Input
                id="showManager"
                value={showManager}
                onChange={(e) => setShowManager(e.target.value)}
                placeholder="Full name"
              />
            </div>

            {/* Officers & Committee */}
            <div className="space-y-3">
              <div className="space-y-2">
                <div>
                  <Label>Officers & Committee</Label>
                  <p className="text-xs text-muted-foreground">
                    Add officers then tick the ones who are guarantors to the RKC
                  </p>
                </div>

                {/* Select from Club Roster */}
                {clubPeople && clubPeople.length > 0 && (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <Popover open={clubPickerOpen} onOpenChange={setClubPickerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="justify-between min-h-[2.75rem]"
                        >
                          <span className="flex items-center gap-2">
                            <Users className="size-4" />
                            Add from Club Roster ({clubPeople.length})
                          </span>
                          <ChevronsUpDown className="size-3.5 opacity-70" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] max-w-[calc(100vw-2rem)] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search club people..." />
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
                                    onSelect={() => {
                                      if (!alreadyAdded) addFromClub(person);
                                    }}
                                    className={alreadyAdded ? 'opacity-40' : ''}
                                  >
                                    <div className="flex flex-col gap-0.5 min-w-0">
                                      <span className="truncate font-medium">
                                        {person.name}
                                        {alreadyAdded && (
                                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                            (already added)
                                          </span>
                                        )}
                                      </span>
                                      {person.position && (
                                        <span className="text-xs text-muted-foreground truncate">
                                          {person.position}
                                          {person.isGuarantor ? ' · Guarantor' : ''}
                                        </span>
                                      )}
                                    </div>
                                    {alreadyAdded && (
                                      <Check className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
                                    )}
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <Button variant="outline" size="sm" onClick={addOfficer} className="min-h-[2.75rem]">
                      <Plus className="size-3.5" />
                      Add Manually
                    </Button>
                  </div>
                )}
                {/* Show Add Manually alone if no club roster */}
                {(!clubPeople || clubPeople.length === 0) && (
                  <div className="flex items-center justify-end">
                    <Button variant="outline" size="sm" onClick={addOfficer} className="min-h-[2.75rem]">
                      <Plus className="size-3.5" />
                      Add Manually
                    </Button>
                  </div>
                )}
              </div>
              <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
              {officers.map((officer, idx) => (
                <div key={idx} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-start gap-2">
                    <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                      <Input
                        placeholder="Name"
                        value={officer.name}
                        onChange={(e) => updateOfficer(idx, 'name', e.target.value)}
                      />
                      <Select value={officer.position} onValueChange={(v) => updateOfficer(idx, 'position', v)}>
                        <SelectTrigger className="h-10"><SelectValue placeholder="Position" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="President">President</SelectItem>
                          <SelectItem value="Vice President">Vice President</SelectItem>
                          <SelectItem value="Chairman">Chairman</SelectItem>
                          <SelectItem value="Vice Chairman">Vice Chairman</SelectItem>
                          <SelectItem value="Honorary Secretary">Honorary Secretary</SelectItem>
                          <SelectItem value="Honorary Treasurer">Honorary Treasurer</SelectItem>
                          <SelectItem value="Committee Member">Committee Member</SelectItem>
                          <SelectItem value="Show Manager">Show Manager</SelectItem>
                          <SelectItem value="Show Secretary">Show Secretary</SelectItem>
                          <SelectItem value="Assistant Secretary">Assistant Secretary</SelectItem>
                          <SelectItem value="Chief Steward">Chief Steward</SelectItem>
                          <SelectItem value="Ring Steward">Ring Steward</SelectItem>
                          <SelectItem value="Veterinary Surgeon">Veterinary Surgeon</SelectItem>
                          <SelectItem value="Health & Safety Officer">Health & Safety Officer</SelectItem>
                          <SelectItem value="First Aid Officer">First Aid Officer</SelectItem>
                          <SelectItem value="Trophy Steward">Trophy Steward</SelectItem>
                          <SelectItem value="Field Officer">Field Officer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 min-h-[2.75rem] min-w-[2.75rem]"
                      onClick={() => removeOfficer(idx)}
                    >
                      <Trash2 className="size-4 text-muted-foreground" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 pl-1">
                    <Checkbox
                      id={`guarantor-${idx}`}
                      checked={officer.isGuarantor}
                      onCheckedChange={(checked) =>
                        updateOfficer(idx, 'isGuarantor', !!checked)
                      }
                    />
                    <Label
                      htmlFor={`guarantor-${idx}`}
                      className="text-sm font-normal text-muted-foreground cursor-pointer"
                    >
                      Guarantor to the RKC
                    </Label>
                  </div>
                  {officer.isGuarantor && (
                    <Input
                      placeholder="Address (optional)"
                      value={officer.address ?? ''}
                      onChange={(e) => updateOfficer(idx, 'address', e.target.value)}
                      className="ml-6"
                    />
                  )}
                </div>
              ))}
              </div>
              {(() => {
                const count = officers.filter((o) => o.isGuarantor).length;
                const isChampionship = showData?.showType === 'championship';
                const required = isChampionship ? 6 : 3;
                const met = count >= required;
                return (
                  <p className={`text-xs flex items-center gap-1 ${met ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {met ? <Check className="size-3" /> : <AlertTriangle className="size-3" />}
                    {count} of {required} guarantors {met ? 'added' : 'required'}
                    {isChampionship ? ' (championship)' : ' (open/limited)'}
                    {!met && ' — must include Chairman, Secretary & Treasurer'}
                  </p>
                );
              })()}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── Awards ── */}
        <AccordionItem value="awards" className="rounded-xl border bg-card">
          <AccordionTrigger className="px-5 py-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <span className="font-semibold">Awards</span>
              <Badge variant="outline" className="text-xs">
                Required
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-5 pb-5 space-y-6">
            {/* Awards */}
            <div className="space-y-1.5">
              <Label htmlFor="awards">Awards / Rosettes / Trophies</Label>
              <p className="text-xs text-muted-foreground">
                Describe what awards are on offer
              </p>
              <Textarea
                id="awards"
                value={awardsDescription}
                onChange={(e) => setAwardsDescription(e.target.value)}
                placeholder="e.g. Rosettes to VHC in all classes. Trophies for Best in Show, Reserve Best in Show, Best Puppy in Show."
                rows={3}
              />
            </div>

            {/* Prize money */}
            <div className="space-y-1.5">
              <Label htmlFor="prizeMoney">Prize Money</Label>
              <p className="text-xs text-muted-foreground">
                Leave blank if no prize money is offered
              </p>
              <Input
                id="prizeMoney"
                value={prizeMoney}
                onChange={(e) => setPrizeMoney(e.target.value)}
                placeholder="e.g. No prize money offered"
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── Optional Information ── */}
        <AccordionItem value="optional" className="rounded-xl border bg-card">
          <AccordionTrigger className="px-5 py-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <span className="font-semibold">Additional Information</span>
              <Badge variant="secondary" className="text-xs">
                Optional
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-5 pb-5 space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="directions">Directions to Venue</Label>
              <Textarea
                id="directions"
                value={directions}
                onChange={(e) => setDirections(e.target.value)}
                placeholder="Directions, parking information, etc."
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="what3words">What3Words</Label>
              <Input
                id="what3words"
                value={what3words}
                onChange={(e) => setWhat3words(e.target.value)}
                placeholder="e.g. ///filled.count.soap"
              />
              <p className="text-xs text-muted-foreground">
                Find your venue&apos;s what3words address at what3words.com
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="catering">Catering</Label>
              <Input
                id="catering"
                value={catering}
                onChange={(e) => setCatering(e.target.value)}
                placeholder="e.g. Light refreshments available"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="futureShows">Future Show Dates</Label>
              <Input
                id="futureShows"
                value={futureShowDates}
                onChange={(e) => setFutureShowDates(e.target.value)}
                placeholder="e.g. Next show: 15th September 2026"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="additionalNotes">Additional Notes</Label>
              <Textarea
                id="additionalNotes"
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
                placeholder="Any other information to include in the schedule"
                rows={3}
              />
            </div>

            {/* Custom statements — RKC presets + free text */}
            <div className="space-y-3">
              <div>
                <Label>Schedule Statements</Label>
                <p className="text-xs text-muted-foreground">
                  Select standard RKC statements or add your own. These appear as bold notices on the schedule.
                </p>
              </div>

              {/* RKC preset statements — grouped by category */}
              <div className="space-y-3 max-h-64 overflow-y-auto rounded-lg border p-3">
                {RKC_STATEMENT_CATEGORIES.map((category) => {
                  const statementsInCategory = RKC_STATEMENTS.filter((s) => s.category === category);
                  return (
                    <div key={category}>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                        {category}
                      </p>
                      <div className="space-y-1">
                        {statementsInCategory.map((stmt) => {
                          const isSelected = customStatements.includes(stmt.text);
                          return (
                            <label
                              key={stmt.id}
                              className="flex items-start gap-2 rounded-md px-2 py-1.5 cursor-pointer hover:bg-accent text-xs"
                            >
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setCustomStatements([...customStatements, stmt.text]);
                                  } else {
                                    setCustomStatements(customStatements.filter((s) => s !== stmt.text));
                                  }
                                }}
                                className="mt-0.5"
                              />
                              <span className="leading-snug">
                                {stmt.text}
                                {stmt.regulation && (
                                  <span className="ml-1 text-muted-foreground">({stmt.regulation})</span>
                                )}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Custom free-text statements */}
              {customStatements.filter((s) => !RKC_STATEMENTS.some((r) => r.text === s)).length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Custom statements</p>
                  {customStatements
                    .map((stmt, i) => ({ stmt, i }))
                    .filter(({ stmt }) => !RKC_STATEMENTS.some((r) => r.text === stmt))
                    .map(({ stmt, i }) => (
                      <div key={i} className="flex gap-2">
                        <Input
                          value={stmt}
                          onChange={(e) => {
                            const updated = [...customStatements];
                            updated[i] = e.target.value;
                            setCustomStatements(updated);
                          }}
                          placeholder="Enter statement..."
                          className="flex-1 text-xs"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 size-10 text-destructive hover:text-destructive"
                          onClick={() => setCustomStatements(customStatements.filter((_, idx) => idx !== i))}
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    ))}
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-[2.75rem]"
                onClick={() => setCustomStatements([...customStatements, ''])}
              >
                <Plus className="size-4" />
                Add Custom Statement
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Bottom save bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end pb-4">
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
