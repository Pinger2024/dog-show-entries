'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Award,
  Handshake,
  Loader2,
  Plus,
  Trash2,
  Pencil,
  ExternalLink,
  Trophy,
  Image as ImageIcon,
  Upload,
  ArrowRight,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import { uploadImage } from '@/lib/upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useShowId } from '../_lib/show-context';

const SPONSOR_CATEGORIES: Record<string, string> = {
  pet_food: 'Pet Food',
  insurance: 'Insurance',
  automotive: 'Automotive',
  grooming: 'Grooming',
  health_testing: 'Health Testing',
  pet_products: 'Pet Products',
  local_business: 'Local Business',
  breed_club: 'Breed Club',
  individual: 'Individual',
  other: 'Other',
};

const TIER_LABELS: Record<string, string> = {
  title: 'Title Sponsor',
  show: 'Show Sponsor',
  class: 'Class Sponsor',
  prize: 'Prize Sponsor',
  advertiser: 'Advertiser',
};

const TIER_COLORS: Record<string, string> = {
  title: 'bg-amber-100 text-amber-800',
  show: 'bg-violet-100 text-violet-800',
  class: 'bg-sky-100 text-sky-800',
  prize: 'bg-emerald-100 text-emerald-800',
  advertiser: 'bg-slate-100 text-slate-800',
};

/* ─── Sponsor Directory Tab ──────────────────────────── */

