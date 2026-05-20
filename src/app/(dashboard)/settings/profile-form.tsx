'use client';

import { useState, useEffect } from 'react';
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

export function ProfileForm() {
  const { data: profile, isLoading } = trpc.users.getProfile.useQuery();
  const updateProfile = trpc.users.updateProfile.useMutation();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [postcode, setPostcode] = useState('');
  const [phone, setPhone] = useState('');
  const [kcAccountNo, setKcAccountNo] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? '');
      setAddress(profile.address ?? '');
      setPostcode(profile.postcode ?? '');
      setPhone(profile.phone ?? '');
      setKcAccountNo(profile.kcAccountNo ?? '');
    }
  }, [profile]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);

    await updateProfile.mutateAsync({
      name: name || undefined,
      address: address || null,
      postcode: postcode || null,
      phone: phone || null,
      kcAccountNo: kcAccountNo || null,
    });

    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-lg">Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="size-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-lg">Profile</CardTitle>
        <CardDescription>
          Your personal details used for show entries.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="House/flat, street, town"
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="postcode">Postcode</Label>
            <Input
              id="postcode"
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              placeholder="Postcode"
              className="h-11"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone number"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="kc-account">RKC account number</Label>
              <Input
                id="kc-account"
                value={kcAccountNo}
                onChange={(e) => setKcAccountNo(e.target.value)}
                placeholder="e.g. 12345"
                className="h-11"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:gap-3">
            <Button
              type="submit"
              className="h-11 w-full sm:w-auto"
              disabled={updateProfile.isPending}
            >
              {updateProfile.isPending ? 'Saving...' : 'Save changes'}
            </Button>
            {saved && (
              <span className="text-sm text-green-600">Saved</span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
