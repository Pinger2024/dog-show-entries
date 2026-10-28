'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * THE venue control: pick one of the club's venues, or add a new one and
 * have it picked. Used by the new-show wizard, the setup wizard's details
 * step and the Edit Show Details dialog, so a show can get its venue at any
 * point — until 28 Oct 2026 only the new-show wizard had one, and it let
 * the venue be skipped, so a show created without a venue could never be
 * given one (Mandy, GSD Club of Scotland).
 *
 * Adding a venue saves it to the club straight away (secretary.createVenue,
 * which geocodes the postcode) and reports the new id through `onChange`;
 * the caller decides when the show itself is saved.
 */
export interface VenuePickerProps {
  organisationId: string | null | undefined;
  /** The venue currently on the show, or null/undefined for none yet. */
  value: string | null | undefined;
  /** The chosen (or newly added) venue id. */
  onChange: (venueId: string) => void;
  disabled?: boolean;
  /** Prefix for the input ids, so two pickers on one page don't collide. */
  idPrefix?: string;
}

export function VenuePicker({
  organisationId,
  value,
  onChange,
  disabled = false,
  idPrefix = 'venue',
}: VenuePickerProps) {
  const utils = trpc.useUtils();
  const { data: venues, isLoading } = trpc.secretary.listVenues.useQuery(
    { organisationId: organisationId ?? '' },
    { enabled: !!organisationId },
  );

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [postcode, setPostcode] = useState('');
  const [indoorOutdoor, setIndoorOutdoor] = useState('');

  // A club with no venues yet goes straight to the add form — there is
  // nothing to choose from.
  useEffect(() => {
    if (venues && venues.length === 0 && !value) setAdding(true);
  }, [venues, value]);

  const createMutation = trpc.secretary.createVenue.useMutation({
    onSuccess: (venue) => {
      if (organisationId) utils.secretary.listVenues.invalidate({ organisationId });
      onChange(venue.id);
      setAdding(false);
      setName('');
      setAddress('');
      setPostcode('');
      setIndoorOutdoor('');
      toast.success(`${venue.name} added and chosen`);
    },
    onError: (err) => toast.error(err.message ?? 'Could not add the venue'),
  });

  function addVenue() {
    if (!organisationId) return;
    if (!name.trim()) {
      toast.error('Please give the venue a name');
      return;
    }
    createMutation.mutate({
      organisationId,
      name: name.trim(),
      address: address.trim() || undefined,
      postcode: postcode.trim() || undefined,
      indoorOutdoor: indoorOutdoor || undefined,
    });
  }

  const hasVenues = (venues?.length ?? 0) > 0;
  const busy = disabled || createMutation.isPending;

  if (adding || (!isLoading && !hasVenues)) {
    return (
      <div className="space-y-3 rounded-lg border p-3 sm:p-4" data-testid="venue-picker-add">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-name`} className="text-xs">
            Venue name <span className="text-destructive">*</span>
          </Label>
          <Input
            id={`${idPrefix}-name`}
            placeholder="e.g. Sidewood Canine Services"
            className="min-h-[2.75rem]"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-address`} className="text-xs">Address</Label>
          <Input
            id={`${idPrefix}-address`}
            placeholder="Street, town"
            className="min-h-[2.75rem]"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-postcode`} className="text-xs">Postcode</Label>
            <Input
              id={`${idPrefix}-postcode`}
              placeholder="e.g. ML11 8ET"
              className="min-h-[2.75rem]"
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-indoor`} className="text-xs">Indoor or outdoor</Label>
            <Select value={indoorOutdoor} onValueChange={setIndoorOutdoor} disabled={busy}>
              <SelectTrigger id={`${idPrefix}-indoor`} className="min-h-[2.75rem] w-full">
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="indoor">Indoor</SelectItem>
                <SelectItem value="outdoor">Outdoor</SelectItem>
                <SelectItem value="both">Both</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" className="min-h-[2.75rem]" onClick={addVenue} disabled={busy || !organisationId}>
            <Plus className="size-4" />
            Add this venue
          </Button>
          {hasVenues && (
            <Button
              type="button"
              variant="ghost"
              className="min-h-[2.75rem]"
              onClick={() => setAdding(false)}
              disabled={busy}
            >
              Cancel
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="venue-picker">
      <Select
        value={value ?? ''}
        onValueChange={(id) => {
          if (id) onChange(id);
        }}
        disabled={busy || isLoading}
      >
        <SelectTrigger id={`${idPrefix}-select`} className="min-h-[2.75rem] w-full">
          <SelectValue placeholder={isLoading ? 'Loading venues…' : 'Choose the venue'} />
        </SelectTrigger>
        <SelectContent>
          {(venues ?? []).map((v) => (
            <SelectItem key={v.id} value={v.id}>
              {v.name}
              {v.postcode ? ` (${v.postcode})` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="link"
        className="h-auto px-0 text-sm"
        onClick={() => setAdding(true)}
        disabled={busy}
      >
        <Plus className="size-3.5" />
        Add a new venue
      </Button>
    </div>
  );
}