function SponsorDirectory({
  organisationId,
}: {
  organisationId: string;
}) {
  const utils = trpc.useUtils();
  const { data: sponsors, isLoading } = trpc.secretary.listSponsors.useQuery({
    organisationId,
  });
  const createMutation = trpc.secretary.createSponsor.useMutation({
    onSuccess: () => {
      utils.secretary.listSponsors.invalidate();
      toast.success('Sponsor added');
      setDialogOpen(false);
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });
  const updateMutation = trpc.secretary.updateSponsor.useMutation({
    onSuccess: () => {
      utils.secretary.listSponsors.invalidate();
      toast.success('Sponsor updated');
      setDialogOpen(false);
      setEditingId(null);
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.secretary.deleteSponsor.useMutation({
    onSuccess: () => {
      utils.secretary.listSponsors.invalidate();
      toast.success('Sponsor removed');
    },
    onError: (err) => toast.error(err.message),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [uploading, setUploading] = useState(false);

  function resetForm() {
    setName('');
    setContactName('');
    setContactEmail('');
    setWebsite('');
    setCategory('');
    setNotes('');
    setLogoUrl('');
  }

  function openEdit(sponsor: NonNullable<typeof sponsors>[number]) {
    setEditingId(sponsor.id);
    setName(sponsor.name);
    setContactName(sponsor.contactName ?? '');
    setContactEmail(sponsor.contactEmail ?? '');
    setWebsite(sponsor.website ?? '');
    setCategory(sponsor.category ?? '');
    setNotes(sponsor.notes ?? '');
    setLogoUrl(sponsor.logoUrl ?? '');
    setDialogOpen(true);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
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
  }

  function handleSubmit() {
    if (!name.trim()) return;
    const data = {
      name: name.trim(),
      contactName: contactName.trim() || undefined,
      contactEmail: contactEmail.trim() || undefined,
      website: website.trim() || undefined,
      category: category || undefined,
      notes: notes.trim() || undefined,
      logoUrl: logoUrl || undefined,
    } as Parameters<typeof createMutation.mutate>[0];

    if (editingId) {
      updateMutation.mutate({ id: editingId, ...data });
    } else {
      createMutation.mutate({ ...data, organisationId });
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      {/* Header — stacks on mobile */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Your sponsor directory — add sponsors here, then assign them to any show.
        </p>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) { setEditingId(null); resetForm(); }
        }}>
          <DialogTrigger asChild>
            <Button size="sm" className="min-h-[2.75rem] w-full sm:w-auto">
              <Plus className="size-4" />
              Add Sponsor
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Edit' : 'Add'} Sponsor</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Royal Canin" className="h-11" />
              </div>
              <div>
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SPONSOR_CATEGORIES).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Logo</Label>
                {logoUrl && (
                  <div className="mb-2">
                    <img src={logoUrl} alt="Logo" className="h-16 rounded border object-contain" />
                  </div>
                )}
                <Button variant="outline" size="sm" disabled={uploading} className="min-h-[2.75rem]" asChild>
                  <label className="cursor-pointer">
                    {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                    {uploading ? 'Uploading...' : 'Upload Logo'}
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                  </label>
                </Button>
              </div>
              {/* Stack on mobile, side-by-side on larger screens */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>Contact Name</Label>
                  <Input value={contactName} onChange={(e) => setContactName(e.target.value)} className="h-11" />
                </div>
                <div>
                  <Label>Contact Email</Label>
                  <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} type="email" className="h-11" />
                </div>
              </div>
              <div>
                <Label>Website</Label>
                <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" className="h-11" />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
              <Button
                onClick={handleSubmit}
                disabled={!name.trim() || createMutation.isPending || updateMutation.isPending}
                className="w-full min-h-[2.75rem]"
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                {editingId ? 'Save Changes' : 'Add Sponsor'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {!sponsors?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Handshake className="size-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm font-medium">No sponsors yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your first sponsor to get started. They&apos;ll appear here and can be assigned to any show.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sponsors.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex items-center gap-3 py-3 sm:gap-4">
                {s.logoUrl ? (
                  <img src={s.logoUrl} alt={s.name} className="size-10 rounded object-contain" />
                ) : (
                  <div className="flex size-10 items-center justify-center rounded bg-muted">
                    <ImageIcon className="size-5 text-muted-foreground/50" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{s.name}</p>
                  <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                    {s.category && <span>{SPONSOR_CATEGORIES[s.category] ?? s.category}</span>}
                    {s.website && (
                      <a href={s.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
                        Website <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                </div>
                {/* Action buttons — 44px touch targets */}
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" className="size-11" onClick={() => openEdit(s)}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11 text-destructive hover:text-destructive"
                    onClick={() => deleteMutation.mutate({ id: s.id })}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Show Sponsor Assignments Tab ──────────────────── */

function ShowSponsorAssignments({
  showId,
  organisationId,
  onSwitchToDirectory,
}: {
  showId: string;
  organisationId: string;
  onSwitchToDirectory: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: showSponsorList, isLoading } = trpc.secretary.listShowSponsors.useQuery({ showId });
  const { data: orgSponsors } = trpc.secretary.listSponsors.useQuery({ organisationId });
  const { data: classes } = trpc.shows.getClasses.useQuery({ showId });
  const assignMutation = trpc.secretary.assignShowSponsor.useMutation({
    onSuccess: () => {
      utils.secretary.listShowSponsors.invalidate();
      toast.success('Sponsor assigned to show');
      setAssignDialogOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });
  const removeMutation = trpc.secretary.removeShowSponsor.useMutation({
    onSuccess: () => {
      utils.secretary.listShowSponsors.invalidate();
      toast.success('Sponsor removed from show');
    },
    onError: (err) => toast.error(err.message),
  });
  const assignClassMutation = trpc.secretary.assignClassSponsorship.useMutation({
    onSuccess: () => {
      utils.secretary.listShowSponsors.invalidate();
      toast.success('Class sponsorship assigned');
      setClassDialogOpen(false);
      resetClassForm();
    },
    onError: (err) => toast.error(err.message),
  });
  const removeClassMutation = trpc.secretary.removeClassSponsorship.useMutation({
    onSuccess: () => {
      utils.secretary.listShowSponsors.invalidate();
      toast.success('Class sponsorship removed');
    },
  });

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedSponsorId, setSelectedSponsorId] = useState('');
  const [selectedTier, setSelectedTier] = useState('');
  const [customTitle, setCustomTitle] = useState('');

  const [classDialogOpen, setClassDialogOpen] = useState(false);
  const [classSponsorId, setClassSponsorId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [trophyName, setTrophyName] = useState('');
  const [trophyDonor, setTrophyDonor] = useState('');
  const [prizeDescription, setPrizeDescription] = useState('');

  function resetClassForm() {
    setClassSponsorId('');
    setSelectedClassId('');
    setTrophyName('');
    setTrophyDonor('');
    setPrizeDescription('');
  }

  // Sponsors not yet assigned to this show
  const assignedIds = new Set(showSponsorList?.map((ss) => ss.sponsorId) ?? []);
  const availableSponsors = orgSponsors?.filter((s) => !assignedIds.has(s.id)) ?? [];
  const hasDirectorySponsors = (orgSponsors?.length ?? 0) > 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      {/* Header — stacks on mobile */}
      <div className="mb-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          Assign sponsors from your directory to this show with their tier and visibility.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Dialog open={assignDialogOpen} onOpenChange={(open) => {
            setAssignDialogOpen(open);
            if (!open) { setSelectedSponsorId(''); setSelectedTier(''); setCustomTitle(''); }
          }}>
            <DialogTrigger asChild>
              <Button size="sm" className="min-h-[2.75rem] w-full sm:w-auto" disabled={!availableSponsors.length}>
                <Plus className="size-4" />
                Assign Sponsor
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Assign Sponsor to Show</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Sponsor *</Label>
                  <Select value={selectedSponsorId} onValueChange={setSelectedSponsorId}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="Select sponsor" /></SelectTrigger>
                    <SelectContent>
                      {availableSponsors.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tier *</Label>
                  <Select value={selectedTier} onValueChange={setSelectedTier}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="Select tier" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TIER_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Custom Title</Label>
                  <Input
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="e.g. Official Nutrition Partner"
                    className="h-11"
                  />
                </div>
                <Button
                  onClick={() => {
                    if (!selectedSponsorId || !selectedTier) return;
                    assignMutation.mutate({
                      showId,
                      sponsorId: selectedSponsorId,
                      tier: selectedTier as 'title' | 'show' | 'class' | 'prize' | 'advertiser',
                      customTitle: customTitle.trim() || undefined,
                    });
                  }}
                  disabled={!selectedSponsorId || !selectedTier || assignMutation.isPending}
                  className="w-full min-h-[2.75rem]"
                >
                  {assignMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                  Assign to Show
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={classDialogOpen} onOpenChange={(open) => {
            setClassDialogOpen(open);
            if (!open) resetClassForm();
          }}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="min-h-[2.75rem] w-full sm:w-auto" disabled={!orgSponsors?.length}>
                <Trophy className="size-4" />
                Class Sponsorship
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Assign Class Sponsorship</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Sponsor *</Label>
                  <Select value={classSponsorId} onValueChange={setClassSponsorId}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="Select sponsor" /></SelectTrigger>
                    <SelectContent>
                      {orgSponsors?.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Class *</Label>
                  <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="Select class" /></SelectTrigger>
                    <SelectContent>
                      {classes?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.classNumber ? `${c.classNumber}. ` : ''}{c.classDefinition.name}
                          {c.sex ? ` (${c.sex === 'dog' ? 'Dog' : 'Bitch'})` : ''}
                          {c.breed ? ` — ${c.breed.name}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Trophy Name</Label>
                  <Input value={trophyName} onChange={(e) => setTrophyName(e.target.value)} placeholder="The Dorado Memorial Trophy" className="h-11" />
                </div>
                <div>
                  <Label>Trophy Donor</Label>
                  <Input value={trophyDonor} onChange={(e) => setTrophyDonor(e.target.value)} placeholder="May differ from sponsor" className="h-11" />
                </div>
                <div>
                  <Label>Prize Description</Label>
                  <Input value={prizeDescription} onChange={(e) => setPrizeDescription(e.target.value)} placeholder="Best in class rosette" className="h-11" />
                </div>
                <Button
                  onClick={async () => {
                    if (!classSponsorId || !selectedClassId) return;
                    // Find or create a show sponsor for the selected org sponsor
                    const existing = showSponsorList?.find((ss) => ss.sponsorId === classSponsorId);
                    if (existing) {
                      // Already assigned to the show — use that show sponsor
                      assignClassMutation.mutate({
                        showSponsorId: existing.id,
                        showClassId: selectedClassId,
                        trophyName: trophyName.trim() || undefined,
                        trophyDonor: trophyDonor.trim() || undefined,
                        prizeDescription: prizeDescription.trim() || undefined,
                      });
                    } else {
                      // Auto-assign the sponsor to the show as a class-tier sponsor, then create class sponsorship
                      assignMutation.mutate(
                        {
                          showId,
                          sponsorId: classSponsorId,
                          tier: 'class' as const,
                        },
                        {
                          onSuccess: (newShowSponsor) => {
                            assignClassMutation.mutate({
                              showSponsorId: newShowSponsor.id,
                              showClassId: selectedClassId,
                              trophyName: trophyName.trim() || undefined,
                              trophyDonor: trophyDonor.trim() || undefined,
                              prizeDescription: prizeDescription.trim() || undefined,
                            });
                          },
                        }
                      );
                    }
                  }}
                  disabled={!classSponsorId || !selectedClassId || assignClassMutation.isPending || assignMutation.isPending}
                  className="w-full min-h-[2.75rem]"
                >
                  {(assignClassMutation.isPending || assignMutation.isPending) && <Loader2 className="size-4 animate-spin" />}
                  Assign Sponsorship
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {!showSponsorList?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Handshake className="size-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm font-medium">No sponsors assigned yet</p>
            {hasDirectorySponsors ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Use the &quot;Assign Sponsor&quot; button above to add sponsors from your directory.
              </p>
            ) : (
              <>
                <p className="mt-1 text-sm text-muted-foreground">
                  You need to add sponsors to your directory first, then assign them here.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 min-h-[2.75rem]"
                  onClick={onSwitchToDirectory}
                >
                  Go to Sponsor Directory
                  <ArrowRight className="size-4" />
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {showSponsorList.map((ss) => (
            <Card key={ss.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {ss.sponsor.logoUrl ? (
                      <img src={ss.sponsor.logoUrl} alt={ss.sponsor.name} className="size-10 shrink-0 rounded object-contain" />
                    ) : (
                      <div className="flex size-10 shrink-0 items-center justify-center rounded bg-muted">
                        <Handshake className="size-5 text-muted-foreground/50" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-medium truncate">{ss.sponsor.name}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className={TIER_COLORS[ss.tier]}>
                          {TIER_LABELS[ss.tier]}
                        </Badge>
                        {ss.customTitle && (
                          <span className="text-xs text-muted-foreground truncate">{ss.customTitle}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11 shrink-0 text-destructive hover:text-destructive"
                    onClick={() => removeMutation.mutate({ id: ss.id })}
                    disabled={removeMutation.isPending}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                {ss.classSponsorships?.length > 0 && (
                  <div className="mt-3 border-t pt-3">
                    <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Class Sponsorships
                    </p>
                    <div className="space-y-1.5">
                      {ss.classSponsorships.map((cs) => (
                        <div key={cs.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">
                              {cs.showClass?.classNumber ? `${cs.showClass.classNumber}. ` : ''}
                              {cs.showClass?.classDefinition?.name ?? 'Class'}
                              {cs.showClass?.breed && (
                                <span className="text-muted-foreground"> — {cs.showClass.breed.name}</span>
                              )}
                            </p>
                            {cs.trophyName && (
                              <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-600">
                                <Trophy className="size-3 shrink-0" />
                                <span className="truncate">{cs.trophyName}</span>
                              </p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-10 shrink-0 text-destructive hover:text-destructive"
                            onClick={() => removeClassMutation.mutate({ id: cs.id })}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Class Sponsorship Tab — Inline-Editable Spreadsheet ──── */

/* ─── Autocomplete Input ────────────────────────────── */

type Suggestion = { sponsor_name: string; sponsor_affix: string | null };

function AutocompleteInput({
  value,
  onChange,
  onBlur,
  onTab,
  suggestions,
  placeholder,
  onPickSuggestion,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  onTab?: () => void;
  suggestions: Suggestion[];
  placeholder?: string;
  onPickSuggestion?: (s: Suggestion) => void;
  className?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!value.trim()) return suggestions;
    const lower = value.toLowerCase();
    return suggestions.filter((s) =>
      s.sponsor_name.toLowerCase().includes(lower)
    );
  }, [value, suggestions]);

  const showDropdown = focused && filtered.length > 0;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Tab') {
        setFocused(false);
        onBlur?.();
        onTab?.();
        // don't prevent default — let focus naturally move to next cell
        return;
      }
      if (!showDropdown) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && highlightIdx >= 0) {
        e.preventDefault();
        const picked = filtered[highlightIdx];
        if (picked) {
          onChange(picked.sponsor_name);
          onPickSuggestion?.(picked);
          setFocused(false);
        }
      } else if (e.key === 'Escape') {
        setFocused(false);
      }
    },
    [showDropdown, highlightIdx, filtered, onChange, onPickSuggestion, onBlur, onTab]
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setHighlightIdx(-1);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          // Delay to allow dropdown click to register
          setTimeout(() => {
            if (!wrapperRef.current?.contains(document.activeElement)) {
              setFocused(false);
              onBlur?.();
            }
          }, 150);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={cn(
          'h-9 w-full rounded-none border-0 bg-transparent px-2 text-sm outline-none',
          'focus:bg-blue-50/50 focus:ring-1 focus:ring-inset focus:ring-blue-400',
          'placeholder:text-muted-foreground/40',
          className
        )}
      />
      {showDropdown && (
        <div className="absolute left-0 top-full z-50 max-h-48 w-full min-w-[200px] overflow-auto rounded-b-md border border-t-0 bg-popover shadow-md">
          {filtered.map((s, i) => (
            <button
              key={`${s.sponsor_name}-${s.sponsor_affix ?? ''}`}
              type="button"
              className={cn(
                'flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-accent',
                i === highlightIdx && 'bg-accent'
              )}
              onMouseDown={(e) => {
                e.preventDefault(); // prevent blur
                onChange(s.sponsor_name);
                onPickSuggestion?.(s);
                setFocused(false);
              }}
            >
              <span className="font-medium">{s.sponsor_name}</span>
              {s.sponsor_affix && (
                <span className="text-xs text-muted-foreground">{s.sponsor_affix}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Editable Sponsorship Row ──────────────────────── */

type ClassSponsorship = {
  id: string;
  showClassId: string;
  sponsorName: string | null;
  sponsorAffix: string | null;
  trophyName: string | null;
};

function SponsorshipRow({
  sponsorship,
  suggestions,
  onSaved,
  onRemoved,
}: {
  sponsorship: ClassSponsorship;
  suggestions: Suggestion[];
  onSaved: () => void;
  onRemoved: () => void;
}) {
  const [name, setName] = useState(sponsorship.sponsorName ?? '');
  const [affix, setAffix] = useState(sponsorship.sponsorAffix ?? '');
  const [trophy, setTrophy] = useState(sponsorship.trophyName ?? '');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const mobileRowRef = useRef<HTMLDivElement>(null);

  const updateMutation = trpc.secretary.updateClassSponsor.useMutation({
    onSuccess: () => onSaved(),
    onError: (err) => toast.error(err.message),
  });
  const removeMutation = trpc.secretary.removeClassSponsorship.useMutation({
    onSuccess: () => onRemoved(),
    onError: (err) => toast.error(err.message),
  });

  const debouncedSave = useCallback(
    (field: 'sponsorName' | 'sponsorAffix' | 'trophyName', value: string) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        // If name is cleared, delete the sponsorship
        if (field === 'sponsorName' && !value.trim()) {
          removeMutation.mutate({ id: sponsorship.id });
          return;
        }
        updateMutation.mutate({
          id: sponsorship.id,
          [field]: field === 'sponsorName' ? value : (value || null),
        });
      }, 500);
    },
    [sponsorship.id, updateMutation, removeMutation]
  );

  // Don't save on blur if focus moved to another field in the same row
  const handleBlur = useCallback(
    (field: 'sponsorName' | 'sponsorAffix' | 'trophyName', value: string) => {
      setTimeout(() => {
        const active = document.activeElement;
        if (
          (rowRef.current && rowRef.current.contains(active)) ||
          (mobileRowRef.current && mobileRowRef.current.contains(active))
        ) {
          return; // focus stayed within the row — skip auto-save
        }
        debouncedSave(field, value);
      }, 50);
    },
    [debouncedSave]
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const handlePickSuggestion = useCallback(
    (s: Suggestion) => {
      setName(s.sponsor_name);
      if (s.sponsor_affix) {
        setAffix(s.sponsor_affix);
        // Save both fields
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
          updateMutation.mutate({
            id: sponsorship.id,
            sponsorName: s.sponsor_name,
            sponsorAffix: s.sponsor_affix,
          });
        }, 300);
      } else {
        debouncedSave('sponsorName', s.sponsor_name);
      }
    },
    [sponsorship.id, updateMutation, debouncedSave]
  );

  return (
    <>
      {/* Desktop: inline cells */}
      <div ref={rowRef} className="hidden sm:contents">
        <div className="border-b border-r">
          <AutocompleteInput
            value={name}
            onChange={(v) => {
              setName(v);
              debouncedSave('sponsorName', v);
            }}
            suggestions={suggestions}
            placeholder="Sponsor name"
            onPickSuggestion={handlePickSuggestion}
            onBlur={() => handleBlur('sponsorName', name)}
          />
        </div>
        <div className="border-b border-r">
          <input
            type="text"
            value={affix}
            onChange={(e) => {
              setAffix(e.target.value);
              debouncedSave('sponsorAffix', e.target.value);
            }}
            onBlur={() => handleBlur('sponsorAffix', affix)}
            placeholder="Affix"
            className="h-9 w-full rounded-none border-0 bg-transparent px-2 text-sm outline-none focus:bg-blue-50/50 focus:ring-1 focus:ring-inset focus:ring-blue-400 placeholder:text-muted-foreground/40"
          />
        </div>
        <div className="border-b border-r">
          <input
            type="text"
            value={trophy}
            onChange={(e) => {
              setTrophy(e.target.value);
              debouncedSave('trophyName', e.target.value);
            }}
            onBlur={() => handleBlur('trophyName', trophy)}
            placeholder="Trophy"
            className="h-9 w-full rounded-none border-0 bg-transparent px-2 text-sm outline-none focus:bg-blue-50/50 focus:ring-1 focus:ring-inset focus:ring-blue-400 placeholder:text-muted-foreground/40"
          />
        </div>
        <div className="flex items-center justify-center border-b">
          <button
            type="button"
            onClick={() => removeMutation.mutate({ id: sponsorship.id })}
            disabled={removeMutation.isPending}
            className="flex size-7 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            {removeMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <X className="size-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile: stacked fields */}
      <div ref={mobileRowRef} className="sm:hidden">
        <div className="flex items-start gap-2 rounded-md border bg-card p-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Sponsor</label>
              <AutocompleteInput
                value={name}
                onChange={(v) => {
                  setName(v);
                  debouncedSave('sponsorName', v);
                }}
                suggestions={suggestions}
                placeholder="Sponsor name"
                onPickSuggestion={handlePickSuggestion}
                onBlur={() => handleBlur('sponsorName', name)}
                className="mt-0.5 rounded-md border bg-background px-2"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Affix</label>
                <input
                  type="text"
                  value={affix}
                  onChange={(e) => {
                    setAffix(e.target.value);
                    debouncedSave('sponsorAffix', e.target.value);
                  }}
                  onBlur={() => handleBlur('sponsorAffix', affix)}
                  placeholder="Affix"
                  className="mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-muted-foreground/40"
                />
              </div>
              <div>
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Trophy</label>
                <input
                  type="text"
                  value={trophy}
                  onChange={(e) => {
                    setTrophy(e.target.value);
                    debouncedSave('trophyName', e.target.value);
                  }}
                  onBlur={() => handleBlur('trophyName', trophy)}
                  placeholder="Trophy"
                  className="mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-muted-foreground/40"
                />
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => removeMutation.mutate({ id: sponsorship.id })}
            disabled={removeMutation.isPending}
            className="mt-4 flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            {removeMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <X className="size-3.5" />
            )}
          </button>
        </div>
      </div>
    </>
  );
}

/* ─── New Sponsorship Row (empty, for adding) ───────── */

function NewSponsorshipRow({
  showClassId,
  suggestions,
  onCreated,
}: {
  showClassId: string;
  suggestions: Suggestion[];
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [affix, setAffix] = useState('');
  const [trophy, setTrophy] = useState('');
  const [isActive, setIsActive] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const mobileRowRef = useRef<HTMLDivElement>(null);

  const createMutation = trpc.secretary.upsertClassSponsor.useMutation({
    onSuccess: () => {
      setName('');
      setAffix('');
      setTrophy('');
      setIsActive(false);
      onCreated();
    },
    onError: (err) => toast.error(err.message),
  });

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const trySave = useCallback(() => {
    if (!name.trim()) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      createMutation.mutate({
        showClassId,
        sponsorName: name.trim(),
        sponsorAffix: affix.trim() || undefined,
        trophyName: trophy.trim() || undefined,
      });
    }, 500);
  }, [name, affix, trophy, showClassId, createMutation]);

  // Don't save on blur if focus moved to another field in the same row
  const handleRowBlur = useCallback(() => {
    setTimeout(() => {
      const active = document.activeElement;
      if (
        (rowRef.current && rowRef.current.contains(active)) ||
        (mobileRowRef.current && mobileRowRef.current.contains(active))
      ) {
        return; // focus stayed within the row — skip auto-save
      }
      trySave();
    }, 50);
  }, [trySave]);

  const handlePickSuggestion = useCallback(
    (s: Suggestion) => {
      setName(s.sponsor_name);
      if (s.sponsor_affix) setAffix(s.sponsor_affix);
      setIsActive(true);
      // Auto-save after picking a suggestion
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        createMutation.mutate({
          showClassId,
          sponsorName: s.sponsor_name,
          sponsorAffix: s.sponsor_affix ?? undefined,
          trophyName: trophy.trim() || undefined,
        });
      }, 800);
    },
    [showClassId, trophy, createMutation]
  );

  if (!isActive) {
    return (
      <>
        {/* Desktop: + button in the grid */}
        <div className="hidden sm:contents">
          <div className="border-b border-r">
            <button
              type="button"
              onClick={() => setIsActive(true)}
              className="flex h-9 w-full items-center gap-1.5 px-2 text-xs text-muted-foreground/50 transition-colors hover:bg-muted/50 hover:text-muted-foreground"
            >
              <Plus className="size-3" />
              Add sponsor
            </button>
          </div>
          <div className="border-b border-r" />
          <div className="border-b border-r" />
          <div className="border-b" />
        </div>
        {/* Mobile: + button */}
        <div className="sm:hidden">
          <button
            type="button"
            onClick={() => setIsActive(true)}
            className="flex min-h-[2.75rem] w-full items-center justify-center gap-1.5 rounded-md border border-dashed text-xs text-muted-foreground transition-colors hover:bg-muted/50"
          >
            <Plus className="size-3.5" />
            Add sponsor
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Desktop: inline cells */}
      <div ref={rowRef} className="hidden sm:contents">
        <div className="border-b border-r bg-blue-50/30">
          <AutocompleteInput
            value={name}
            onChange={(v) => setName(v)}
            suggestions={suggestions}
            placeholder="Type sponsor name..."
            onPickSuggestion={handlePickSuggestion}
            onBlur={handleRowBlur}
            className="bg-blue-50/30"
          />
        </div>
        <div className="border-b border-r bg-blue-50/30">
          <input
            type="text"
            value={affix}
            onChange={(e) => setAffix(e.target.value)}
            onBlur={handleRowBlur}
            placeholder="Affix"
            className="h-9 w-full rounded-none border-0 bg-transparent px-2 text-sm outline-none focus:bg-blue-50/50 focus:ring-1 focus:ring-inset focus:ring-blue-400 placeholder:text-muted-foreground/40"
          />
        </div>
        <div className="border-b border-r bg-blue-50/30">
          <input
            type="text"
            value={trophy}
            onChange={(e) => setTrophy(e.target.value)}
            onBlur={handleRowBlur}
            placeholder="Trophy"
            className="h-9 w-full rounded-none border-0 bg-transparent px-2 text-sm outline-none focus:bg-blue-50/50 focus:ring-1 focus:ring-inset focus:ring-blue-400 placeholder:text-muted-foreground/40"
          />
        </div>
        <div className="flex items-center justify-center border-b bg-blue-50/30">
          <button
            type="button"
            onClick={() => {
              setName('');
              setAffix('');
              setTrophy('');
              setIsActive(false);
            }}
            className="flex size-7 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-muted hover:text-muted-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Mobile: stacked fields */}
      <div ref={mobileRowRef} className="sm:hidden">
        <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50/30 p-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Sponsor</label>
              <AutocompleteInput
                value={name}
                onChange={(v) => setName(v)}
                suggestions={suggestions}
                placeholder="Type sponsor name..."
                onPickSuggestion={handlePickSuggestion}
                onBlur={handleRowBlur}
                className="mt-0.5 rounded-md border bg-background px-2"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Affix</label>
                <input
                  type="text"
                  value={affix}
                  onChange={(e) => setAffix(e.target.value)}
                  onBlur={handleRowBlur}
                  placeholder="Affix"
                  className="mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-muted-foreground/40"
                />
              </div>
              <div>
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Trophy</label>
                <input
                  type="text"
                  value={trophy}
                  onChange={(e) => setTrophy(e.target.value)}
                  onBlur={handleRowBlur}
                  placeholder="Trophy"
                  className="mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-muted-foreground/40"
                />
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setName('');
              setAffix('');
              setTrophy('');
              setIsActive(false);
            }}
            className="mt-4 flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-muted hover:text-muted-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    </>
  );
}

/* ─── Best Award Types ────────────────────────────── */

const BEST_AWARDS = [
  'Best of Breed',
  'Best Dog',
  'Best Bitch',
  'Best Puppy Dog',
  'Best Puppy Bitch',
  'Best Long Coat Dog',
  'Best Long Coat Bitch',
  'Best Long Coat in Show',
  'Best in Show',
  'Reserve Best in Show',
] as const;

type AwardSponsor = {
  award: string;
  sponsorName: string;
  sponsorAffix?: string;
  trophyName?: string;
};

/* ─── Award Sponsorship Row (editable) ─────────────── */

function AwardSponsorshipRow({
  entry,
  entryIndex,
  allEntries,
  suggestions,
  onSave,
}: {
  entry: AwardSponsor;
  entryIndex: number;
  allEntries: AwardSponsor[];
  suggestions: Suggestion[];
  onSave: (updated: AwardSponsor[]) => void;
}) {
  const [name, setName] = useState(entry.sponsorName);
  const [affix, setAffix] = useState(entry.sponsorAffix ?? '');
  const [trophy, setTrophy] = useState(entry.trophyName ?? '');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const mobileRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const debouncedSave = useCallback(
    (field: 'sponsorName' | 'sponsorAffix' | 'trophyName', value: string) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        // If name is cleared, remove the entry
        if (field === 'sponsorName' && !value.trim()) {
          const updated = allEntries.filter((_, i) => i !== entryIndex);
          onSave(updated);
          return;
        }
        const updated = allEntries.map((e, i) => {
          if (i !== entryIndex) return e;
          return {
            ...e,
            [field]: field === 'sponsorName' ? value.trim() : (value.trim() || undefined),
          };
        });
        onSave(updated);
      }, 500);
    },
    [allEntries, entryIndex, onSave]
  );

  // Don't save on blur if focus moved to another field in the same row
  const handleBlur = useCallback(
    (field: 'sponsorName' | 'sponsorAffix' | 'trophyName', value: string) => {
      setTimeout(() => {
        const active = document.activeElement;
        if (
          (rowRef.current && rowRef.current.contains(active)) ||
          (mobileRowRef.current && mobileRowRef.current.contains(active))
        ) {
          return; // focus stayed within the row — skip auto-save
        }
        debouncedSave(field, value);
      }, 50);
    },
    [debouncedSave]
  );

  const handleRemove = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const updated = allEntries.filter((_, i) => i !== entryIndex);
    onSave(updated);
  }, [allEntries, entryIndex, onSave]);

  const handlePickSuggestion = useCallback(
    (s: Suggestion) => {
      setName(s.sponsor_name);
      if (s.sponsor_affix) {
        setAffix(s.sponsor_affix);
      }
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const updated = allEntries.map((e, i) => {
          if (i !== entryIndex) return e;
          return {
            ...e,
            sponsorName: s.sponsor_name,
            sponsorAffix: s.sponsor_affix ?? undefined,
          };
        });
        onSave(updated);
      }, 300);
    },
    [allEntries, entryIndex, onSave]
  );

  return (
    <>
      {/* Desktop: inline cells */}
      <div ref={rowRef} className="hidden sm:contents">
        <div className="border-b border-r">
          <AutocompleteInput
            value={name}
            onChange={(v) => {
              setName(v);
              debouncedSave('sponsorName', v);
            }}
            suggestions={suggestions}
            placeholder="Sponsor name"
            onPickSuggestion={handlePickSuggestion}
            onBlur={() => handleBlur('sponsorName', name)}
          />
        </div>
        <div className="border-b border-r">
          <input
            type="text"
            value={affix}
            onChange={(e) => {
              setAffix(e.target.value);
              debouncedSave('sponsorAffix', e.target.value);
            }}
            onBlur={() => handleBlur('sponsorAffix', affix)}
            placeholder="Affix"
            className="h-9 w-full rounded-none border-0 bg-transparent px-2 text-sm outline-none focus:bg-blue-50/50 focus:ring-1 focus:ring-inset focus:ring-blue-400 placeholder:text-muted-foreground/40"
          />
        </div>
        <div className="border-b border-r">
          <input
            type="text"
            value={trophy}
            onChange={(e) => {
              setTrophy(e.target.value);
              debouncedSave('trophyName', e.target.value);
            }}
            onBlur={() => handleBlur('trophyName', trophy)}
            placeholder="Trophy"
            className="h-9 w-full rounded-none border-0 bg-transparent px-2 text-sm outline-none focus:bg-blue-50/50 focus:ring-1 focus:ring-inset focus:ring-blue-400 placeholder:text-muted-foreground/40"
          />
        </div>
        <div className="flex items-center justify-center border-b">
          <button
            type="button"
            onClick={handleRemove}
            className="flex size-7 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Mobile: stacked fields */}
      <div ref={mobileRowRef} className="sm:hidden">
        <div className="flex items-start gap-2 rounded-md border bg-card p-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Sponsor</label>
              <AutocompleteInput
                value={name}
                onChange={(v) => {
                  setName(v);
                  debouncedSave('sponsorName', v);
                }}
                suggestions={suggestions}
                placeholder="Sponsor name"
                onPickSuggestion={handlePickSuggestion}
                onBlur={() => handleBlur('sponsorName', name)}
                className="mt-0.5 rounded-md border bg-background px-2"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Affix</label>
                <input
                  type="text"
                  value={affix}
                  onChange={(e) => {
                    setAffix(e.target.value);
                    debouncedSave('sponsorAffix', e.target.value);
                  }}
                  onBlur={() => handleBlur('sponsorAffix', affix)}
                  placeholder="Affix"
                  className="mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-muted-foreground/40"
                />
              </div>
              <div>
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Trophy</label>
                <input
                  type="text"
                  value={trophy}
                  onChange={(e) => {
                    setTrophy(e.target.value);
                    debouncedSave('trophyName', e.target.value);
                  }}
                  onBlur={() => handleBlur('trophyName', trophy)}
                  placeholder="Trophy"
                  className="mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-muted-foreground/40"
                />
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            className="mt-4 flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    </>
  );
}

/* ─── New Award Sponsorship Row ──────────────────── */

function NewAwardSponsorshipRow({
  award,
  allEntries,
  suggestions,
  onSave,
}: {
  award: string;
  allEntries: AwardSponsor[];
  suggestions: Suggestion[];
  onSave: (updated: AwardSponsor[]) => void;
}) {
  const [name, setName] = useState('');
  const [affix, setAffix] = useState('');
  const [trophy, setTrophy] = useState('');
  const [isActive, setIsActive] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const mobileRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const trySave = useCallback(() => {
    if (!name.trim()) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const newEntry: AwardSponsor = {
        award,
        sponsorName: name.trim(),
        sponsorAffix: affix.trim() || undefined,
        trophyName: trophy.trim() || undefined,
      };
      onSave([...allEntries, newEntry]);
      setName('');
      setAffix('');
      setTrophy('');
      setIsActive(false);
    }, 500);
  }, [name, affix, trophy, award, allEntries, onSave]);

  // Don't save on blur if focus moved to another field in the same row
  const handleRowBlur = useCallback(() => {
    setTimeout(() => {
      const active = document.activeElement;
      if (
        (rowRef.current && rowRef.current.contains(active)) ||
        (mobileRowRef.current && mobileRowRef.current.contains(active))
      ) {
        return; // focus stayed within the row — skip auto-save
      }
      trySave();
    }, 50);
  }, [trySave]);

  const handlePickSuggestion = useCallback(
    (s: Suggestion) => {
      setName(s.sponsor_name);
      if (s.sponsor_affix) setAffix(s.sponsor_affix);
      setIsActive(true);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const newEntry: AwardSponsor = {
          award,
          sponsorName: s.sponsor_name,
          sponsorAffix: s.sponsor_affix ?? undefined,
          trophyName: trophy.trim() || undefined,
        };
        onSave([...allEntries, newEntry]);
        setName('');
        setAffix('');
        setTrophy('');
        setIsActive(false);
      }, 800);
    },
    [award, allEntries, trophy, onSave]
  );

  if (!isActive) {
    return (
      <>
        {/* Desktop: + button in the grid */}
        <div className="hidden sm:contents">
          <div className="border-b border-r">
            <button
              type="button"
              onClick={() => setIsActive(true)}
              className="flex h-9 w-full items-center gap-1.5 px-2 text-xs text-muted-foreground/50 transition-colors hover:bg-muted/50 hover:text-muted-foreground"
            >
              <Plus className="size-3" />
              Add sponsor
            </button>
          </div>
          <div className="border-b border-r" />
          <div className="border-b border-r" />
          <div className="border-b" />
        </div>
        {/* Mobile: + button */}
        <div className="sm:hidden">
          <button
            type="button"
            onClick={() => setIsActive(true)}
            className="flex min-h-[2.75rem] w-full items-center justify-center gap-1.5 rounded-md border border-dashed text-xs text-muted-foreground transition-colors hover:bg-muted/50"
          >
            <Plus className="size-3.5" />
            Add sponsor
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Desktop: inline cells */}
      <div ref={rowRef} className="hidden sm:contents">
        <div className="border-b border-r bg-blue-50/30">
          <AutocompleteInput
            value={name}
            onChange={(v) => setName(v)}
            suggestions={suggestions}
            placeholder="Type sponsor name..."
            onPickSuggestion={handlePickSuggestion}
            onBlur={handleRowBlur}
            className="bg-blue-50/30"
          />
        </div>
        <div className="border-b border-r bg-blue-50/30">
          <input
            type="text"
            value={affix}
            onChange={(e) => setAffix(e.target.value)}
            onBlur={handleRowBlur}
            placeholder="Affix"
            className="h-9 w-full rounded-none border-0 bg-transparent px-2 text-sm outline-none focus:bg-blue-50/50 focus:ring-1 focus:ring-inset focus:ring-blue-400 placeholder:text-muted-foreground/40"
          />
        </div>
        <div className="border-b border-r bg-blue-50/30">
          <input
            type="text"
            value={trophy}
            onChange={(e) => setTrophy(e.target.value)}
            onBlur={handleRowBlur}
            placeholder="Trophy"
            className="h-9 w-full rounded-none border-0 bg-transparent px-2 text-sm outline-none focus:bg-blue-50/50 focus:ring-1 focus:ring-inset focus:ring-blue-400 placeholder:text-muted-foreground/40"
          />
        </div>
        <div className="flex items-center justify-center border-b bg-blue-50/30">
          <button
            type="button"
            onClick={() => {
              setName('');
              setAffix('');
              setTrophy('');
              setIsActive(false);
            }}
            className="flex size-7 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-muted hover:text-muted-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Mobile: stacked fields */}
      <div ref={mobileRowRef} className="sm:hidden">
        <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50/30 p-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Sponsor</label>
              <AutocompleteInput
                value={name}
                onChange={(v) => setName(v)}
                suggestions={suggestions}
                placeholder="Type sponsor name..."
                onPickSuggestion={handlePickSuggestion}
                onBlur={handleRowBlur}
                className="mt-0.5 rounded-md border bg-background px-2"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Affix</label>
                <input
                  type="text"
                  value={affix}
                  onChange={(e) => setAffix(e.target.value)}
                  onBlur={handleRowBlur}
                  placeholder="Affix"
                  className="mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-muted-foreground/40"
                />
              </div>
              <div>
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Trophy</label>
                <input
                  type="text"
                  value={trophy}
                  onChange={(e) => setTrophy(e.target.value)}
                  onBlur={handleRowBlur}
                  placeholder="Trophy"
                  className="mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-muted-foreground/40"
                />
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setName('');
              setAffix('');
              setTrophy('');
              setIsActive(false);
            }}
            className="mt-4 flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-muted hover:text-muted-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    </>
  );
}

/* ─── Class Sponsorship Table (Inline-Editable Spreadsheet) ─── */

function ClassSponsorshipTable({
  showId,
  organisationId,
}: {
  showId: string;
  organisationId: string;
}) {
  const utils = trpc.useUtils();
  const { data: classes, isLoading: classesLoading } = trpc.secretary.getClassesWithSponsorships.useQuery({ showId });
  const { data: suggestions } = trpc.secretary.getSponsorNameSuggestions.useQuery({ organisationId });
  const { data: show } = trpc.shows.getById.useQuery({ id: showId });

  const updateScheduleData = trpc.secretary.updateScheduleData.useMutation({
    onSuccess: () => {
      utils.shows.getById.invalidate({ id: showId });
    },
    onError: (err) => toast.error(err.message),
  });

  const awardSponsors: AwardSponsor[] = useMemo(
    () => (show?.scheduleData as Record<string, unknown> | null)?.awardSponsors as AwardSponsor[] ?? [],
    [show?.scheduleData]
  );

  const saveAwardSponsors = useCallback(
    (updated: AwardSponsor[]) => {
      if (!show) return;
      const existing = (show.scheduleData ?? {}) as Record<string, unknown>;
      updateScheduleData.mutate({
        showId,
        scheduleData: {
          ...existing,
          awardSponsors: updated,
        } as Parameters<typeof updateScheduleData.mutate>[0]['scheduleData'],
      });
    },
    [show, showId, updateScheduleData]
  );

  const invalidate = useCallback(() => {
    utils.secretary.getClassesWithSponsorships.invalidate({ showId });
    utils.secretary.getSponsorNameSuggestions.invalidate({ organisationId });
  }, [utils, showId, organisationId]);

  const suggestionsList = suggestions ?? [];

  // Group classes by sex: Dog first, then Bitch, then ungendered
  const groupedClasses = useMemo(() => {
    if (!classes) return { dog: [], bitch: [], other: [] };
    const dog = classes.filter((c) => c.sex === 'dog');
    const bitch = classes.filter((c) => c.sex === 'bitch');
    const other = classes.filter((c) => !c.sex);
    return { dog, bitch, other };
  }, [classes]);

  // Count stats
  const stats = useMemo(() => {
    if (!classes) return { total: 0, sponsored: 0, sponsorships: 0, needSponsors: 0 };
    let sponsorships = 0;
    let sponsored = 0;
    for (const cls of classes) {
      const count = cls.classSponsorships?.length ?? 0;
      sponsorships += count;
      if (count > 0) sponsored++;
    }
    return {
      total: classes.length,
      sponsored,
      sponsorships,
      needSponsors: classes.length - sponsored,
    };
  }, [classes]);

  if (classesLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!classes || classes.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Trophy className="size-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">No classes configured</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add classes to this show first, then you can assign sponsors here.
          </p>
        </CardContent>
      </Card>
    );
  }

  type ShowClass = (typeof classes)[number];

  function renderAwardsSection() {
    // Group existing award sponsors by award name
    const awardMap = new Map<string, { entries: AwardSponsor[]; indices: number[] }>();
    awardSponsors.forEach((entry, idx) => {
      const existing = awardMap.get(entry.award);
      if (existing) {
        existing.entries.push(entry);
        existing.indices.push(idx);
      } else {
        awardMap.set(entry.award, { entries: [entry], indices: [idx] });
      }
    });

    return (
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-2">
          <Award className="size-4 text-amber-600" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-800">Best Awards</h3>
        </div>

        {/* Desktop: spreadsheet grid */}
        <div className="hidden overflow-hidden rounded-md border sm:block">
          {/* Header */}
          <div className="grid grid-cols-[minmax(140px,1.2fr)_minmax(120px,1fr)_minmax(100px,0.8fr)_minmax(100px,0.8fr)_36px] border-b-2 bg-amber-50/80 text-xs font-medium uppercase tracking-wider text-amber-800/70">
            <div className="border-r px-2 py-2">Award</div>
            <div className="border-r px-2 py-2">Sponsor Name</div>
            <div className="border-r px-2 py-2">Affix</div>
            <div className="border-r px-2 py-2">Trophy</div>
            <div className="px-1 py-2" />
          </div>

          {/* Rows */}
          {BEST_AWARDS.map((award, awardIdx) => {
            const data = awardMap.get(award);
            const entries = data?.entries ?? [];
            const indices = data?.indices ?? [];
            const rowBg = awardIdx % 2 === 0 ? '' : 'bg-muted/20';

            return (
              <div key={award} className={rowBg}>
                <div className="grid grid-cols-[minmax(140px,1.2fr)_minmax(120px,1fr)_minmax(100px,0.8fr)_minmax(100px,0.8fr)_36px]">
                  {/* Award label cell — spans all sponsorship rows */}
                  <div
                    className="flex items-start border-b border-r px-2 py-2 text-sm font-medium"
                    style={{
                      gridRow: `1 / span ${entries.length + 1}`,
                    }}
                  >
                    {award}
                  </div>

                  {/* Existing award sponsorship rows */}
                  {entries.map((entry, localIdx) => (
                    <AwardSponsorshipRow
                      key={`${award}-${indices[localIdx]}`}
                      entry={entry}
                      entryIndex={indices[localIdx]!}
                      allEntries={awardSponsors}
                      suggestions={suggestionsList}
                      onSave={saveAwardSponsors}
                    />
                  ))}

                  {/* Add new row */}
                  <NewAwardSponsorshipRow
                    award={award}
                    allEntries={awardSponsors}
                    suggestions={suggestionsList}
                    onSave={saveAwardSponsors}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Mobile: card-based layout */}
        <div className="space-y-2 sm:hidden">
          {BEST_AWARDS.map((award) => {
            const data = awardMap.get(award);
            const entries = data?.entries ?? [];
            const indices = data?.indices ?? [];

            return (
              <div key={award} className="rounded-lg border bg-card">
                <div className="border-b bg-amber-50/50 px-3 py-2">
                  <p className="text-sm font-medium">{award}</p>
                </div>
                <div className="space-y-2 p-2">
                  {entries.map((entry, localIdx) => (
                    <AwardSponsorshipRow
                      key={`${award}-${indices[localIdx]}`}
                      entry={entry}
                      entryIndex={indices[localIdx]!}
                      allEntries={awardSponsors}
                      suggestions={suggestionsList}
                      onSave={saveAwardSponsors}
                    />
                  ))}
                  <NewAwardSponsorshipRow
                    award={award}
                    allEntries={awardSponsors}
                    suggestions={suggestionsList}
                    onSave={saveAwardSponsors}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderSection(
    title: string,
    icon: React.ReactNode,
    sectionClasses: ShowClass[],
    colorClass: string,
  ) {
    if (sectionClasses.length === 0) return null;

    return (
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-2">
          {icon}
          <h3 className={cn('text-sm font-semibold uppercase tracking-wider', colorClass)}>{title}</h3>
        </div>

        {/* Desktop: spreadsheet grid */}
        <div className="hidden overflow-hidden rounded-md border sm:block">
          {/* Header */}
          <div className="grid grid-cols-[minmax(140px,1.2fr)_minmax(120px,1fr)_minmax(100px,0.8fr)_minmax(100px,0.8fr)_36px] border-b-2 bg-muted/60 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <div className="border-r px-2 py-2">Class / Award</div>
            <div className="border-r px-2 py-2">Sponsor Name</div>
            <div className="border-r px-2 py-2">Affix</div>
            <div className="border-r px-2 py-2">Trophy</div>
            <div className="px-1 py-2" />
          </div>

          {/* Rows */}
          {sectionClasses.map((cls, idx) => {
            const sponsorships = cls.classSponsorships ?? [];
            const displayLabel = `#${cls.classNumber ?? '?'} ${cls.classDefinition.name}`;
            const rowBg = idx % 2 === 0 ? '' : 'bg-muted/20';

            return (
              <div key={cls.id} className={rowBg}>
                {/* One sub-grid per class: class label spans all sponsorship rows */}
                <div className="grid grid-cols-[minmax(140px,1.2fr)_minmax(120px,1fr)_minmax(100px,0.8fr)_minmax(100px,0.8fr)_36px]">
                  {/* Class label cell — spans all sponsorship rows */}
                  <div
                    className="flex items-start border-b border-r px-2 py-2 text-sm font-medium"
                    style={{
                      gridRow: `1 / span ${sponsorships.length + 1}`,
                    }}
                  >
                    {displayLabel}
                  </div>

                  {/* Existing sponsorship rows */}
                  {sponsorships.map((sp) => (
                    <SponsorshipRow
                      key={sp.id}
                      sponsorship={sp}
                      suggestions={suggestionsList}
                      onSaved={invalidate}
                      onRemoved={invalidate}
                    />
                  ))}

                  {/* Add new row */}
                  <NewSponsorshipRow
                    showClassId={cls.id}
                    suggestions={suggestionsList}
                    onCreated={invalidate}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Mobile: card-based layout */}
        <div className="space-y-2 sm:hidden">
          {sectionClasses.map((cls) => {
            const sponsorships = cls.classSponsorships ?? [];
            const displayLabel = `#${cls.classNumber ?? '?'} ${cls.classDefinition.name}`;

            return (
              <div key={cls.id} className="rounded-lg border bg-card">
                <div className="border-b px-3 py-2">
                  <p className="text-sm font-medium">{displayLabel}</p>
                </div>
                <div className="space-y-2 p-2">
                  {sponsorships.map((sp) => (
                    <SponsorshipRow
                      key={sp.id}
                      sponsorship={sp}
                      suggestions={suggestionsList}
                      onSaved={invalidate}
                      onRemoved={invalidate}
                    />
                  ))}
                  <NewSponsorshipRow
                    showClassId={cls.id}
                    suggestions={suggestionsList}
                    onCreated={invalidate}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        Manage class and award sponsorships — tap any cell to edit.
      </p>

      {renderAwardsSection()}

      {renderSection(
        'Dog Classes',
        <Trophy className="size-4 text-sky-600" />,
        groupedClasses.dog,
        'text-sky-800',
      )}
      {renderSection(
        'Bitch Classes',
        <Trophy className="size-4 text-pink-600" />,
        groupedClasses.bitch,
        'text-pink-800',
      )}
      {renderSection(
        'Other Classes',
        <Trophy className="size-4 text-violet-600" />,
        groupedClasses.other,
        'text-violet-800',
      )}

      {/* Summary stats */}
      <div className="flex flex-wrap gap-4 rounded-lg bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
        <span>
          <strong className="text-foreground">{stats.total}</strong> classes
        </span>
        <span>
          <strong className="text-foreground">{stats.sponsorships}</strong> sponsorships
        </span>
        <span>
          <strong className="text-foreground">{stats.sponsored}</strong> sponsored
        </span>
        <span>
          <strong className="text-foreground">{stats.needSponsors}</strong> need sponsors
        </span>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────── */

export default function SponsorsPage() {
  const showId = useShowId();
  const [activeTab, setActiveTab] = useState('assignments');

  // Get show to retrieve organisationId
  const { data: show } = trpc.shows.getById.useQuery({ id: showId });

  if (!show) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-serif text-lg font-semibold">Sponsors</h2>
        <p className="text-sm text-muted-foreground">
          Manage your sponsor directory and assign sponsors to this show. RKC regulations require all sponsorships to be acknowledged in schedules and catalogues.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="assignments">Show Sponsors</TabsTrigger>
          <TabsTrigger value="table">Class Sponsorship</TabsTrigger>
          <TabsTrigger value="directory">Sponsor Directory</TabsTrigger>
        </TabsList>
        <TabsContent value="assignments" className="mt-4">
          <ShowSponsorAssignments
            showId={showId}
            organisationId={show.organisationId}
            onSwitchToDirectory={() => setActiveTab('directory')}
          />
        </TabsContent>
        <TabsContent value="table" className="mt-4">
          <ClassSponsorshipTable
            showId={showId}
            organisationId={show.organisationId}
          />
        </TabsContent>
        <TabsContent value="directory" className="mt-4">
          <SponsorDirectory organisationId={show.organisationId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
