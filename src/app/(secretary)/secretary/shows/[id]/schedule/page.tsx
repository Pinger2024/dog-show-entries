'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Loader2, Save, Eye, Download, Check } from 'lucide-react';
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
import type { ScheduleData } from '@/server/db/schema/shows';
import { useShowId } from '../_lib/show-context';

interface OfficerWithGuarantor {
  name: string;
  position: string;
  isGuarantor: boolean;
  address?: string;
}

export default function ScheduleSettingsPage() {
  const showId = useShowId();

  const { data: existing, isLoading } =
    trpc.secretary.getScheduleData.useQuery({ showId });
  const updateMutation = trpc.secretary.updateScheduleData.useMutation();
  const utils = trpc.useUtils();

  // ── Form state ──
  const [country, setCountry] = useState<string>('england');
  const [publicAdmission, setPublicAdmission] = useState(true);
  const [wetWeather, setWetWeather] = useState(false);
  const [isBenched, setIsBenched] = useState(false);
  const [benchingRemovalTime, setBenchingRemovalTime] = useState('');
  const [acceptsNfc, setAcceptsNfc] = useState(true);
  const [judgedOnGroupSystem, setJudgedOnGroupSystem] = useState(false);
  const [latestArrivalTime, setLatestArrivalTime] = useState('');
  const [showManager, setShowManager] = useState('');
  const [officers, setOfficers] = useState<OfficerWithGuarantor[]>([]);
  const [awardsDescription, setAwardsDescription] = useState('');
  const [prizeMoney, setPrizeMoney] = useState('');
  const [directions, setDirections] = useState('');
  const [catering, setCatering] = useState('');
  const [futureShowDates, setFutureShowDates] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);

  // Populate from existing data
  useEffect(() => {
    if (existing && !hasLoaded) {
      setCountry(existing.country ?? 'england');
      setPublicAdmission(existing.publicAdmission ?? true);
      setWetWeather(existing.wetWeatherAccommodation ?? false);
      setIsBenched(existing.isBenched ?? false);
      setBenchingRemovalTime(existing.benchingRemovalTime ?? '');
      setAcceptsNfc(existing.acceptsNfc ?? true);
      setJudgedOnGroupSystem(existing.judgedOnGroupSystem ?? false);
      setLatestArrivalTime(existing.latestArrivalTime ?? '');
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
      setHasLoaded(true);
    }
  }, [existing, hasLoaded]);

  async function handleSave() {
    const data: ScheduleData = {
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
      directions: directions || undefined,
      catering: catering || undefined,
      futureShowDates: futureShowDates || undefined,
      additionalNotes: additionalNotes || undefined,
    };

    try {
      await updateMutation.mutateAsync({ showId, scheduleData: data });
      await utils.secretary.getScheduleData.invalidate({ showId });
      toast.success('Schedule settings saved');
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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/schedule/${showId}`} download>
              <Eye className="size-4" />
              Preview PDF
            </a>
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            size="sm"
          >
            {updateMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Save
          </Button>
        </div>
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
        defaultValue={['regulatory', 'people', 'awards']}
        className="space-y-3"
      >
        {/* ── Regulatory & Compliance ── */}
        <AccordionItem value="regulatory" className="rounded-xl border bg-card">
          <AccordionTrigger className="px-5 py-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <span className="font-semibold">Regulatory & Compliance</span>
              <Badge variant="outline" className="text-[10px]">
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

              {/* Latest arrival time */}
              <div className="space-y-1.5">
                <Label htmlFor="latestArrival">
                  Latest time dogs will be received
                </Label>
                <Input
                  id="latestArrival"
                  value={latestArrivalTime}
                  onChange={(e) => setLatestArrivalTime(e.target.value)}
                  placeholder="e.g. 9:30 AM"
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
              <Badge variant="outline" className="text-[10px]">
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
              <div className="flex items-center justify-between">
                <div>
                  <Label>Officers & Committee</Label>
                  <p className="text-xs text-muted-foreground">
                    Add officers then tick the ones who are guarantors to the RKC
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={addOfficer}>
                  <Plus className="size-3.5" />
                  Add
                </Button>
              </div>
              {officers.map((officer, idx) => (
                <div key={idx} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-start gap-2">
                    <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                      <Input
                        placeholder="Name"
                        value={officer.name}
                        onChange={(e) => updateOfficer(idx, 'name', e.target.value)}
                      />
                      <Input
                        placeholder="Position (e.g. Chairman)"
                        value={officer.position}
                        onChange={(e) => updateOfficer(idx, 'position', e.target.value)}
                      />
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
              {officers.filter((o) => o.isGuarantor).length > 0 && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Check className="size-3" />
                  {officers.filter((o) => o.isGuarantor).length} guarantor{officers.filter((o) => o.isGuarantor).length !== 1 ? 's' : ''} selected
                </p>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── Awards ── */}
        <AccordionItem value="awards" className="rounded-xl border bg-card">
          <AccordionTrigger className="px-5 py-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <span className="font-semibold">Awards</span>
              <Badge variant="outline" className="text-[10px]">
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
              <Badge variant="secondary" className="text-[10px]">
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
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Bottom save bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end pb-4">
        <Button variant="outline" asChild className="w-full sm:w-auto min-h-[2.75rem]">
          <a href={`/api/schedule/${showId}`} download>
            <Download className="size-4" />
            Download Schedule PDF
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
