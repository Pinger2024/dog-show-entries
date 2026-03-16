'use client';

import { useState } from 'react';
import {
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
} from 'lucide-react';
import { toast } from 'sonner';
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
          <TabsTrigger value="directory">Sponsor Directory</TabsTrigger>
        </TabsList>
        <TabsContent value="assignments" className="mt-4">
          <ShowSponsorAssignments
            showId={showId}
            organisationId={show.organisationId}
            onSwitchToDirectory={() => setActiveTab('directory')}
          />
        </TabsContent>
        <TabsContent value="directory" className="mt-4">
          <SponsorDirectory organisationId={show.organisationId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
