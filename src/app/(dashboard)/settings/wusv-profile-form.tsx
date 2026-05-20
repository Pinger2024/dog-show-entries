'use client';

import { useState, useEffect } from 'react';
import { Check, Loader2, Shield } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const CLUB_OPTIONS = [
  { value: 'gsdl', label: 'GSDL (GSD League of Great Britain)' },
  { value: 'gsdl_brg', label: 'GSDL — British Ring Group' },
  { value: 'bagsd', label: 'BAGSD (British Association for German Shepherd Dogs)' },
  { value: 'sv', label: 'SV (Germany)' },
  { value: 'other', label: 'Other' },
] as const;

export function WusvProfileForm() {
  const { data: profile, isLoading } = trpc.users.getSvProfile.useQuery();
  const upsertProfile = trpc.users.upsertSvProfile.useMutation();

  const [club, setClub] = useState<string>('none');
  const [membershipNumber, setMembershipNumber] = useState('');
  const [clubOther, setClubOther] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile) {
      setClub(profile.wusvClub ?? 'none');
      setMembershipNumber(profile.wusvMembershipNumber ?? '');
      setClubOther(profile.wusvClubOther ?? '');
    }
  }, [profile]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    await upsertProfile.mutateAsync({
      wusvClub: club === 'none' ? null : (club as 'gsdl' | 'gsdl_brg' | 'bagsd' | 'sv' | 'other'),
      wusvMembershipNumber: membershipNumber || null,
      wusvClubOther: clubOther || null,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-lg flex items-center gap-2">
            <Shield className="size-4 text-primary" />
            SV / WUSV Membership
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-lg flex items-center gap-2">
          <Shield className="size-4 text-primary" />
          SV / WUSV Membership
        </CardTitle>
        <CardDescription>
          For entries at WUSV/SV regional GSD shows. This is used to apply member discounts and print correct club details on your catalogue entry.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="wusv-club">Club / Organisation</Label>
            <Select value={club} onValueChange={setClub}>
              <SelectTrigger id="wusv-club" className="w-full">
                <SelectValue placeholder="Select club..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Not a member —</SelectItem>
                {CLUB_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {club === 'other' && (
            <div className="space-y-1.5">
              <Label htmlFor="wusv-club-other">Club Name</Label>
              <Input
                id="wusv-club-other"
                value={clubOther}
                onChange={(e) => setClubOther(e.target.value)}
                placeholder="Enter your club name"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="wusv-membership-number">
              Membership Number <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="wusv-membership-number"
              value={membershipNumber}
              onChange={(e) => setMembershipNumber(e.target.value)}
              placeholder="e.g. 12345"
            />
            <p className="text-xs text-muted-foreground">
              Your membership number with the club above. Used for record-keeping only.
            </p>
          </div>

          <Button
            type="submit"
            size="sm"
            disabled={upsertProfile.isPending}
            className="min-h-[2.75rem]"
          >
            {upsertProfile.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : saved ? (
              <>
                <Check className="size-4" />
                Saved
              </>
            ) : (
              'Save'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
