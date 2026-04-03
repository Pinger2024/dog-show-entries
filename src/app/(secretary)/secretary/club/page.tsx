'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Building2,
  Mail,
  Phone,
  Globe,
  Pencil,
  Plus,
  Trash2,
  Loader2,
  Users,
  Shield,
} from 'lucide-react';
import { PostcodeLookup } from '@/components/postcode-lookup';

const POSITION_OPTIONS = [
  'President',
  'Vice President',
  'Chairman',
  'Vice Chairman',
  'Honorary Secretary',
  'Honorary Treasurer',
  'Committee Member',
  'Show Manager',
  'Show Secretary',
  'Assistant Secretary',
  'Chief Steward',
  'Ring Steward',
  'Veterinary Surgeon',
  'Health & Safety Officer',
  'First Aid Officer',
  'Trophy Steward',
  'Field Officer',
] as const;

type PersonFormData = {
  name: string;
  position: string;
  email: string;
  phone: string;
  address: string;
  isGuarantor: boolean;
  notes: string;
};

const emptyForm: PersonFormData = {
  name: '',
  position: '',
  email: '',
  phone: '',
  address: '',
  isGuarantor: false,
  notes: '',
};

export default function MyClubPage() {
  const { data: org, isLoading: orgLoading } = trpc.secretary.getOrganisation.useQuery();
  const utils = trpc.useUtils();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<PersonFormData>(emptyForm);

  const { data: people, isLoading: peopleLoading } = trpc.secretary.listOrgPeople.useQuery(
    { organisationId: org?.id ?? '' },
    { enabled: !!org?.id }
  );

  const createMutation = trpc.secretary.createOrgPerson.useMutation({
    onSuccess: () => {
      utils.secretary.listOrgPeople.invalidate();
      toast.success('Person added');
      closeDialog();
    },
    onError: () => toast.error('Failed to add person'),
  });

  const updateMutation = trpc.secretary.updateOrgPerson.useMutation({
    onSuccess: () => {
      utils.secretary.listOrgPeople.invalidate();
      toast.success('Person updated');
      closeDialog();
    },
    onError: () => toast.error('Failed to update person'),
  });

  const deleteMutation = trpc.secretary.deleteOrgPerson.useMutation({
    onSuccess: () => {
      utils.secretary.listOrgPeople.invalidate();
      toast.success('Person removed');
      setDeleteId(null);
    },
    onError: () => toast.error('Failed to remove person'),
  });

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }, []);

  const openAdd = useCallback(() => {
    setForm(emptyForm);
    setEditingId(null);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((person: NonNullable<typeof people>[number]) => {
    setForm({
      name: person.name,
      position: person.position ?? '',
      email: person.email ?? '',
      phone: person.phone ?? '',
      address: person.address ?? '',
      isGuarantor: person.isGuarantor,
      notes: person.notes ?? '',
    });
    setEditingId(person.id);
    setDialogOpen(true);
  }, []);

  const handleSave = useCallback(() => {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }

    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        name: form.name.trim(),
        position: form.position || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        isGuarantor: form.isGuarantor,
        notes: form.notes.trim() || null,
      });
    } else if (org) {
      createMutation.mutate({
        organisationId: org.id,
        name: form.name.trim(),
        position: form.position || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        address: form.address.trim() || undefined,
        isGuarantor: form.isGuarantor,
        notes: form.notes.trim() || undefined,
      });
    }
  }, [form, editingId, org, createMutation, updateMutation]);

  const isSaving = createMutation.isPending || updateMutation.isPending;

  // Loading state
  if (orgLoading) {
    return (
      <div className="space-y-4 sm:space-y-6 pb-16 md:pb-0">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-48 animate-pulse rounded-xl bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  // No org found
  if (!org) {
    return (
      <div className="space-y-4 sm:space-y-6 pb-16 md:pb-0">
        <h1 className="font-serif text-lg font-bold tracking-tight sm:text-2xl">
          My Club
        </h1>
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="mx-auto size-10 text-muted-foreground/40" />
            <p className="mt-3 text-muted-foreground">
              No club registered yet. Register your club to start creating shows.
            </p>
            <Link href="/apply" className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition-colors hover:bg-primary/90">
              Register Your Club
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const guarantorCount = people?.filter((p) => p.isGuarantor).length ?? 0;
  const totalPeople = people?.length ?? 0;

  return (
    <div className="space-y-4 sm:space-y-6 pb-16 md:pb-0">
      {/* Header */}
      <div>
        <h1 className="font-serif text-lg font-bold tracking-tight sm:text-2xl">
          My Club
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Manage your club details, officials, and committee members
        </p>
      </div>

      {/* Section 1: Club Details */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 font-serif text-base sm:text-lg">
                <Building2 className="size-4 sm:size-5 text-primary" />
                Club Details
              </CardTitle>
              <CardDescription>
                Your organisation&apos;s profile and contact information
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild className="shrink-0">
              <Link href="/secretary/settings">
                <Pencil className="size-3.5" />
                Edit
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Org name + logo */}
            <div className="flex items-center gap-3">
              {org.logoUrl ? (
                <img
                  src={org.logoUrl}
                  alt={`${org.name} logo`}
                  className="size-12 shrink-0 rounded-lg border object-contain p-1"
                />
              ) : (
                <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border bg-muted/30">
                  <Building2 className="size-5 text-muted-foreground/50" />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-[0.9375rem] font-semibold">{org.name}</p>
                {org.kcRegNumber && (
                  <p className="text-xs text-muted-foreground">RKC Reg: {org.kcRegNumber}</p>
                )}
              </div>
            </div>

            {/* Contact details grid */}
            <div className="grid gap-2 sm:grid-cols-2">
              {org.contactEmail && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="size-3.5 shrink-0" />
                  <span className="truncate">{org.contactEmail}</span>
                </div>
              )}
              {org.contactPhone && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="size-3.5 shrink-0" />
                  <span>{org.contactPhone}</span>
                </div>
              )}
              {org.website && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2">
                  <Globe className="size-3.5 shrink-0" />
                  <a
                    href={org.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate hover:text-foreground hover:underline"
                  >
                    {org.website}
                  </a>
                </div>
              )}
              {!org.contactEmail && !org.contactPhone && !org.website && (
                <p className="text-sm text-muted-foreground/60 sm:col-span-2">
                  No contact details set.{' '}
                  <Link href="/secretary/settings" className="text-primary underline">
                    Add them in Settings
                  </Link>
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: People & Officials */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 font-serif text-base sm:text-lg">
                <Users className="size-4 sm:size-5 text-primary" />
                People &amp; Officials
              </CardTitle>
              <CardDescription>
                Club officers, committee members, and show officials
              </CardDescription>
            </div>
            <Button size="sm" onClick={openAdd} className="shrink-0">
              <Plus className="size-3.5" />
              <span className="hidden sm:inline">Add Person</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Guarantor count indicator */}
          <div className="mb-4 flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
            <Shield className="size-4 text-primary" />
            <p className="text-sm">
              <span className="font-medium">{guarantorCount} of {totalPeople}</span>{' '}
              <span className="text-muted-foreground">
                guarantors — RKC shows require guarantors including Chairman, Secretary &amp; Treasurer
              </span>
            </p>
          </div>

          {/* People list */}
          {peopleLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : !people?.length ? (
            <div className="py-8 text-center">
              <Users className="mx-auto size-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                No people added yet. Add your club officials and committee members.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {people.map((person) => (
                <div
                  key={person.id}
                  className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/30"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[0.9375rem] font-medium">{person.name}</span>
                      {person.position && (
                        <Badge variant="secondary" className="text-xs">
                          {person.position}
                        </Badge>
                      )}
                      {person.isGuarantor && (
                        <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                          <Shield className="mr-0.5 size-2.5" />
                          Guarantor
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:gap-x-4">
                      {person.email && (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Mail className="size-3" />
                          {person.email}
                        </span>
                      )}
                      {person.phone && (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Phone className="size-3" />
                          {person.phone}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9"
                      onClick={() => openEdit(person)}
                    >
                      <Pencil className="size-3.5" />
                      <span className="sr-only">Edit {person.name}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9 text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(person.id)}
                    >
                      <Trash2 className="size-3.5" />
                      <span className="sr-only">Delete {person.name}</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Person Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif">
              {editingId ? 'Edit Person' : 'Add Person'}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? 'Update this person\u2019s details and role.'
                : 'Add a new official or committee member to your club.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Position first — "I need to add a Chairman" is the mental model */}
            <div className="space-y-1.5">
              <Label htmlFor="person-position">Position</Label>
              <Select
                value={form.position}
                onValueChange={(v) => setForm((f) => ({ ...f, position: v }))}
              >
                <SelectTrigger id="person-position" className="h-10">
                  <SelectValue placeholder="Select a position" />
                </SelectTrigger>
                <SelectContent>
                  {POSITION_OPTIONS.map((pos) => (
                    <SelectItem key={pos} value={pos}>
                      {pos}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="person-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="person-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
              />
            </div>

            {/* Email & Phone */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="person-email">Email</Label>
                <Input
                  id="person-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="email@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="person-phone">Phone</Label>
                <Input
                  id="person-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="07700 900000"
                />
              </div>
            </div>

            {/* Address with PostcodeLookup */}
            <div className="space-y-1.5">
              <Label htmlFor="person-address">Address</Label>
              <PostcodeLookup
                compact
                onSelect={(result) =>
                  setForm((f) => ({ ...f, address: result.fullAddress }))
                }
              />
              <Textarea
                id="person-address"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Full address"
                rows={2}
                className="mt-1.5"
              />
            </div>

            {/* Guarantor */}
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox
                id="person-guarantor"
                checked={form.isGuarantor}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, isGuarantor: checked === true }))
                }
              />
              <div className="space-y-0.5">
                <Label htmlFor="person-guarantor" className="text-sm font-medium leading-none cursor-pointer">
                  Guarantor
                </Label>
                <p className="text-xs text-muted-foreground">
                  This person is a guarantor for the club&apos;s shows
                </p>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="person-notes">Notes</Label>
              <Textarea
                id="person-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Any additional notes..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={closeDialog} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !form.name.trim()}>
              {isSaving && <Loader2 className="size-4 animate-spin" />}
              {editingId ? 'Save Changes' : 'Add Person'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this person?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{' '}
              <span className="font-medium text-foreground">
                {people?.find((p) => p.id === deleteId)?.name}
              </span>{' '}
              from your club. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleteId) deleteMutation.mutate({ id: deleteId });
              }}
            >
              {deleteMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
