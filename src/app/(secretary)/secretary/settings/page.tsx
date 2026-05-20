'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { uploadImage } from '@/lib/upload';
import { useActiveOrganisation } from '@/lib/use-active-organisation';
import { toast } from 'sonner';
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
import { Badge } from '@/components/ui/badge';
import {
  Camera,
  Upload,
  X,
  Building2,
  Mail,
  Phone,
  Globe,
  Loader2,
  ImageIcon,
  Check,
} from 'lucide-react';

const SUBSCRIPTION_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  active: { label: 'Active subscription', variant: 'default' },
  trial: { label: 'Trial', variant: 'outline' },
  past_due: { label: 'Past Due', variant: 'destructive' },
  cancelled: { label: 'Cancelled', variant: 'secondary' },
  none: { label: 'No Plan', variant: 'secondary' },
};

type OrgData = {
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  logoUrl: string | null;
};

function resetFormFromOrg(
  org: OrgData,
  setters: {
    setName: (v: string) => void;
    setContactEmail: (v: string) => void;
    setContactPhone: (v: string) => void;
    setWebsite: (v: string) => void;
    setLogoUrl: (v: string) => void;
  }
) {
  setters.setName(org.name);
  setters.setContactEmail(org.contactEmail ?? '');
  setters.setContactPhone(org.contactPhone ?? '');
  setters.setWebsite(org.website ?? '');
  setters.setLogoUrl(org.logoUrl ?? '');
}

