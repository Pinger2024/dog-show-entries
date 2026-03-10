'use client';

import { use, useState, useEffect } from 'react';
import { Plus, Trash2, Loader2, Save, Eye, Download } from 'lucide-react';
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import type { ScheduleData } from '@/server/db/schema/shows';

interface Officer {
  name: string;
  position: string;
}

interface Guarantor {
  name: string;
  address?: string;
}

interface Sponsorship {
  sponsorName: string;
  description: string;
}

export default function ScheduleSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: showId } = use(params);

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
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [guarantors, setGuarantors] = useState<Guarantor[]>([]);
  const [awardsDescription, setAwardsDescription] = useState('');
  const [prizeMoney, setPrizeMoney] = useState('');
  const [sponsorships, setSponsorships] = useState<Sponsorship[]>([]);
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
      setOfficers(existing.officers ?? []);
      setGuarantors(existing.guarantors ?? []);
      setAwardsDescription(existing.awardsDescription ?? '');
      setPrizeMoney(existing.prizeMoney ?? '');
      setSponsorships(existing.sponsorships ?? []);
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
      officers: officers.filter((o) => o.name),
      guarantors: guarantors.filter((g) => g.name),
      awardsDescription: awardsDescription || undefined,
      prizeMoney: prizeMoney || undefined,
      sponsorships: sponsorships.filter((s) => s.sponsorName),
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

  // ── Generic list helpers ──
  function listHelpers<T extends Record<string, unknown>>(
    items: T[],
    setItems: React.Dispatch<React.SetStateAction<T[]>>,
    defaults: T
  ) {
    return {
      add: () => setItems([...items, defaults]),
      remove: (idx: number) => setItems(items.filter((_, i) => i !== idx)),
      update: (idx: number, field: keyof T, value: string) =>
        setItems(items.map((item, i) => (i === idx ? { ...item, [field]: value } : item))),
    };
  }
  const officerOps = listHelpers(officers, setOfficers, { name: '', position: '' });
  const guarantorOps = listHelpers(guarantors, setGuarantors, { name: '', address: '' });
  const sponsorOps = listHelpers(sponsorships, setSponsorships, { sponsorName: '', description: '' });

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
            Configure details for the KC-compliant show schedule PDF. Mandatory KC
            statements are auto-included.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a
              href={`/api/schedule/${showId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
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
            Mandatory KC statements are automatically included
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
                  NFC dogs must be KC registered and aged 3 months+
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
                  Required if scheduling breeds from more than one KC group
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
                    Optional — President, Chairman, Treasurer, etc.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={officerOps.add}>
                  <Plus className="size-3.5" />
                  Add
                </Button>
              </div>
              {officers.map((officer, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2"
                >
                  <Input
                    placeholder="Name"
                    value={officer.name}
                    onChange={(e) => officerOps.update(idx, 'name', e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Position (e.g. Chairman)"
                    value={officer.position}
                    onChange={(e) =>
                      officerOps.update(idx, 'position', e.target.value)
                    }
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => officerOps.remove(idx)}
                  >
                    <Trash2 className="size-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Guarantors */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Guarantors to the KC</Label>
                  <p className="text-xs text-muted-foreground">
                    Required — address is optional
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={guarantorOps.add}>
                  <Plus className="size-3.5" />
                  Add
                </Button>
              </div>
              {guarantors.map((guarantor, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2"
                >
                  <Input
                    placeholder="Name"
                    value={guarantor.name}
                    onChange={(e) =>
                      guarantorOps.update(idx, 'name', e.target.value)
                    }
                    className="flex-1"
                  />
                  <Input
                    placeholder="Address (optional)"
                    value={guarantor.address ?? ''}
                    onChange={(e) =>
                      guarantorOps.update(idx, 'address', e.target.value)
                    }
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => guarantorOps.remove(idx)}
                  >
                    <Trash2 className="size-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── Awards & Sponsorship ── */}
        <AccordionItem value="awards" className="rounded-xl border bg-card">
          <AccordionTrigger className="px-5 py-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <span className="font-semibold">Awards & Sponsorship</span>
              <Badge variant="outline" className="text-[10px]">
                Awards Required
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

            {/* Sponsorships */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Sponsorship / Donations</Label>
                  <p className="text-xs text-muted-foreground">
                    Sponsor names and what they are sponsoring
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={sponsorOps.add}>
                  <Plus className="size-3.5" />
                  Add
                </Button>
              </div>
              {sponsorships.map((sponsor, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2"
                >
                  <Input
                    placeholder="Sponsor name"
                    value={sponsor.sponsorName}
                    onChange={(e) =>
                      sponsorOps.update(idx, 'sponsorName', e.target.value)
                    }
                    className="flex-1"
                  />
                  <Input
                    placeholder="What they sponsor"
                    value={sponsor.description}
                    onChange={(e) =>
                      sponsorOps.update(idx, 'description', e.target.value)
                    }
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => sponsorOps.remove(idx)}
                  >
                    <Trash2 className="size-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
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
      <div className="flex justify-end gap-2 pb-4">
        <Button variant="outline" asChild>
          <a
            href={`/api/schedule/${showId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Download className="size-4" />
            Download Schedule PDF
          </a>
        </Button>
        <Button
          onClick={handleSave}
          disabled={updateMutation.isPending}
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
