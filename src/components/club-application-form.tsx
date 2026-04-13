'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Loader2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc/client';
import { BREED_GROUPS } from '@/lib/breed-groups';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ClubApplicationFormProps {
  /** Pre-fill the contact email (e.g., from session). */
  defaultContactEmail?: string;
  /** Called after a successful submission. */
  onSuccess?: () => void;
  /** Use taller inputs (h-11 sm:h-12) for onboarding context. */
  tall?: boolean;
}

export function ClubApplicationForm({
  defaultContactEmail = '',
  onSuccess,
  tall,
}: ClubApplicationFormProps) {
  const { update: updateSession } = useSession();
  const [clubType, setClubType] = useState<string>('');
  const [organisationName, setOrganisationName] = useState('');
  const [breedId, setBreedId] = useState<string>('');
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [kcRegNumber, setKcRegNumber] = useState('');
  const [contactEmail, setContactEmail] = useState(defaultContactEmail);
  const [contactPhone, setContactPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [details, setDetails] = useState('');

  const { data: breeds } = trpc.breeds.list.useQuery(undefined, {
    enabled: clubType === 'single_breed',
    staleTime: 60 * 60 * 1000,
  });

  const submitMutation = trpc.applications.submit.useMutation({
    onSuccess: async () => {
      await updateSession(); // Refresh session so client sees new secretary role
      toast.success("Club registered!", {
        description: "You're now set up as a show secretary.",
      });
      onSuccess?.();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clubType || !organisationName || !contactEmail) return;

    const isSingleBreed = clubType === 'single_breed';
    const breedLabel = isSingleBreed
      ? breeds?.find((b) => b.id === breedId)?.name
      : undefined;
    const breedOrGroup = isSingleBreed
      ? breedLabel
      : selectedGroups.length > 0
        ? selectedGroups.join(', ')
        : undefined;

    submitMutation.mutate({
      organisationName,
      clubType: clubType as 'single_breed' | 'multi_breed',
      breedOrGroup,
      breedId: isSingleBreed ? breedId || undefined : undefined,
      kcRegNumber: kcRegNumber || undefined,
      contactEmail,
      contactPhone: contactPhone || undefined,
      website: website || undefined,
      details: details || undefined,
    });
  };

  const inputCn = tall ? 'h-11 sm:h-12' : undefined;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">
          Organisation / Club Name *
        </label>
        <Input
          value={organisationName}
          onChange={(e) => setOrganisationName(e.target.value)}
          placeholder="e.g. Clyde Valley GSD Club"
          className={inputCn}
          required
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Club Type *</label>
        <Select value={clubType} onValueChange={setClubType}>
          <SelectTrigger className={inputCn}>
            <SelectValue placeholder="Select club type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="single_breed">Single Breed Club</SelectItem>
            <SelectItem value="multi_breed">Multi Breed Club</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {clubType === 'multi_breed' ? (
        <div className="space-y-2">
          <label className="text-sm font-medium">Breed Groups</label>
          <div className="grid grid-cols-2 gap-2">
            {BREED_GROUPS.map((group) => (
              <label
                key={group}
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer hover:bg-muted/50 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5"
              >
                <input
                  type="checkbox"
                  className="size-4 rounded border-muted-foreground/30 accent-primary"
                  checked={selectedGroups.includes(group)}
                  onChange={(e) => {
                    setSelectedGroups(
                      e.target.checked
                        ? [...selectedGroups, group]
                        : selectedGroups.filter((g) => g !== group)
                    );
                  }}
                />
                {group}
              </label>
            ))}
          </div>
        </div>
      ) : clubType === 'single_breed' ? (
        <div className="space-y-2">
          <label className="text-sm font-medium">Breed *</label>
          <Select value={breedId} onValueChange={setBreedId}>
            <SelectTrigger className={inputCn}>
              <SelectValue placeholder={breeds ? 'Select the breed…' : 'Loading breeds…'} />
            </SelectTrigger>
            <SelectContent>
              {(breeds ?? []).map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            We&apos;ll use this as the default breed for your shows.
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        <label className="text-sm font-medium">Contact Email *</label>
        <Input
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          placeholder="secretary@myclub.co.uk"
          className={inputCn}
          required
        />
        <p className="text-xs text-muted-foreground">
          The email you&apos;ll use for show correspondence.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Contact Phone</label>
        <Input
          type="tel"
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
          placeholder="07xxx xxxxxx"
          className={inputCn}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Club Website</label>
        <Input
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://myclub.co.uk"
          className={inputCn}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">RKC Registration Number</label>
        <Input
          value={kcRegNumber}
          onChange={(e) => setKcRegNumber(e.target.value)}
          placeholder="e.g. 1234"
          className={inputCn}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Tell us about your club</label>
        <Textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="What kind of shows do you run? How many per year?"
          rows={3}
        />
      </div>

      <Button
        type="submit"
        className={tall ? 'h-11 sm:h-12 w-full text-sm sm:text-[0.9375rem]' : 'w-full'}
        disabled={
          submitMutation.isPending ||
          !organisationName ||
          !clubType ||
          !contactEmail ||
          (clubType === 'single_breed' && !breedId)
        }
      >
        {submitMutation.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : null}
        Register Club
        {tall && <ArrowRight className="size-4" />}
      </Button>
    </form>
  );
}