export default function SettingsPage() {
  // Respect the active-org switcher — otherwise a user with memberships in
  // multiple clubs would silently edit their "first" membership rather than
  // the org they switched to. The club + billing pages already do this;
  // Settings was missed in the original switcher rollout.
  const { activeOrgId } = useActiveOrganisation();
  const { data: org, isLoading } = trpc.secretary.getOrganisation.useQuery(
    { organisationId: activeOrgId ?? undefined },
    { enabled: activeOrgId !== null },
  );
  const updateMutation = trpc.secretary.updateOrganisation.useMutation();
  const utils = trpc.useUtils();

  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [initialised, setInitialised] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const setters = { setName, setContactEmail, setContactPhone, setWebsite, setLogoUrl };

  useEffect(() => {
    if (org && !initialised) {
      resetFormFromOrg(org, setters);
      setInitialised(true);
    }
  }, [org, initialised]); // eslint-disable-line react-hooks/exhaustive-deps

  const isDirty =
    initialised &&
    org &&
    (name !== org.name ||
      contactEmail !== (org.contactEmail ?? '') ||
      contactPhone !== (org.contactPhone ?? '') ||
      website !== (org.website ?? '') ||
      logoUrl !== (org.logoUrl ?? ''));

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const publicUrl = await uploadImage(file);
      setLogoUrl(publicUrl);
      toast.success('Logo uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload logo');
    } finally {
      setUploading(false);
    }
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  }

  async function handleSave() {
    if (!org || !name.trim()) return;
    try {
      const result = await updateMutation.mutateAsync({
        organisationId: org.id,
        name: name.trim(),
        contactEmail: contactEmail.trim() || null,
        contactPhone: contactPhone.trim() || null,
        website: website.trim() || null,
        logoUrl: logoUrl || null,
      });
      resetFormFromOrg(result, setters);
      await utils.secretary.getOrganisation.invalidate();
      toast.success('Organisation details saved');
    } catch {
      toast.error('Failed to save changes');
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6 pb-16 md:pb-0">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="space-y-4 sm:space-y-6 pb-16 md:pb-0">
        <h1 className="font-serif text-lg font-bold tracking-tight sm:text-2xl">
          Settings
        </h1>
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="mx-auto size-10 text-muted-foreground/40" />
            <p className="mt-3 text-muted-foreground">
              No organisation found. Create a show first to set up your club.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const subStatus = SUBSCRIPTION_LABELS[org.subscriptionStatus] ?? SUBSCRIPTION_LABELS.none;

  return (
    <div className="space-y-4 sm:space-y-6 pb-16 md:pb-0">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-lg font-bold tracking-tight sm:text-2xl">
            Club Settings
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage your organisation&apos;s profile and branding
          </p>
        </div>
        <Badge variant={subStatus.variant} className="self-start sm:self-auto">
          {subStatus.label}
        </Badge>
      </div>

      {/* Logo upload card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-serif text-base sm:text-lg">
            <Camera className="size-4 sm:size-5 text-primary" />
            Club Logo
          </CardTitle>
          <CardDescription>
            Your logo appears on catalogues, prize cards, and other printed materials.
            Use a high-quality PNG or SVG with a transparent background for best results.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
            {/* Logo preview / upload zone */}
            <div
              className={`
                group relative flex shrink-0 items-center justify-center
                size-32 sm:size-36 rounded-xl border-2 border-dashed
                transition-all duration-200 cursor-pointer
                ${dragOver
                  ? 'border-primary bg-primary/5 scale-[1.02]'
                  : logoUrl
                    ? 'border-transparent bg-muted/30'
                    : 'border-muted-foreground/20 bg-muted/20 hover:border-primary/40 hover:bg-muted/40'
                }
              `}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="size-6 animate-spin text-primary" />
                  <span className="text-[11px] font-medium text-muted-foreground">Uploading...</span>
                </div>
              ) : logoUrl ? (
                <>
                  <img
                    src={logoUrl}
                    alt={`${name} logo`}
                    className="size-full rounded-lg object-contain p-2"
                  />
                  {/* Hover overlay */}
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                    <Camera className="size-6 text-white" />
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-1.5 px-3 text-center">
                  <div className="rounded-full bg-muted p-2.5">
                    <ImageIcon className="size-5 text-muted-foreground" />
                  </div>
                  <span className="text-[11px] font-medium text-muted-foreground">
                    Tap to upload logo
                  </span>
                </div>
              )}
            </div>

            {/* Upload actions */}
            <div className="flex flex-1 flex-col gap-2.5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="size-4" />
                {logoUrl ? 'Replace logo' : 'Choose file'}
              </Button>
              {logoUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-destructive hover:text-destructive sm:w-auto"
                  onClick={() => setLogoUrl('')}
                  disabled={uploading}
                >
                  <X className="size-4" />
                  Remove logo
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                PNG, JPG, SVG, or WebP. Max 2MB. Recommended: 400&times;400px or larger.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Organisation details card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-serif text-base sm:text-lg">
            <Building2 className="size-4 sm:size-5 text-primary" />
            Organisation Details
          </CardTitle>
          <CardDescription>
            These details are used across your shows and printed materials.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="org-name">Club name</Label>
              <Input
                id="org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Clyde Valley GSD Club"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="org-email" className="flex items-center gap-1.5">
                <Mail className="size-3.5 text-muted-foreground" />
                Contact email
              </Label>
              <Input
                id="org-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="secretary@yourclub.co.uk"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="org-phone" className="flex items-center gap-1.5">
                <Phone className="size-3.5 text-muted-foreground" />
                Phone number
              </Label>
              <Input
                id="org-phone"
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="07700 900000"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="org-website" className="flex items-center gap-1.5">
                <Globe className="size-3.5 text-muted-foreground" />
                Website
              </Label>
              <Input
                id="org-website"
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://yourclub.co.uk"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save bar — fixed on mobile to avoid -mx negative margin overflow */}
      <div
        className={`
          fixed bottom-16 left-0 right-0 z-50 px-2 pb-2 pt-3 md:relative md:bottom-auto md:left-auto md:right-auto md:px-0 md:pb-0 md:pt-0
          transition-all duration-200
          ${isDirty ? 'opacity-100' : 'pointer-events-none opacity-0'}
        `}
      >
        <div className="mx-auto max-w-6xl flex items-center justify-between rounded-xl border bg-background/95 px-4 py-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:rounded-lg sm:shadow-md md:mx-0">
          <p className="text-sm text-muted-foreground">
            <span className="hidden sm:inline">You have </span>unsaved changes
          </p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => org && resetFormFromOrg(org, setters)}
              disabled={updateMutation.isPending}
            >
              Discard
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateMutation.isPending || !name.trim()}
            >
              {updateMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
